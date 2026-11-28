'use client';

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  isolatedHtml,
  readApiResponse,
  safeWebUrl,
  stringValue,
} from '../cards/helpers';
import { createId, getSelectionBounds } from '../core/model';
import { authClient } from '@/lib/auth-client';
import { usePersonalKey } from './use-personal-key';
import { type BoardShape, type Point, SHAPE_LABELS } from '../core/types';
import {
  ASSISTANT_TYPES,
  type ArticleContext,
  type AssistantApplyRequest,
  AssistantArchiveSizeError,
  type AssistantOperation,
  type AssistantPlan,
  assistantStorageKey,
  buildAssistantRequest,
  compactStoredShapeFingerprint,
  hasAppliedAssistantRequest,
  parseAssistantArchive,
  parseAssistantPlan,
  serializeAssistantArchive,
} from './logic';

export type { AssistantApplyRequest } from './logic';
export type AssistantPanelProps = {
  shapes: BoardShape[];
  selectedIds: string[];
  pageKey: string;
  /** Receipts committed with this board page, not local chat acknowledgement flags. */
  appliedRequestIds: string[];
  viewportCenter?: Point;
  onClose: () => void;
  /** Synchronous atomic transaction in the board owner; throw if it cannot commit. */
  onApply: (result: AssistantApplyRequest) => void;
  notify: (message: string) => void;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  requestId?: string;
  plan?: AssistantPlan;
  anchorPoint?: Point;
  error?: boolean;
  sources?: string[];
  notes?: string[];
};
type Session = { messages: Message[]; draft: string };
type PanelViewport = { x: number; y: number; width: number; height: number };

function visibleViewport(): PanelViewport {
  const viewport = window.visualViewport;
  return {
    x: viewport?.offsetLeft ?? 0,
    y: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
    height: viewport?.height ?? window.innerHeight,
  };
}

function clampPanel(
  point: Point,
  panel: HTMLElement,
  viewport: PanelViewport
): Point {
  const bounds = panel.getBoundingClientRect();
  const inset = 8;
  return {
    x: Math.max(
      viewport.x + inset,
      Math.min(
        point.x,
        viewport.x + Math.max(inset, viewport.width - bounds.width - inset)
      )
    ),
    y: Math.max(
      viewport.y + inset,
      Math.min(
        point.y,
        viewport.y + Math.max(inset, viewport.height - bounds.height - inset)
      )
    ),
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Stored text is data. An operation is validated again against live shapes on Apply. */
function restoreSession(raw: string | null): Session {
  if (!raw) return { messages: [], draft: '' };
  const saved = record(parseAssistantArchive(raw));
  if (!saved || saved.version !== 1 || !Array.isArray(saved.messages))
    throw new Error('本页对话存档格式无效，未覆盖原存档。');
  const messages: Message[] = saved.messages.map((value) => {
    const item = record(value);
    if (
      !item ||
      (item.role !== 'user' && item.role !== 'assistant') ||
      typeof item.content !== 'string' ||
      typeof item.id !== 'string'
    )
      throw new Error('本页对话存档含无效消息，未覆盖原存档。');
    const message: Message = {
      id: item.id,
      role: item.role,
      content: item.content,
    };
    if (typeof item.requestId === 'string') message.requestId = item.requestId;
    if (item.error === true) message.error = true;
    if (Array.isArray(item.sources))
      message.sources = item.sources.filter(
        (source): source is string => typeof source === 'string'
      );
    if (Array.isArray(item.notes))
      message.notes = item.notes.filter(
        (note): note is string => typeof note === 'string'
      );
    const anchor = record(item.anchorPoint);
    if (
      anchor &&
      typeof anchor.x === 'number' &&
      typeof anchor.y === 'number' &&
      Number.isFinite(anchor.x) &&
      Number.isFinite(anchor.y)
    )
      message.anchorPoint = { x: anchor.x, y: anchor.y };
    const plan = record(item.plan);
    if (
      plan &&
      typeof plan.id === 'string' &&
      Array.isArray(plan.operations) &&
      record(plan.snapshots)
    ) {
      if (plan.operations.length > 20)
        throw new Error('本页对话方案超过操作上限，未覆盖原存档。');
      const operations = plan.operations.map((value) => {
        const operation = record(value);
        if (
          !(
            operation &&
            (operation.action === 'create' || operation.action === 'update') &&
            ASSISTANT_TYPES.includes(
              operation.type as AssistantOperation['type']
            ) &&
            record(operation.props)
          )
        )
          throw new Error('本页对话方案格式无效，未覆盖原存档。');
        return operation as AssistantOperation;
      });
      message.plan = {
        id: plan.id,
        summary: stringValue(plan.summary),
        operations,
        snapshots: Object.fromEntries(
          Object.entries(plan.snapshots as Record<string, unknown>).map(
            ([id, fingerprint]) => {
              if (typeof fingerprint !== 'string')
                throw new Error('本页对话材料快照格式无效，未覆盖原存档。');
              return [id, compactStoredShapeFingerprint(fingerprint)];
            }
          )
        ),
        skipped:
          typeof plan.skipped === 'number' &&
          Number.isSafeInteger(plan.skipped) &&
          plan.skipped >= 0
            ? plan.skipped
            : 0,
        reasons: Array.isArray(plan.reasons)
          ? plan.reasons.filter(
              (reason): reason is string => typeof reason === 'string'
            )
          : [],
      };
    }
    return message;
  });
  return { messages, draft: stringValue(saved.draft) };
}

type HostProps = AssistantPanelProps & { open: boolean; panelIdentity: string };
export function AssistantPanel(props: HostProps) {
  const session = authClient.useSession();
  const owner = session.data?.user?.id || null;
  return <KeyHost key={owner ? 'user:' + owner : 'guest'} owner={owner} {...props}
    pending={!owner && session.isPending} />;
}

function KeyHost({ owner, pending, open, panelIdentity, ...props }: HostProps & {
  owner: string | null; pending: boolean;
}) {
  const credential = usePersonalKey(owner);
  return open ? <AssistantSession key={panelIdentity} {...props}
    credential={{ ...credential, loading: credential.loading || pending }} /> : null;
}

function ToolPreview({ html }: { html: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="ow-assistant__tool-preview"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>预览工具</summary>
      <p className="ow-assistant__hint">
        展开后仅在隔离沙箱中运行预览，不会修改白板。
      </p>
      {open && (
        <iframe
          title="AI 工具隔离预览"
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={isolatedHtml(html.slice(0, 200_000))}
        />
      )}
    </details>
  );
}

function AssistantSession({
  shapes,
  selectedIds,
  pageKey,
  appliedRequestIds,
  viewportCenter,
  onClose,
  onApply,
  notify,
  credential,
}: AssistantPanelProps & { credential: ReturnType<typeof usePersonalKey> }) {
  const [session, setSession] = useState<Session>({ messages: [], draft: '' });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [storageError, setStorageError] = useState('');
  const [canPersist, setCanPersist] = useState(true);
  const [error, setError] = useState('');
  const personalKey = credential.value;
  const [rememberDraft, setRememberDraft] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyError, setKeyError] = useState('');
  const [keyPanelOpen, setKeyPanelOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [panelPosition, setPanelPosition] = useState<Point | null>(null);
  const [panelViewport, setPanelViewport] = useState<PanelViewport | null>(
    null
  );
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    pointer: Point;
    origin: Point;
  } | null>(null);
  const mounted = useRef(false);
  const active = useRef<{ id: string; controller: AbortController } | null>(
    null
  );
  const applyGuard = useRef(new Set<string>());
  const threadEnd = useRef<HTMLDivElement>(null);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const storageKey = assistantStorageKey(pageKey);
  const selected = shapes.filter((shape) => selectedIds.includes(shape.id));
  const isApplied = (message: Message) =>
    hasAppliedAssistantRequest(message.requestId, appliedRequestIds);

  useEffect(() => {
    const keepVisible = () => {
      const viewport = visibleViewport();
      setPanelViewport(viewport);
      setPanelPosition((current) => {
        if (!current || !panelRef.current) return current;
        const next = clampPanel(current, panelRef.current, viewport);
        return next.x === current.x && next.y === current.y ? current : next;
      });
    };
    keepVisible();
    window.addEventListener('resize', keepVisible);
    window.visualViewport?.addEventListener('resize', keepVisible);
    window.visualViewport?.addEventListener('scroll', keepVisible);
    const observer = new ResizeObserver(keepVisible);
    if (panelRef.current) observer.observe(panelRef.current);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', keepVisible);
      window.visualViewport?.removeEventListener('resize', keepVisible);
      window.visualViewport?.removeEventListener('scroll', keepVisible);
    };
  }, []);

  function beginPanelDrag(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || !panelRef.current || dragRef.current) return;
    // Clicking the close/clear controls must never initiate a drag.
    if (
      (event.target as Element).closest('button, a, input, textarea, summary')
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = panelRef.current.getBoundingClientRect();
    const origin = { x: bounds.left, y: bounds.top };
    dragRef.current = {
      pointerId: event.pointerId,
      pointer: { x: event.clientX, y: event.clientY },
      origin,
    };
    setPanelPosition(origin);
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePanel(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !panelRef.current)
      return;
    event.preventDefault();
    event.stopPropagation();
    setPanelPosition(
      clampPanel(
        {
          x: drag.origin.x + event.clientX - drag.pointer.x,
          y: drag.origin.y + event.clientY - drag.pointer.y,
        },
        panelRef.current,
        visibleViewport()
      )
    );
  }

  function finishPanelDrag(event: ReactPointerEvent<HTMLElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function storageFailure(cause: unknown) {
    return cause instanceof AssistantArchiveSizeError
      ? cause.message
      : '浏览器本地存储已满或不可用，原存档未覆盖，本次对话暂时只保留在当前面板。';
  }

  function persistNow(value: Session) {
    if (!ready || !canPersist) return;
    try {
      localStorage.setItem(
        storageKey,
        serializeAssistantArchive({ version: 1, ...value })
      );
      setStorageError('');
    } catch (cause) {
      setStorageError(storageFailure(cause));
      notifyRef.current(storageFailure(cause));
    }
  }

  function setDraft(draft: string) {
    const next = { ...session, draft };
    persistNow(next);
    setSession(next);
  }

  useEffect(() => {
    mounted.current = true;
    try {
      const saved = restoreSession(localStorage.getItem(storageKey));
      setSession(saved);
    } catch (cause) {
      setStorageError(
        cause instanceof Error ? cause.message : '无法读取本页本地对话。'
      );
      setCanPersist(false);
    }
    setReady(true);
    return () => {
      mounted.current = false;
      active.current?.controller.abort();
      active.current = null;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!ready || !canPersist) return;
    try {
      localStorage.setItem(
        storageKey,
        serializeAssistantArchive({ version: 1, ...session })
      );
      setStorageError('');
    } catch (cause) {
      setStorageError(storageFailure(cause));
    }
  }, [session, ready, canPersist, storageKey]);

  useEffect(() => {
    if (session.messages.length || busy)
      threadEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [session.messages.length, busy]);

  async function send() {
    if (busy || !ready || credential.loading || !session.draft.trim()) return;
    if (selected.length > 20) {
      setError('一次最多选择 20 个材料，请减少选择后再发送。');
      return;
    }
    // Freeze before the first await: later selections and edits cannot retarget this request.
    const frozenShapes = JSON.parse(JSON.stringify(selected)) as BoardShape[];
    const frozenIds = frozenShapes.map((shape) => shape.id);
    const bounds = getSelectionBounds(frozenShapes, shapes);
    const anchorPoint = bounds
      ? { x: bounds.x + bounds.w + 48, y: bounds.y }
      : { ...(viewportCenter ?? { x: 80, y: 80 }) };
    const requestId = createId('assistant-request');
    const user: Message = {
      id: createId('message'),
      role: 'user',
      content: session.draft.trim(),
      requestId,
      sources: frozenShapes.map(
        (shape) => stringValue(shape.props.title) || SHAPE_LABELS[shape.type]
      ),
    };
    const nextMessages = [...session.messages, user];
    const controller = new AbortController();
    active.current = { id: requestId, controller };
    const isCurrent = () =>
      mounted.current &&
      active.current?.id === requestId &&
      !controller.signal.aborted;
    const sentSession = { messages: nextMessages, draft: '' };
    persistNow(sentSession);
    setSession(sentSession);
    setBusy(true);
    setError('');
    const notes: string[] = [];
    const timeout = setTimeout(() => {
      if (!isCurrent()) return;
      controller.abort();
      active.current = null;
      setBusy(false);
      setStatus('');
      const detail =
        '等待超过 90 秒，请求已停止，画布未改变。服务器可能已处理请求，请勿连续重复提交。';
      setError(detail);
      setSession((current) => ({
        ...current,
        draft: current.draft || user.content,
        messages: [
          ...current.messages,
          {
            id: createId('message'),
            role: 'assistant',
            content: detail,
            error: true,
            requestId,
            notes,
          },
        ],
      }));
    }, 90_000);
    try {
      const articleCards = frozenShapes.filter(
        (shape) => shape.type === 'blog_post'
      );
      const articles: ArticleContext[] = [];
      const items = articleCards.slice(0, 3).flatMap((shape) => {
        const url = safeWebUrl(shape.props.url);
        if (!url) {
          notes.push('有文章未提供有效站内链接，只有卡片摘要。');
          return [];
        }
        return [{ id: shape.id, url }];
      });
      if (articleCards.length > 3)
        notes.push('本轮最多读取 3 篇文章正文，其余文章只提供卡片摘要。');
      if (items.length) {
        setStatus('正在读取所选文章…');
        try {
          const data = await readApiResponse(
            await fetch('/api/whiteboard/article-context', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ items, locale: 'zh' }),
              signal: controller.signal,
            })
          );
          if (!isCurrent()) return;
          const requestedIds = new Set(items.map((item) => item.id));
          if (Array.isArray(data.articles))
            for (const value of data.articles) {
              const article = record(value);
              if (
                article &&
                typeof article.id === 'string' &&
                requestedIds.has(article.id) &&
                typeof article.content === 'string'
              ) {
                articles.push({
                  id: article.id,
                  title: stringValue(article.title),
                  content: article.content.slice(0, 12_000),
                  truncated:
                    article.truncated === true ||
                    article.content.length > 12_000,
                });
              }
            }
          if (Array.isArray(data.warnings))
            for (const value of data.warnings) {
              const warning = record(value);
              if (
                warning &&
                typeof warning.id === 'string' &&
                requestedIds.has(warning.id) &&
                typeof warning.message === 'string'
              )
                notes.push(warning.message.slice(0, 500));
            }
          for (const article of articles)
            if (article.truncated)
              notes.push(
                `《${article.title || '所选文章'}》正文较长，仅读取前 12,000 字符。`
              );
          for (const item of items)
            if (!articles.some((article) => article.id === item.id))
              notes.push('有文章正文未能读取，本轮仅使用其卡片摘要。');
        } catch (cause) {
          if (!isCurrent()) return;
          notes.push(
            `未读取文章正文：${cause instanceof Error ? cause.message : '读取失败'}。本轮仅使用卡片摘要。`
          );
        }
      }
      if (!isCurrent()) return;
      setStatus('正在整理材料与方案…');
      const request = buildAssistantRequest(
        nextMessages.filter((message) => !message.error),
        frozenShapes,
        articles
      );
      const data = await readApiResponse(
        await fetch('/api/whiteboard/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(personalKey ? {
              'x-deepseek-api-key': personalKey,
              'x-whiteboard-key-owner': credential.owner || 'signed-out',
            } : {}),
          },
          redirect: 'error',
          body: JSON.stringify(request),
          signal: controller.signal,
        })
      );
      if (!isCurrent()) return;
      const content = stringValue(data.message);
      if (!content) throw new Error('AI 未返回内容，画布未改变。');
      const plan = parseAssistantPlan(content, frozenShapes, frozenIds);
      const message: Message = {
        id: createId('message'),
        role: 'assistant',
        content,
        requestId,
        anchorPoint,
        notes,
        ...(plan.operations.length || plan.skipped ? { plan } : {}),
      };
      setSession((current) => ({
        ...current,
        messages: [...current.messages, message],
      }));
    } catch (cause) {
      if (!isCurrent()) return;
      const detail =
        cause instanceof Error ? cause.message : '请求失败，请稍后重试。';
      setError(detail);
      setSession((current) => ({
        ...current,
        messages: [
          ...current.messages,
          {
            id: createId('message'),
            role: 'assistant',
            content: `请求未完成：${detail}`,
            error: true,
            requestId,
            notes,
          },
        ],
        draft: current.draft || user.content,
      }));
    } finally {
      clearTimeout(timeout);
      if (isCurrent()) {
        setBusy(false);
        setStatus('');
        active.current = null;
      }
    }
  }

  function apply(message: Message) {
    if (
      !message.plan?.operations.length ||
      !message.requestId ||
      !message.anchorPoint ||
      isApplied(message) ||
      applyGuard.current.has(message.requestId)
    )
      return;
    applyGuard.current.add(message.requestId);
    try {
      onApply({
        pageKey,
        requestId: message.requestId,
        plan: message.plan,
        anchorPoint: message.anchorPoint,
      });
      // The owner may close this panel after committing on narrow screens.
      // Only the board's atomic receipt determines whether this plan was applied.
      persistNow(session);
    } catch (cause) {
      const detail =
        cause instanceof Error ? cause.message : '方案未应用，请重试。';
      setError(detail);
      notifyRef.current(detail);
    } finally {
      applyGuard.current.delete(message.requestId);
    }
  }

  function cancel() {
    active.current?.controller.abort();
    active.current = null;
    setBusy(false);
    setStatus('');
    setError(
      '请求已停止，画布未改变。服务器可能已经处理请求，停止不保证免除用量。'
    );
  }

  function clear() {
    if (!clearConfirm) {
      setClearConfirm(true);
      return;
    }
    setSession({ messages: [], draft: '' });
    setCanPersist(true);
    setStorageError('');
    setClearConfirm(false);
    setError('');
    // Clearing chat does not change the receipts in the board document.
  }

  return (
    <aside
      ref={panelRef}
      className={`ow-assistant${dragging ? ' ow-assistant--dragging' : ''}`}
      aria-label="白板 AI 助手"
      style={{
        ...(panelViewport
          ? {
              width: Math.max(0, Math.min(380, panelViewport.width - 16)),
              maxHeight: Math.max(0, Math.min(500, panelViewport.height - 16)),
            }
          : {}),
        ...(panelPosition
          ? { left: panelPosition.x, top: panelPosition.y, transform: 'none' }
          : panelViewport
            ? {
                left: panelViewport.x + panelViewport.width / 2,
                top: panelViewport.y + panelViewport.height / 2,
              }
            : {}),
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <header
        className="ow-assistant__header"
        title="拖动标题栏移动面板"
        onPointerDown={beginPanelDrag}
        onPointerMove={movePanel}
        onPointerUp={finishPanelDrag}
        onPointerCancel={finishPanelDrag}
        onLostPointerCapture={finishPanelDrag}
      >
        <div className="ow-assistant__title">
          <span className="ow-assistant__grip" aria-hidden="true">
            ⠿
          </span>
          <span aria-hidden="true">✨</span>
          <strong>AI 助手</strong>
          <span className="ow-assistant__badge">DeepSeek</span>
        </div>
        <div className="ow-assistant__header-actions">
          <button
            type="button"
            className="ow-assistant__clear"
            disabled={busy || credential.loading}
            onClick={() => {
              setKeyDraft('');
              setRememberDraft(credential.remembered);
              setKeyError('');
              setKeyPanelOpen(!keyPanelOpen);
            }}
            aria-expanded={keyPanelOpen}
            title="设置个人 DeepSeek API Key"
          >
            {personalKey ? '已用个人 Key' : 'API Key'}
          </button>
          <button
            type="button"
            className="ow-assistant__clear"
            disabled={busy || !ready}
            onClick={clear}
            aria-label={clearConfirm ? '确认清空本页对话' : '清空对话'}
            title="清空对话历史"
          >
            {clearConfirm ? '确认清空？' : '清空'}
          </button>
          <button
            type="button"
            className="ow-assistant__icon"
            aria-label="关闭 AI 助手"
            onClick={() => {
              persistNow(session);
              onClose();
            }}
          >
            ×
          </button>
        </div>
      </header>
      {keyPanelOpen && (
        <form
          className="ow-assistant__keybar"
          aria-label="DeepSeek API Key 设置"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || credential.loading) return;
            const value = keyDraft.trim() || personalKey;
            if (!/^[!-~]{1,256}$/.test(value)) {
              setKeyError('请输入有效的 DeepSeek API Key，不能包含空格。');
              return;
            }
            try {
              await credential.save(value, rememberDraft);
            } catch (cause) {
              setKeyError(cause instanceof Error ? cause.message : '无法保存设置。');
              return;
            }
            setKeyDraft('');
            setKeyError('');
            setKeyPanelOpen(false);
            notify(rememberDraft ? '已在这台设备上为当前账号记住 Key。' : '已启用个人 Key，收起助手后仍可继续使用。');
          }}
        >
          <div className="ow-assistant__keybar-row">
            <input
              type="password"
              aria-label="个人 DeepSeek API Key"
              autoComplete="off"
              spellCheck={false}
              maxLength={256}
              placeholder={personalKey ? '已设置；仅更换时需填写' : '输入个人 DeepSeek API Key'}
              disabled={busy || credential.loading}
              value={keyDraft}
              onChange={(event) => {
                setKeyDraft(event.target.value);
                setKeyError('');
              }}
            />
            <button type="submit" className="ow-assistant__keybar-save" disabled={busy || credential.loading}>
              使用
            </button>
            {(personalKey || credential.deviceError) && (
              <button
                type="button"
                className="ow-assistant__clear"
                disabled={busy || credential.loading}
                onClick={async () => {
                  try {
                    await credential.save('', false);
                  } catch (cause) {
                    setKeyError(cause instanceof Error ? cause.message : '无法清除，请重试。');
                    return;
                  }
                  setRememberDraft(false);
                  setKeyDraft('');
                  setKeyError('');
                  setKeyPanelOpen(false);
                  notify('已清除个人 Key。平台额度仅限付费会员。');
                }}
              >
                清除
              </button>
            )}
          </div>
          <label>
            <input type="checkbox" checked={rememberDraft}
              disabled={!credential.owner || busy || credential.loading}
              onChange={event => setRememberDraft(event.target.checked)} /> 在这台设备上记住
          </label>
          {personalKey && <p>个人 Key 已启用 · {credential.remembered ? '此设备已记住' : '仅本次白板使用'}</p>}
          {credential.deviceError && <p role="alert">未能读取设备保存的 Key。可使用临时 Key，或点「清除」移除设备记录。</p>}
          {keyError && <p role="alert">{keyError}</p>}
          <p className="ow-assistant__keybar-note">
            默认只在本次白板使用，收起助手不会清除。登录后勾选并点「使用」，下次同一账号在此浏览器可继续使用。公共设备请勿勾选。
          </p>
        </form>
      )}
      <section className="ow-assistant__context" aria-label="本轮选中材料">
        <div className="ow-assistant__row">
          <strong>选中材料 · {selected.length}</strong>
          <span>发送时固定上下文</span>
        </div>
        {selected.length ? (
          <div className="ow-assistant__chips">
            {selected.slice(0, 20).map((shape) => (
              <span key={shape.id} title={shape.id}>
                {shape.locked ? '🔒 ' : ''}
                {stringValue(shape.props.title) || SHAPE_LABELS[shape.type]}
              </span>
            ))}
          </div>
        ) : (
          <p>未选择材料 · 可直接描述你要的小工具</p>
        )}
        {selected.some((shape) =>
          ['image', 'video', 'video_player'].includes(shape.type)
        ) && (
          <p className="ow-assistant__notice">
            图片和视频只发送元数据，未进行视觉分析。
          </p>
        )}
      </section>
      <div className="ow-assistant__thread" aria-live="polite" aria-busy={busy}>
        {!session.messages.length && (
          <div className="ow-assistant__welcome">
            <p>
              已进入
              OneWorkOS。我可以整理所选材料，生成应用，或继续修改你的工具。
            </p>
            <details className="ow-assistant__suggestion-toggle">
              <summary>试试这样问</summary>
              <div className="ow-assistant__suggestions">
                {[
                  '把选中的材料整理成行动清单',
                  '把这篇文章做成交互式教程',
                  '做一个简单的番茄钟工具',
                ].map((suggestion) => (
        <button
                    key={suggestion}
                    type="button"
                    onClick={() => setDraft(suggestion)}
                  >
                    {suggestion}
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            </details>
          </div>
        )}
        {session.messages.map((message) => (
          <article
            key={message.id}
            className={`ow-assistant__message ow-assistant__message--${message.role}${message.error ? ' ow-assistant__message--error' : ''}`}
          >
            <div className="ow-assistant__speaker">
              {message.role === 'user' ? '你' : 'AI 助手'}
            </div>
            {message.sources?.length ? (
              <div className="ow-assistant__sources">
                基于：{message.sources.join(' · ')}
              </div>
            ) : null}
            <p>
              {message.plan
                ? message.plan.summary || '已准备画布操作，请先检查方案。'
                : message.content}
            </p>
            {message.notes?.length ? (
              <ul className="ow-assistant__notes">
                {Array.from(new Set(message.notes)).map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
            {message.plan && (
              <div className="ow-assistant__plan">
                <strong>{message.plan.operations.length} 项待确认操作</strong>
                <ol>
                  {message.plan.operations.map((operation, index) => (
                    <li key={`${operation.id ?? 'new'}-${index}`}>
                      <span>
                        {operation.action === 'create' ? '新建' : '修改'}{' '}
                        {SHAPE_LABELS[operation.type]}
                      </span>
                      <small>
                        {stringValue(
                          operation.props.title,
                          stringValue(
                            operation.props.name,
                            stringValue(operation.props.text)
                          )
                        ).slice(0, 100) ||
                          (operation.type === 'arrow'
                            ? '连接两个已有对象'
                            : operation.type === 'preview_html'
                              ? '隔离运行的 HTML 小工具'
                              : '')}
                      </small>
                      {operation.type === 'preview_html' &&
                        typeof operation.props.html === 'string' && (
                          <ToolPreview html={operation.props.html} />
                        )}
                    </li>
                  ))}
                </ol>
                {message.plan.skipped > 0 && (
                  <p className="ow-assistant__notice">
                    已拒绝 {message.plan.skipped} 项不支持或不安全的操作。
                    {message.plan.reasons.join(' ')}
                  </p>
                )}
                {message.plan.operations.some(
                  (operation) => operation.type === 'skill'
                ) && (
                  <p className="ow-assistant__notice">
                    只放置或配置技能卡片，不会自动运行下载。
                  </p>
                )}
                <details>
                  <summary>查看安全 JSON 预览</summary>
                  <pre>{JSON.stringify(message.plan.operations, null, 2)}</pre>
                </details>
                <button
                  type="button"
                  className="ow-assistant__primary"
                  disabled={
                    isApplied(message) ||
                    !message.plan.operations.length ||
                    busy
                  }
                  onClick={() => apply(message)}
                >
                  {isApplied(message) ? '已确认应用' : '确认应用到白板'}
                </button>
                {!isApplied(message) && (
                  <small className="ow-assistant__hint">
                    只修改本轮选中的对象；已变化、删除或锁定的目标不会被覆盖。
                  </small>
                )}
              </div>
            )}
          </article>
        ))}
        {busy && (
          <p className="ow-assistant__progress">{status || '正在准备…'}</p>
        )}
        <div ref={threadEnd} />
      </div>
      <footer className="ow-assistant__composer">
        {storageError && (
          <output className="ow-assistant__notice">{storageError}</output>
        )}
        {error && (
          <p className="ow-assistant__error" role="alert">
            {error}
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            aria-label="给工作台助手的指令"
            placeholder="描述一个应用、工具或修改…"
            value={session.draft}
            disabled={!ready}
            rows={1}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <div className="ow-assistant__send">
            {busy ? (
              <button
                type="button"
                className="ow-assistant__secondary"
                onClick={cancel}
              >
                停止请求
              </button>
            ) : (
              <button
                type="submit"
                className="ow-assistant__primary"
                aria-label="发送"
                disabled={!ready || credential.loading || !session.draft.trim()}
              >
                ↵
              </button>
            )}
          </div>
        </form>
        <p className="ow-assistant__hint">
          本页对话自动保存在此浏览器 · Enter 发送
        </p>
      </footer>
    </aside>
  );
}

export default AssistantPanel;
