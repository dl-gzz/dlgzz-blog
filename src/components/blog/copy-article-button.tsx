'use client';

import { Button } from '@/components/ui/button';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useState } from 'react';

export function CopyArticleButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);

  async function copy() {
    if (busy) return;
    setBusy(true);
    setCopied(false);
    try {
      // The text is already loaded, so clipboard access starts in the click
      // gesture, including on browsers that enforce transient user activation.
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setManual(false);
    } catch {
      setManual(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="my-6 rounded-xl border bg-muted/30 p-4"
      aria-label="复制文章给 AI"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={busy || !text}
          onClick={() => void copy()}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? '已复制全文' : busy ? '正在复制…' : '复制全文给 AI'}
        </Button>
        <p className="text-sm text-muted-foreground">
          保留正文、提示词、代码和图片链接。粘贴给 AI，再告诉它你的目标。
        </p>
      </div>
      {copied ? (
        <p role="status" className="mt-2 text-sm text-emerald-700">
          全文已复制，可以粘贴到你的 AI 工具中。图片链接能否读取取决于所用工具。
        </p>
      ) : null}
      {manual ? (
        <div className="mt-3 space-y-2">
          <p role="alert" className="text-sm text-muted-foreground">
            浏览器未允许自动复制，请在下方选中全文手动复制。
          </p>
          <textarea
            aria-label="文章全文，手动复制"
            readOnly
            value={text}
            onFocus={(event) => event.currentTarget.select()}
            className="h-56 w-full rounded-md border bg-background p-3 text-sm"
          />
        </div>
      ) : null}
    </section>
  );
}
