'use client';

import { useEffect, useRef, useState } from 'react';
import {
  parseTreeSettings,
  treeLessonFrameSrc,
} from '@/lib/tree-lesson-settings';
import { getLocalePathname } from '@/i18n/navigation';
import { useLocale } from 'next-intl';

type Settings = NonNullable<ReturnType<typeof parseTreeSettings>>;

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
    el?.showModal();
    return () => {
      pending.current?.abort();
      el?.close();
    };
  }, []);
  async function generate() {
    if (pending.current || !instruction.trim()) return;
    const request = new AbortController();
    pending.current = request;
    setBusy(true);
    setError('');
    setNeedsLogin(false);
    setDraft(null);
    setPreviewReady(false);
    try {
      const response = await fetch('/api/whiteboard/tree-lesson-draft', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: instruction.trim(), base }),
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
        onClose();
      }}
    >
      <header>
        <div>
          <small>直线植树 · 备课</small>
          <h2 id="tree-draft-title">用 AI 改副本</h2>
        </div>
        <button type="button" aria-label="关闭备课" onClick={onClose}>
          关闭
        </button>
      </header>
      <p>
        告诉 AI
        这节课想用多长的路、每隔几米种树。先试玩，确认后才会在白板上新增一张卡，原课件不变。
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
      >
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
            setDraft(null);
            setPreviewReady(false);
            setError('');
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
