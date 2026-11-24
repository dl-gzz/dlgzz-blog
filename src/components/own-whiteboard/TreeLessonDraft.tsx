'use client';

import { useEffect, useRef, useState } from 'react';
import {
  isDeepSeekKey,
  looksLikeDeepSeekKeyInPrompt,
} from '@/lib/tree-ai-key-format';
import {
  parseTreeSettings,
  treeLessonFrameSrc,
} from '@/lib/tree-lesson-settings';
import { getLocalePathname } from '@/i18n/navigation';
import { useLocale } from 'next-intl';

type Settings = NonNullable<ReturnType<typeof parseTreeSettings>>;
type KeyMode = 'personal' | 'site';

export default function TreeLessonDraft({
  base,
  onConfirm,
  onClose,
}: {
  base: Settings;
  onConfirm: (settings: Settings) => void;
  onClose: () => void;
}) {
  const locale = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const personalKeyInput = useRef<HTMLInputElement>(null);
  const [keyMode, setKeyMode] = useState<KeyMode>('personal');
  const pending = useRef<AbortController | null>(null);
  const accepted = useRef(false);
  const [instruction, setInstruction] = useState('');
  const [draft, setDraft] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  useEffect(() => {
    const el = dialog.current;
    // Clear the DOM value even when a browser keeps this document in its back/forward cache.
    const clearOnLeave = () => {
      const input = el?.querySelector<HTMLInputElement>('#tree-personal-key');
      if (input) input.value = '';
    };
    el?.showModal();
    window.addEventListener('pagehide', clearOnLeave);
    return () => {
      window.removeEventListener('pagehide', clearOnLeave);
      clearOnLeave();
      pending.current?.abort();
      el?.close();
    };
  }, []);
  function clearDraft() {
    setDraft(null);
    setPreviewReady(false);
    setError('');
    setNeedsLogin(false);
  }
  function closeDraft() {
    if (personalKeyInput.current) personalKeyInput.current.value = '';
    pending.current?.abort();
    onClose();
  }
  async function generate() {
    if (pending.current || !instruction.trim()) return;
    clearDraft();
    if (looksLikeDeepSeekKeyInPrompt(instruction)) {
      setError(
        '备课要求中可能包含密钥，未发送。请把密钥移到专用的 API Key 输入框。'
      );
      return;
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Tree-AI-Mode': keyMode,
    };
    if (keyMode === 'personal') {
      const key = personalKeyInput.current?.value.trim() || '';
      if (!isDeepSeekKey(key)) {
        setError(
          key
            ? '请检查 DeepSeek API Key 的格式：应以 sk- 开头，且不含空格。'
            : '请填写自己的 DeepSeek API Key，或选择使用网站提供的 DeepSeek。'
        );
        personalKeyInput.current?.focus();
        return;
      }
      headers.Authorization = `Bearer ${key}`;
    }
    const request = new AbortController();
    pending.current = request;
    setBusy(true);
    try {
      const response = await fetch('/api/whiteboard/tree-lesson-draft', {
        method: 'POST',
        mode: 'same-origin',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        headers,
        body: JSON.stringify({
          instruction: instruction.trim(),
          base,
          ...(keyMode === 'personal' ? { credentialMode: 'personal' } : {}),
        }),
        signal: request.signal,
      });
      if (response.status === 401) {
        setNeedsLogin(true);
        throw new Error('请先登录。登录后回到这里，原来的要求还在。');
      }
      const data = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          typeof data?.error === 'string'
            ? data.error
            : '生成失败，请稍后重试。'
        );
      const valid = parseTreeSettings(data?.settings);
      if (!valid) throw new Error('未收到可用的课件参数，请换个说法重试。');
      if (!request.signal.aborted) setDraft(valid);
    } catch (e) {
      if (!request.signal.aborted)
        setError(e instanceof Error ? e.message : '无法生成草案，请稍后重试。');
    } finally {
      if (pending.current === request) pending.current = null;
      if (!request.signal.aborted) setBusy(false);
    }
  }
  function confirm() {
    if (!draft || !previewReady || accepted.current) return;
    accepted.current = true;
    try {
      onConfirm(draft);
    } catch (e) {
      accepted.current = false;
      setError(e instanceof Error ? e.message : '没有创建副本。');
    }
  }
  return (
    <dialog
      ref={dialog}
      className="owb-tree-draft"
      data-board-interactive="true"
      aria-labelledby="tree-draft-title"
      onCancel={(e) => {
        e.preventDefault();
        closeDraft();
      }}
    >
      <header>
        <div>
          <small>直线植树 · 备课</small>
          <h2 id="tree-draft-title">用 AI 改副本</h2>
        </div>
        <button type="button" aria-label="关闭备课" onClick={closeDraft}>
          关闭
        </button>
      </header>
      <p>
        告诉 AI
        这节课想用多长的路、每隔几米种树。先试玩，确认后才会在白板上新增一张卡，原课件不变。
      </p>
      <form
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
      >
        <div className="owb-tree-access">
          <label htmlFor="tree-key-mode">AI 调用方式</label>
          <select
            id="tree-key-mode"
            value={keyMode}
            disabled={busy}
            onChange={(e) => {
              if (personalKeyInput.current) personalKeyInput.current.value = '';
              setKeyMode(e.target.value === 'site' ? 'site' : 'personal');
              clearDraft();
            }}
          >
            <option value="personal">使用我的 DeepSeek API Key</option>
            <option value="site">使用网站提供的 DeepSeek</option>
          </select>
          {keyMode === 'personal' ? (
            <>
              <label htmlFor="tree-personal-key">我的 DeepSeek API Key</label>
              <input
                ref={personalKeyInput}
                id="tree-personal-key"
                type="password"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-required="true"
                aria-describedby="tree-key-help"
                placeholder="粘贴以 sk- 开头的密钥"
                disabled={busy}
                onInput={() => {
                  if (error) {
                    setError('');
                    setNeedsLogin(false);
                  }
                }}
              />
              <p id="tree-key-help">
                需要会员登录。点生成后，本站服务器仅将密钥转发给 DeepSeek
                官方，费用由你的 DeepSeek
                账户承担。本站不保存密钥，关闭窗口或切换方式即清空。
              </p>
            </>
          ) : (
            <p>需要会员登录。使用网站配置的 DeepSeek，不使用你的个人密钥。</p>
          )}
        </div>
        <label htmlFor="tree-draft-prompt">你的备课要求</label>
        <textarea
          id="tree-draft-prompt"
          autoFocus
          rows={2}
          value={instruction}
          maxLength={500}
          placeholder="例如：把校门口的小路改成 30 米，每隔 5 米种一棵。"
          disabled={busy}
          onChange={(e) => {
            setInstruction(e.target.value);
            clearDraft();
          }}
        />
        <button
          className="owb-tree-primary"
          type="submit"
          disabled={busy || !instruction.trim()}
        >
          {busy ? 'AI 正在生成…' : draft ? '重新生成草案' : '生成试玩草案'}
        </button>
      </form>
      {error && (
        <p role="alert">
          {error}{' '}
          {needsLogin && (
            <a
              href={
                getLocalePathname({ locale, href: '/auth/login' }) +
                '?callbackUrl=' +
                encodeURIComponent(
                  window.location.pathname + window.location.search
                )
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              打开登录页 ↗
            </a>
          )}
        </p>
      )}
      {draft && (
        <section aria-label="草案预览">
          <h3>试玩草案</h3>
          <p>
            路长：{base.road} 米 → <b>{draft.road} 米</b>；间距：{base.spacing}{' '}
            米 → <b>{draft.spacing} 米</b>。
          </p>
          <iframe
            src={treeLessonFrameSrc(draft)}
            title="直线植树草案试玩"
            sandbox="allow-scripts"
            allowFullScreen
            onLoad={() => setPreviewReady(true)}
          />
          <footer>
            <small>试玩进度不会写入白板。</small>
            <button
              className="owb-tree-primary"
              type="button"
              disabled={!previewReady}
              onClick={confirm}
            >
              确认并创建副本
            </button>
          </footer>
        </section>
      )}
    </dialog>
  );
}
