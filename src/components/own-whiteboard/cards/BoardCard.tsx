'use client';

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { nearestVideo } from '../core/materials';
import type { BoardCardProps } from '../core/types';
import {
  buildChatRequest,
  captureCurrentFrame,
  describeDownloadResult,
  downloadRequest,
  isolatedHtml,
  normalizeMessages,
  parseBoardOperations,
  readApiResponse,
  safeWebUrl,
  stringValue,
} from './helpers';

const column: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  minHeight: 0,
};
const panel: CSSProperties = {
  ...column,
  padding: 14,
  flex: 1,
  overflow: 'auto',
};
const muted: CSSProperties = {
  color: '#64748b',
  fontSize: 12,
  lineHeight: 1.6,
  margin: 0,
};
const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #cbd5e1',
  borderRadius: 7,
  background: '#fff',
  color: '#172b4d',
  padding: '8px 10px',
  font: 'inherit',
  minWidth: 0,
};
const buttonStyle: CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 7,
  padding: '7px 11px',
  background: '#fff',
  color: '#2454a4',
  font: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
  flexShrink: 0,
};
const primaryStyle: CSSProperties = {
  ...buttonStyle,
  borderColor: '#2563eb',
  background: '#2563eb',
  color: '#fff',
};
const preStyle: CSSProperties = {
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  fontFamily: 'inherit',
  margin: 0,
  lineHeight: 1.7,
};

function Button({
  children,
  primary,
  disabled,
  onClick,
  style,
  type = 'button',
}: {
  children: ReactNode;
  primary?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...(primary ? primaryStyle : buttonStyle),
        ...style,
        ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}),
      }}
    >
      {children}
    </button>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return message ? (
    <p
      role="alert"
      style={{
        margin: 0,
        padding: '9px 10px',
        borderRadius: 7,
        background: '#fff1f2',
        color: '#b4233c',
        fontSize: 12,
        lineHeight: 1.6,
        overflowWrap: 'anywhere',
      }}
    >
      {message}
    </p>
  ) : null;
}

function RequestBoundaryNotice() {
  return (
    <p style={muted}>
      切页、关闭或撤销只会停止本地等待，不保证取消服务端任务。重试前请先确认结果，避免重复消耗。
    </p>
  );
}

/** A job is only started by the user's click; no retries or effect-triggered API calls. */
function useJob(timeoutMs = 65_000) {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(true);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
    };
  }, []);
  async function run(job: (signal: AbortSignal) => Promise<void>) {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setRunning(true);
    setError('');
    const timer = setTimeout(() => request.abort(), timeoutMs);
    try {
      await job(request.signal);
    } catch (cause) {
      if (active.current)
        setError(
          request.signal.aborted
            ? '请求等待超时；服务端可能仍在处理，请先确认结果后再重试。'
            : cause instanceof Error
              ? cause.message
              : '请求失败，请检查网络后重试。'
        );
    } finally {
      clearTimeout(timer);
      controller.current = null;
      if (active.current) setRunning(false);
    }
  }
  return { running, error, run, setError };
}

async function postJson(path: string, body: unknown, signal: AbortSignal) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  return readApiResponse(response);
}

function AITerminal(props: BoardCardProps) {
  const { shape, shapes, updateProps, insertShape, updateShapeProps, notify } =
    props;
  const [draft, setDraft] = useState('');
  const job = useJob();
  const messages = normalizeMessages(shape.props.messages);
  const log = useRef<HTMLDivElement>(null);
  const applied = Array.isArray(shape.props.appliedMessages)
    ? shape.props.appliedMessages.filter(
        (value): value is number => typeof value === 'number'
      )
    : [];
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages.length]);
  function send() {
    if (!props.interactive || !draft.trim() || job.running) return;
    const next = [
      ...messages,
      { role: 'user' as const, content: draft.trim() },
    ];
    let body: ReturnType<typeof buildChatRequest>;
    try {
      body = buildChatRequest(next, shapes);
    } catch (error) {
      job.setError((error as Error).message);
      return;
    }
    setDraft('');
    updateProps({ messages: next });
    void job.run(async (signal) => {
      const data = await postJson('/api/whiteboard/chat', body, signal);
      if (signal.aborted) return;
      const reply = stringValue(data.message);
      if (!reply.trim()) throw new Error('AI 返回内容为空，未生成任何卡片。');
      updateProps({
        messages: [...next, { role: 'assistant', content: reply }],
      });
    });
  }
  function apply(index: number, content: string) {
    if (!props.interactive || applied.includes(index)) return;
    const parsed = parseBoardOperations(content, shapes);
    let count = 0;
    for (const operation of parsed.operations) {
      if (operation.action === 'create') {
        insertShape(operation.type, operation.props);
        count++;
      } else if (operation.id && updateShapeProps) {
        updateShapeProps(operation.id, operation.props);
        count++;
      }
    }
    if (count) updateProps({ appliedMessages: [...applied, index] });
    notify(
      count
        ? `已应用 ${count} 项操作${parsed.skipped ? `；忽略 ${parsed.skipped} 项不支持或无效操作` : ''}`
        : '没有可应用的操作；不会执行删除或任意代码。'
    );
  }
  return (
    <>
      <div
        ref={log}
        role="log"
        aria-label="AI 对话历史"
        aria-live="polite"
        style={panel}
      >
        {!messages.length && (
          <div style={{ margin: 'auto 0', textAlign: 'center' }}>
            <p style={{ fontSize: 18, fontWeight: 650 }}>从一个想法开始</p>
            <p style={muted}>提问、梳理思路，或请 AI 制作一张内容卡片。</p>
          </div>
        )}
        {messages
          .filter((message) => message.role !== 'system')
          .map((message, visibleIndex) => {
            const index = messages.indexOf(message);
            const actions =
              message.role === 'assistant'
                ? parseBoardOperations(message.content, shapes)
                : null;
            return (
              <div
                key={`${index}-${visibleIndex}`}
                style={{
                  alignSelf:
                    message.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '95%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: message.role === 'user' ? '#eaf2ff' : '#f7f9fc',
                  border: '1px solid #e5eaf1',
                }}
              >
                <div style={{ ...muted, fontSize: 10, marginBottom: 5 }}>
                  {message.role === 'user' ? '你' : 'AI'}
                </div>
                {actions && (actions.operations.length || actions.skipped) ? (
                  <>
                    <p style={preStyle}>
                      {actions.summary || 'AI 返回了白板操作，请确认后应用。'}
                    </p>
                    <details style={{ margin: '8px 0' }}>
                      <summary
                        style={{
                          cursor: 'pointer',
                          color: '#64748b',
                          fontSize: 11,
                        }}
                      >
                        查看返回内容
                      </summary>
                      <pre style={{ ...preStyle, fontSize: 11 }}>
                        {message.content}
                      </pre>
                    </details>
                    <Button
                      disabled={
                        !actions.operations.length || applied.includes(index)
                      }
                      onClick={() => apply(index, message.content)}
                    >
                      {applied.includes(index)
                        ? '已应用'
                        : `应用 ${actions.operations.length} 项到白板`}
                    </Button>
                    {!!actions.skipped && (
                      <p style={muted}>
                        已忽略 {actions.skipped} 项不支持、锁定或无效操作。
                      </p>
                    )}
                  </>
                ) : (
                  <p style={preStyle}>{message.content}</p>
                )}
              </div>
            );
          })}
        {job.running && <output style={muted}>AI 正在回复…</output>}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        style={{ ...column, padding: 12, borderTop: '1px solid #e2e8f0' }}
      >
        <ErrorNotice message={job.error} />
        <textarea
          aria-label="发送给 AI 的消息"
          rows={2}
          value={draft}
          maxLength={30000}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="输入消息，Enter 发送，Shift + Enter 换行"
          style={{ ...inputStyle, resize: 'none' }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <span style={muted}>需登录及对应会员权限</span>
          <Button primary type="submit" disabled={job.running || !draft.trim()}>
            {job.running ? '请求中…' : '发送'}
          </Button>
        </div>
        <RequestBoundaryNotice />
      </form>
    </>
  );
}

function HtmlPreview({ shape, updateProps }: BoardCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const html = stringValue(shape.props.html);
  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '9px 12px',
          alignItems: 'center',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <span style={{ ...muted, flex: 1 }}>
          隔离预览 · 禁止访问宿主及外部接口
        </span>
        <Button
          onClick={() => {
            setDraft(html);
            setEditing(!editing);
          }}
        >
          {editing ? '返回预览' : '编辑源码'}
        </Button>
        {editing && (
          <Button
            primary
            onClick={() => {
              updateProps({ html: draft });
              setEditing(false);
            }}
          >
            保存并预览
          </Button>
        )}
      </div>
      {editing ? (
        <div style={panel}>
          <textarea
            aria-label="HTML 源码"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={200000}
            spellCheck={false}
            style={{
              ...inputStyle,
              flex: 1,
              resize: 'none',
              fontFamily: 'ui-monospace, monospace',
              minHeight: 100,
              fontSize: 12,
            }}
          />
        </div>
      ) : html ? (
        <iframe
          title={stringValue(shape.props.title, 'HTML 隔离预览')}
          srcDoc={isolatedHtml(html)}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          style={{
            width: '100%',
            flex: 1,
            minHeight: 0,
            border: 0,
            background: '#fff',
          }}
        />
      ) : (
        <div style={panel}>
          <p style={muted}>还没有 HTML 内容。点击「编辑源码」开始。</p>
        </div>
      )}
    </>
  );
}

function AIResult({ shape, updateProps, insertShape }: BoardCardProps) {
  const text = stringValue(shape.props.text, stringValue(shape.props.result));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const url = safeWebUrl(text);
  const isImage = url && /\.(png|jpe?g|gif|webp|avif)(?:[?#].*)?$/i.test(url);
  const html = /^\s*(?:<!doctype html|<html|<body|<div)/i.test(text);
  return (
    <div style={panel}>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        {html && (
          <Button onClick={() => insertShape('preview_html', { html: text })}>
            在隔离卡片预览
          </Button>
        )}
        <Button
          onClick={() => {
            setDraft(text);
            setEditing(!editing);
          }}
        >
          {editing ? '取消' : '编辑内容'}
        </Button>
      </div>
      {editing ? (
        <>
          <textarea
            aria-label="结果内容"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={200000}
            style={{ ...inputStyle, flex: 1, minHeight: 80, resize: 'none' }}
          />
          <Button
            primary
            onClick={() => {
              updateProps({ text: draft });
              setEditing(false);
            }}
          >
            保存内容
          </Button>
        </>
      ) : (
        <>
          {isImage && (
            <img
              src={url}
              alt="AI 结果中的图片"
              loading="lazy"
              referrerPolicy="no-referrer"
              draggable={false}
              style={{
                maxWidth: '100%',
                maxHeight: 240,
                objectFit: 'contain',
                borderRadius: 8,
              }}
            />
          )}
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#2563eb', overflowWrap: 'anywhere' }}
            >
              {url}
            </a>
          ) : (
            <p style={preStyle}>{text || '结果内容会显示在这里。'}</p>
          )}
        </>
      )}
    </div>
  );
}

type BlogItem = {
  title: string;
  description: string;
  image: string;
  date: string;
  url: string;
  category: string;
};

export const ARTICLE_LINK_FOOTER_HEIGHT = 36;

/** Reserve the card chrome, padding, search and close controls before sizing results. */
export function articlePickerListHeight(
  cardHeight: number,
  hasReadLink = false
): number {
  return Math.max(
    72,
    Math.min(
      200,
      (Number.isFinite(cardHeight) ? cardHeight : 280) -
        176 -
        (hasReadLink ? ARTICLE_LINK_FOOTER_HEIGHT : 0)
    )
  );
}

function BlogPost({ shape, updateProps }: BoardCardProps) {
  const [posts, setPosts] = useState<BlogItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [choosing, setChoosing] = useState(false);
  const job = useJob();
  const url = safeWebUrl(shape.props.url);
  const image = safeWebUrl(shape.props.image);
  const date = stringValue(shape.props.date).slice(0, 10);
  const listHeight = articlePickerListHeight(shape.h, Boolean(url));
  function load() {
    setChoosing(true);
    void job.run(async (signal) => {
      const data = await readApiResponse(
        await fetch('/api/whiteboard/blog-posts?locale=zh', { signal })
      );
      if (!Array.isArray(data.posts)) throw new Error('文章列表格式无效。');
      setPosts(
        data.posts.flatMap((post) => {
          if (!post || typeof post !== 'object') return [];
          const item = post as Record<string, unknown>;
          const link = safeWebUrl(item.url);
          if (!link || !stringValue(item.title)) return [];
          return [
            {
              title: stringValue(item.title),
              description: stringValue(item.description),
              image: safeWebUrl(item.image),
              date: stringValue(item.date),
              url: link,
              category: stringValue(item.whiteboardCategory),
            },
          ];
        })
      );
    });
  }
  return (
    <div style={panel}>
      {!choosing && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
          }}
        >
          {date && <time style={muted}>{date}</time>}
          <Button
            disabled={job.running}
            onClick={load}
            style={{
              marginLeft: 'auto',
              ...(url && {
                fontSize: muted.fontSize,
                minHeight: 28,
                padding: '3px 9px',
              }),
            }}
          >
            {job.running ? '加载中…' : url ? '更换文章' : '选择文章'}
          </Button>
        </div>
      )}
      <ErrorNotice message={job.error} />
      {choosing && (
        <section
          aria-label="选择博客文章"
          style={{
            ...column,
            flexShrink: 0,
            padding: 10,
            border: '1px solid #dbeafe',
            borderRadius: 9,
            background: '#f8fbff',
          }}
        >
          <input
            type="search"
            aria-label="搜索文章"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索文章标题"
            style={{ ...inputStyle, flexShrink: 0 }}
          />
          <section
            aria-label="文章列表"
            aria-busy={job.running}
            style={{
              height: listHeight,
              minHeight: listHeight,
              maxHeight: 200,
              flexShrink: 0,
              overflow: 'auto',
              display: 'grid',
              gridAutoRows: 'max-content',
              alignContent: 'start',
              gap: 6,
            }}
          >
            {job.running && !posts && <p style={muted}>正在加载文章…</p>}
            {posts
              ?.filter((post) =>
                post.title.toLowerCase().includes(query.toLowerCase())
              )
              .map((post) => (
                <button
                  type="button"
                  key={post.url}
                  onClick={() => {
                    updateProps(post);
                    setChoosing(false);
                  }}
                  style={{ ...buttonStyle, textAlign: 'left' }}
                >
                  {post.title}
                </button>
              ))}
            {posts &&
              !posts.some((post) =>
                post.title.toLowerCase().includes(query.toLowerCase())
              ) && <p style={muted}>没有匹配的文章。</p>}
          </section>
          {job.error && (
            <Button disabled={job.running} onClick={load}>
              重新加载文章
            </Button>
          )}
          <Button onClick={() => setChoosing(false)}>关闭列表</Button>
        </section>
      )}
      {!choosing && (
        <>
          {image && (
            <img
              src={image}
              alt="文章封面"
              draggable={false}
              referrerPolicy="no-referrer"
              style={{
                width: '100%',
                maxHeight: url
                  ? Math.min(160, Math.max(72, shape.h - 224))
                  : 160,
                objectFit: 'cover',
                borderRadius: 8,
              }}
            />
          )}
          <h3 style={{ margin: 0, fontSize: 18, lineHeight: 1.45 }}>
            {stringValue(shape.props.title) || '把一篇文章放到白板上'}
          </h3>
          <p style={{ ...muted, fontSize: 13 }}>
            {stringValue(shape.props.description) ||
              '从已有文章中选择，保留封面、摘要和阅读入口。'}
          </p>
          {stringValue(shape.props.category) && (
            <span style={{ ...muted, color: '#2563eb' }}>
              {stringValue(shape.props.category)}
            </span>
          )}
        </>
      )}
    </div>
  );
}

function DownloadSkill({ shape, updateProps }: BoardCardProps) {
  const [accountName, setAccountName] = useState(
    stringValue(shape.props.accountName)
  );
  const [keyword, setKeyword] = useState(stringValue(shape.props.keyword));
  const [afterDate, setAfterDate] = useState(
    stringValue(shape.props.afterDate)
  );
  const [limit, setLimit] = useState(String(shape.props.limit ?? 5));
  const [confirmed, setConfirmed] = useState(false);
  const job = useJob(900_000);
  function submit() {
    if (!confirmed || job.running) return;
    let body: ReturnType<typeof downloadRequest>;
    try {
      body = downloadRequest({ accountName, keyword, afterDate, limit });
    } catch (error) {
      job.setError((error as Error).message);
      return;
    }
    updateProps({ ...body, afterDate: afterDate || '', result: '' });
    void job.run(async (signal) => {
      try {
        const data = await postJson(
          '/api/skill/wxvideo-download',
          body,
          signal
        );
        if (!signal.aborted)
          updateProps({ result: describeDownloadResult(data) });
      } catch (error) {
        if (error instanceof TypeError)
          throw new Error(
            '下载连接中断，服务器任务可能仍在进行。请先核查保存目录，不要立即重复提交。'
          );
        throw error;
      }
    });
  }
  if (shape.props.skillId && shape.props.skillId !== 'wxvideo-download')
    return (
      <div style={panel}>
        <p style={muted}>
          当前仅支持视频号下载技能。旧技能信息已保留，未调用未知接口。
        </p>
      </div>
    );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      style={panel}
    >
      <p style={muted}>
        按账号和标题关键词下载视频。需要管理员权限，可能消耗已配置的第三方采集额度。
      </p>
      <label style={column}>
        账号名称
        <input
          required
          maxLength={100}
          value={accountName}
          onChange={(event) => setAccountName(event.target.value)}
          placeholder="输入视频号名称"
          style={inputStyle}
        />
      </label>
      <label style={column}>
        标题关键词
        <input
          required
          maxLength={200}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="筛选要下载的视频"
          style={inputStyle}
        />
      </label>
      <div style={{ display: 'flex', gap: 10 }}>
        <label style={{ ...column, flex: 2 }}>
          最早发布日期
          <input
            type="date"
            value={afterDate}
            onChange={(event) => setAfterDate(event.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ ...column, flex: 1 }}>
          数量
          <input
            type="number"
            min={1}
            max={10}
            step={1}
            required
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            style={inputStyle}
          />
        </label>
      </div>
      <p style={muted}>
        文件只保存到服务器专用目录（由管理员配置），不会直接下载到本机。
      </p>
      <RequestBoundaryNotice />
      <label
        style={{ ...muted, display: 'flex', gap: 7, alignItems: 'flex-start' }}
      >
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        我确认有权下载这些内容，并同意本次使用采集额度。
      </label>
      <Button
        primary
        type="submit"
        disabled={
          job.running || !confirmed || !accountName.trim() || !keyword.trim()
        }
      >
        {job.running ? '下载处理中，请勿重复提交…' : '运行下载'}
      </Button>
      <ErrorNotice message={job.error} />
      {stringValue(shape.props.result) && (
        <output
          style={{
            ...preStyle,
            padding: 10,
            background: '#f1f5f9',
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          {stringValue(shape.props.result)}
        </output>
      )}
    </form>
  );
}

function VideoPlayer({ shape, resolveAsset, updateProps }: BoardCardProps) {
  const storedUrl = stringValue(
    shape.props.url,
    stringValue(shape.props.src, stringValue(shape.props.videoUrl))
  );
  const asset =
    typeof shape.props.assetId === 'string'
      ? resolveAsset(shape.props.assetId)
      : undefined;
  const src = safeWebUrl(asset || storedUrl, true);
  const [draft, setDraft] = useState(storedUrl);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(!src);
  useEffect(() => {
    setError('');
  }, [src, shape.props.crossOrigin]);
  function save() {
    const next = safeWebUrl(draft);
    if (!next) {
      setError(
        '请输入有效的 http/https 视频地址，不支持脚本、data 或第三方嵌入代码。'
      );
      return;
    }
    updateProps({ url: next, src: next, videoUrl: next, assetId: undefined });
    setEditing(false);
    setError('');
  }
  return (
    <>
      <div
        style={{
          flex: 1,
          minHeight: 80,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#eef3fa',
          overflow: 'hidden',
        }}
      >
        {src ? (
          // biome-ignore lint/a11y/useMediaCaption: User-provided source videos may not include caption tracks; do not invent captions.
          <video
            key={`${src}-${!!shape.props.crossOrigin}`}
            src={src}
            data-board-video={shape.id}
            controls
            playsInline
            preload="metadata"
            crossOrigin={shape.props.crossOrigin ? 'anonymous' : undefined}
            onError={() =>
              setError(
                '视频加载失败。请检查地址、格式和访问权限；开启跨域取帧时视频源还需允许 CORS。'
              )
            }
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <p style={{ ...muted, textAlign: 'center', padding: 20 }}>
            {shape.props.assetId
              ? '本地视频素材暂不可用，请通过画布上传或重新导入。'
              : '从画布上传视频，或填写视频直链。'}
          </p>
        )}
      </div>
      <div style={{ ...column, padding: '10px 12px' }}>
        <ErrorNotice message={error} />
        {editing && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
            style={{ display: 'flex', gap: 6 }}
          >
            <input
              aria-label="视频地址"
              type="url"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="https://…/video.mp4"
              style={inputStyle}
            />
            <Button primary type="submit">
              载入
            </Button>
          </form>
        )}
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <label
            style={{ ...muted, display: 'flex', gap: 5, alignItems: 'center' }}
          >
            <input
              type="checkbox"
              checked={!!shape.props.crossOrigin}
              onChange={(event) =>
                updateProps({ crossOrigin: event.target.checked })
              }
            />
            跨域取帧（视频源需允许）
          </label>
          <Button
            onClick={() => {
              setDraft(storedUrl);
              setEditing(!editing);
            }}
          >
            {editing ? '收起' : '更换地址'}
          </Button>
        </div>
      </div>
    </>
  );
}

function VideoAnalyzer({
  shape,
  shapes,
  updateProps,
  insertShape,
}: BoardCardProps) {
  const videos = shapes.filter(
    (item) => item.type === 'video_player' || item.type === 'video'
  );
  const selected = stringValue(shape.props.videoId);
  // A manual choice remains fixed. Otherwise moving the card is enough to
  // select nearby material; the user still explicitly starts each analysis.
  const target = selected
    ? videos.find((video) => video.id === selected)
    : nearestVideo(shape, shapes);
  const [preview, setPreview] = useState('');
  const job = useJob();
  function analyze() {
    if (!target || job.running) return;
    void job.run(async (signal) => {
      const video = Array.from(
        document.querySelectorAll<HTMLVideoElement>('video[data-board-video]')
      ).find((item) => item.dataset.boardVideo === target.id);
      if (!video)
        throw new Error(
          '目标播放器未加载。请先在当前白板打开该视频并定位到目标帧。尚未调用 AI。'
        );
      const frame = captureCurrentFrame(video);
      setPreview(`data:image/jpeg;base64,${frame.frameBase64}`);
      const videoName = stringValue(
        target.props.fileName,
        stringValue(target.props.title, '白板视频')
      ).slice(0, 200);
      const data = await postJson(
        '/api/ai/video-analyze',
        { frameBase64: frame.frameBase64, mimeType: 'image/jpeg', videoName },
        signal
      );
      if (signal.aborted) return;
      const analysis = stringValue(data.analysis);
      if (!analysis.trim()) throw new Error('AI 返回的分析为空。');
      updateProps({
        result: analysis,
        analysis,
        frameTime: frame.time,
        analyzedVideoName: videoName,
        analyzedVideoId: target.id,
      });
    });
  }
  const result = stringValue(
    shape.props.result,
    stringValue(shape.props.analysis)
  );
  return (
    <div style={panel}>
      <label style={column}>
        视频来源
        <select
          value={selected}
          onChange={(event) => updateProps({ videoId: event.target.value })}
          disabled={job.running}
          style={inputStyle}
        >
          <option value="">自动关联附近视频</option>
          {selected && !videos.some((video) => video.id === selected) && (
            <option value={selected}>原视频已移除，请重新选择</option>
          )}
          {videos.map((video) => (
            <option key={video.id} value={video.id}>
              {stringValue(
                video.props.fileName,
                stringValue(video.props.title, `视频 ${video.id.slice(-5)}`)
              )}
            </option>
          ))}
        </select>
      </label>
      <p
        style={{ ...muted, color: target ? '#175cff' : '#64748b' }}
        aria-live="polite"
      >
        {target
          ? `${selected ? '已固定' : '已关联附近视频'}：${stringValue(target.props.title, stringValue(target.props.fileName, '视频'))}`
          : selected
            ? '固定的视频已不存在，请重新选择或切回自动关联。'
            : '把这张卡片拖到视频旁边（边缘距离 120 以内），即可自动关联；也可以手动选择。'}
      </p>
      <p style={muted}>
        先在播放器定位到目标画面。点击后只分析当前一帧，不会自动扫描或分析整段视频；需要管理员权限，会调用
        AI。
      </p>
      <RequestBoundaryNotice />
      <Button primary disabled={!target || job.running} onClick={analyze}>
        {job.running ? '正在分析当前帧…' : '截取并分析当前帧'}
      </Button>
      <ErrorNotice message={job.error} />
      {preview && (
        <img
          src={preview}
          alt="本次提交给 AI 的视频帧"
          style={{
            width: '100%',
            maxHeight: 150,
            objectFit: 'contain',
            borderRadius: 7,
          }}
        />
      )}
      {result && (
        <>
          <p style={muted}>
            分析记录：{stringValue(shape.props.analyzedVideoName, '视频')}
            {typeof shape.props.frameTime === 'number'
              ? ` · ${shape.props.frameTime.toFixed(2)} 秒`
              : ''}
          </p>
          <pre style={preStyle}>{result}</pre>
          <Button
            onClick={() =>
              insertShape('ai_result', {
                title: `${stringValue(shape.props.analyzedVideoName, '视频')} · 分析结果`,
                text: result,
                ...(typeof shape.props.analyzedVideoId === 'string'
                  ? { sourceVideoId: shape.props.analyzedVideoId }
                  : {}),
              })
            }
          >
            把分析结果放到白板
          </Button>
        </>
      )}
      {!videos.length && (
        <p style={muted}>当前页面还没有视频卡片。请先通过画布上传视频。</p>
      )}
    </div>
  );
}

function LegacyQuiz({ shape, insertShape }: BoardCardProps) {
  const html = stringValue(shape.props.html);
  const text = stringValue(
    shape.props.text,
    stringValue(shape.props.question, stringValue(shape.props.title))
  );
  return (
    <div style={panel}>
      <p style={muted}>
        这是旧版数学练习。原始数据已保留；不自动运行旧脚本或计分逻辑。
      </p>
      <pre style={preStyle}>
        {text || '请查看原课程内容，或把已有 HTML 放入隔离预览。'}
      </pre>
      {html && (
        <Button
          onClick={() =>
            insertShape('preview_html', { html, title: '数学练习（隔离预览）' })
          }
        >
          在隔离卡片打开练习
        </Button>
      )}
    </div>
  );
}

export default function BoardCard(props: BoardCardProps) {
  let content: ReactNode;
  switch (props.shape.type) {
    case 'ai_terminal':
      content = <AITerminal {...props} />;
      break;
    case 'ai_result':
      content = <AIResult {...props} />;
      break;
    case 'preview_html':
      content = <HtmlPreview {...props} />;
      break;
    case 'blog_post':
      content = <BlogPost {...props} />;
      break;
    case 'skill':
      content = <DownloadSkill {...props} />;
      break;
    case 'video_player':
      content = <VideoPlayer {...props} />;
      break;
    case 'ai_video_analyzer':
      content = <VideoAnalyzer {...props} />;
      break;
    default:
      content = <LegacyQuiz {...props} />;
  }
  return (
    <div
      data-board-interactive={props.interactive ? 'true' : 'false'}
      inert={!props.interactive}
      onPointerDown={(event) => {
        if (props.interactive) event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        if (props.interactive) event.stopPropagation();
      }}
      onWheel={(event) => {
        if (props.interactive) event.stopPropagation();
      }}
      onKeyDown={(event) => {
        if (props.interactive && event.key !== 'Escape')
          event.stopPropagation();
      }}
      style={{
        ...column,
        gap: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#fff',
        color: '#172b4d',
        fontSize: 13,
        lineHeight: 1.5,
        userSelect: props.interactive ? 'text' : 'none',
        pointerEvents: props.interactive ? 'auto' : 'none',
      }}
    >
      {content}
    </div>
  );
}
