'use client';

import React, { useState, useEffect, useRef } from 'react';
// html2canvas 已移除，改用纯文本提取

// DeepSeek Logo SVG
const DeepSeekLogo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C12.5 7 17 11.5 22 12C17 12.5 12.5 17 12 22C11.5 17 7 12.5 2 12C7 11.5 11.5 7 12 2Z" fill="url(#deepseek-gradient)" />
    <defs>
      <linearGradient id="deepseek-gradient" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
        <stop stopColor="#3b82f6" />
        <stop offset="1" stopColor="#8b5cf6" />
      </linearGradient>
    </defs>
  </svg>
);

const CropIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M6 2v14a2 2 0 0 0 2 2h14" />
    <path d="M18 22V8a2 2 0 0 0-2-2H2" />
  </svg>
);

export default function ArticleCircleToSearch() {
  const [isActive, setIsActive] = useState(false);
  const [selection, setSelection] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string>('');
  const [extractedText, setExtractedText] = useState<string>(''); // 存储提取的文本
  const [aiResponse, setAiResponse] = useState<string>('');
  const [error, setError] = useState<string>('');

  const overlayRef = useRef<HTMLDivElement>(null);

  // 开始选择
  const startSelection = (e: React.PointerEvent) => {
    if (showResults) return;

    // 如果点击的是输入框或其子元素,不开始新的选择
    const target = e.target as HTMLElement;
    if (target.closest('[data-input-area]')) {
      return;
    }

    const x = e.clientX;
    const y = e.clientY;

    setDragStart({ x, y });
    setSelection({ x, y, width: 0, height: 0 });
    setIsDragging(true);
    setShowInput(false);
    setError('');
  };

  // 更新选择框
  const updateSelection = (e: React.PointerEvent) => {
    if (!isDragging || !dragStart) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const width = Math.abs(currentX - dragStart.x);
    const height = Math.abs(currentY - dragStart.y);
    const x = Math.min(currentX, dragStart.x);
    const y = Math.min(currentY, dragStart.y);

    setSelection({ x, y, width, height });
  };

  // 结束选择 - 提取文本内容
  const endSelection = async () => {
    setIsDragging(false);

    if (!selection || selection.width < 10 || selection.height < 10) {
      setSelection(null);
      return;
    }

    try {
      setIsLoading(true);

      // 获取选中区域内的所有文本
      // 使用 Range API 提取文本
      const range = document.caretRangeFromPoint(selection.x, selection.y);
      if (!range) {
        throw new Error('无法创建文本范围');
      }

      // 查找包含选区的文章元素
      const articleElement = document.querySelector('.prose');
      if (!articleElement) {
        throw new Error('找不到文章内容区域');
      }

      // 提取选中区域的文本（简单方案：直接获取 window.getSelection）
      const selectedText = window.getSelection()?.toString() || '';

      // 如果没有选中文本，尝试获取选区内的所有文本节点
      let extractedText = selectedText;
      if (!extractedText.trim()) {
        // 获取选区覆盖的所有元素
        const walker = document.createTreeWalker(
          articleElement,
          NodeFilter.SHOW_TEXT,
          null
        );

        const texts: string[] = [];
        let node;
        while (node = walker.nextNode()) {
          const rect = (node.parentElement as HTMLElement)?.getBoundingClientRect();
          if (rect) {
            // 检查元素是否在选区内
            if (rect.left < selection.x + selection.width &&
                rect.right > selection.x &&
                rect.top < selection.y + selection.height &&
                rect.bottom > selection.y) {
              texts.push(node.textContent || '');
            }
          }
        }
        extractedText = texts.join(' ').trim();
      }

      if (!extractedText) {
        throw new Error('未能提取到文本内容，请重新选择');
      }

      // 创建一个简单的文本表示作为 "截图"
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000000';
        ctx.font = '14px sans-serif';

        // 简单的文本换行
        const maxWidth = 750;
        const lineHeight = 20;
        const words = extractedText.split(' ');
        let line = '';
        let y = 30;

        for (let i = 0; i < words.length; i++) {
          const testLine = line + words[i] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && i > 0) {
            ctx.fillText(line, 25, y);
            line = words[i] + ' ';
            y += lineHeight;
            if (y > 180) break; // 防止超出画布
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line, 25, y);
      }

      const imageData = canvas.toDataURL('image/png');
      setCapturedImage(imageData);
      setExtractedText(extractedText); // 保存提取的文本
      setIsLoading(false);
      setShowInput(true);
    } catch (err) {
      console.error('提取文本失败:', err);
      setError(`提取文本失败: ${err instanceof Error ? err.message : '请重试'}`);
      setIsLoading(false);
      setSelection(null);
    }
  };

  // 提问 DeepSeek AI
  const handleAskAI = async () => {
    if (!extractedText) {
      setError('没有提取的文本数据');
      return;
    }

    setIsLoading(true);
    setShowResults(true);
    setShowInput(false);
    setError('');

    try {
      const response = await fetch('/api/circle-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: extractedText,
          question: inputValue || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '请求失败');
      }

      const data = await response.json();
      setAiResponse(data.answer || '无法获取回答');
    } catch (err) {
      console.error('AI 调用失败:', err);
      setError(err instanceof Error ? err.message : 'AI 调用失败');
      setAiResponse('抱歉，AI 服务暂时不可用，请稍后重试。');
    } finally {
      setIsLoading(false);
    }
  };

  // 回车提交
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleAskAI();
    }
  };

  // 切换选择模式
  const toggleSelectionMode = () => {
    setIsActive(!isActive);
    if (isActive) {
      // 关闭时清理状态
      setSelection(null);
      setShowResults(false);
      setShowInput(false);
      setInputValue('');
      setCapturedImage('');
      setAiResponse('');
      setError('');
    }
  };

  // ESC 键关闭
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isActive) {
        toggleSelectionMode();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isActive]);

  return (
    <>
      {/* Circle to Search 按钮 - 跟随滚动的圆形图标 */}
      <button
        onClick={toggleSelectionMode}
        className={`w-10 h-10 rounded-full shadow-md transition-all duration-200 flex items-center justify-center group ${
          isActive
            ? 'bg-blue-600 hover:bg-blue-700 text-white scale-110'
            : 'bg-white dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-400 hover:scale-105'
        }`}
        title={isActive ? "退出选择模式 (ESC)" : "智能圈选 - 框选文章内容并提问"}
      >
        <CropIcon />
        {/* 悬浮提示 */}
        {!isActive && (
          <span className="absolute right-full mr-2 bg-neutral-900 text-white px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            智能圈选
          </span>
        )}
      </button>

      {/* 选择遮罩层 */}
      {isActive && (
        <div
          ref={overlayRef}
          className="fixed inset-0 z-40 cursor-crosshair"
          style={{ background: 'rgba(0, 0, 0, 0.3)' }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            startSelection(e);
          }}
          onPointerMove={updateSelection}
          onPointerUp={(e) => {
            e.currentTarget.releasePointerCapture(e.pointerId);
            endSelection();
          }}
        >
          {/* 选择框 */}
          {selection && (
            <div
              className="absolute border-2 border-blue-500 rounded-lg"
              style={{
                left: selection.x,
                top: selection.y,
                width: selection.width,
                height: selection.height,
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)',
                pointerEvents: 'none'
              }}
            >
              {/* DeepSeek 输入框 */}
              {!isDragging && showInput && !isLoading && (
                <div
                  data-input-area
                  className="absolute top-full left-0 mt-3 bg-neutral-900 text-white p-3 rounded-xl shadow-xl flex items-center gap-3 min-w-[280px]"
                  style={{ pointerEvents: 'auto' }}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <DeepSeekLogo />
                  <input
                    type="text"
                    className="bg-transparent border-none outline-none flex-1 text-sm placeholder-neutral-400"
                    placeholder="问问 AI..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                  />
                  <button
                    onClick={handleAskAI}
                    className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-lg text-xs transition-colors"
                  >
                    提问
                  </button>
                </div>
              )}

              {/* 截图中提示 */}
              {isLoading && !showResults && (
                <div className="absolute top-full left-0 mt-3 bg-neutral-900 text-white p-3 rounded-xl shadow-xl text-sm">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    <span>正在截图...</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 提示文字 */}
          {!selection && !isDragging && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white px-4 py-2 rounded-lg shadow-lg font-medium text-sm pointer-events-none">
              拖拽框选文章内容，AI 将自动识别并回答你的问题
            </div>
          )}

          {/* 错误提示 */}
          {error && !showResults && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
              {error}
            </div>
          )}
        </div>
      )}

      {/* 结果面板 */}
      {showResults && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-900 rounded-t-3xl shadow-2xl max-h-[70vh] overflow-hidden"
          style={{ animation: 'slideUp 0.3s ease-out' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 拖动手柄 */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 bg-neutral-600 rounded-full"></div>
          </div>

          {/* 内容 */}
          <div className="p-6 overflow-y-auto max-h-[calc(70vh-40px)]">
            {/* 标题 */}
            <div className="flex items-center gap-2 mb-4 text-neutral-300">
              <DeepSeekLogo />
              <span className="font-medium">DeepSeek AI 智能回答</span>
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-neutral-500">
                <div className="inline-flex items-center gap-2">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent"></div>
                  <span>AI 正在分析中<span className="animate-pulse">...</span></span>
                </div>
              </div>
            ) : (
              <>
                {/* 截图预览 */}
                {capturedImage && (
                  <div className="mb-4">
                    <div className="text-sm text-neutral-500 mb-2">截取的内容：</div>
                    <img
                      src={capturedImage}
                      alt="Selected area"
                      className="max-w-full h-auto rounded-lg border border-neutral-700"
                      style={{ maxHeight: '200px' }}
                    />
                  </div>
                )}

                {/* 提���内容 */}
                {inputValue && (
                  <div className="mb-4 p-3 bg-neutral-800 rounded-lg border-l-4 border-blue-500">
                    <div className="text-sm text-neutral-400 mb-1">你的问题：</div>
                    <div className="text-neutral-200">{inputValue}</div>
                  </div>
                )}

                {/* AI 回答 */}
                <div className="bg-neutral-800 rounded-2xl p-4 mb-4">
                  <h3 className="text-lg font-bold mb-3 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    AI 回答
                  </h3>
                  <div className="text-neutral-300 leading-relaxed whitespace-pre-wrap">
                    {aiResponse || '等待 AI 响应...'}
                  </div>
                </div>

                {/* 错误信息 */}
                {error && (
                  <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 mb-4 text-red-200 text-sm">
                    ⚠️ {error}
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setShowResults(false);
                      setShowInput(true);
                      setInputValue('');
                    }}
                    className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white py-3 rounded-xl font-medium transition-colors"
                  >
                    继续提问
                  </button>
                  <button
                    onClick={toggleSelectionMode}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-medium transition-colors"
                  >
                    关闭并继续阅读
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
