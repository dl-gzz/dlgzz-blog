'use client';

import { useMemo, useState } from 'react';

function readSearchParam(name: string) {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get(name)?.trim() || '';
}

export default function ParentBindPage() {
  const studentId = useMemo(() => readSearchParam('studentId'), []);
  const token = useMemo(() => readSearchParam('token'), []);
  const bindMessage = token ? `绑定码 ${token}` : '';
  const [copied, setCopied] = useState(false);

  async function copyBindMessage() {
    if (!bindMessage) return;
    try {
      await navigator.clipboard.writeText(bindMessage);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f5f7fb] px-5 py-8 text-[#111827]">
      <div className="mx-auto flex max-w-[430px] flex-col gap-5 rounded-lg border border-black/10 bg-white p-6 shadow-[0_18px_44px_rgba(15,23,42,.12)]">
        <div>
          <div className="mb-2 text-sm font-bold text-[#2563eb]">Hermes 学习助手</div>
          <h1 className="text-2xl font-bold leading-tight tracking-normal">发送绑定码</h1>
          <p className="mt-3 text-sm leading-6 text-black/65">
            请把下面这句话发送给 Hermes 微信助手。发送后，Hermes 会把当前微信和学生档案绑定起来。
          </p>
        </div>

        <div className="grid gap-2 rounded-lg border border-black/10 bg-[#f8fafc] p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-black/55">学生编号</span>
            <strong className="text-right">{studentId || '未提供'}</strong>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-black/55">绑定码</span>
            <strong className="text-right break-all">{token || '未提供'}</strong>
          </div>
        </div>

        {bindMessage ? (
          <>
            <div className="rounded-lg bg-[#111827] px-4 py-3 text-sm font-bold leading-6 text-white">
              {bindMessage}
            </div>
            <button
              type="button"
              onClick={copyBindMessage}
              className="h-11 rounded-md bg-[#2563eb] px-4 text-sm font-bold text-white"
            >
              {copied ? '已复制' : '复制绑定码'}
            </button>
          </>
        ) : (
          <div className="rounded-lg bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
            缺少绑定码，请回到老师白板重新生成二维码。
          </div>
        )}

        <div className="grid gap-2 rounded-lg border border-black/10 bg-[#f8fafc] px-4 py-3 text-xs leading-5 text-black/65">
          <div className="font-bold text-black/75">现在的绑定方式</div>
          <div>1. 点“复制绑定码”。</div>
          <div>2. 打开 Hermes 微信助手聊天框，把这句话发过去。</div>
          <div>3. 收到确认后，再问“今天学得怎么样”就能读到这个学生的档案。</div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
          目前二维码负责传递绑定码；自动识别扫码微信身份需要接入微信带参入口或扫码回调。
          接上后，这里会升级成扫码即绑定。
        </div>
      </div>
    </main>
  );
}
