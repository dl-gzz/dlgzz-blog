'use client';

import React, { useState, useEffect, useRef } from 'react';

// Gemini Logo SVG
const GeminiLogo = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C12.5 7 17 11.5 22 12C17 12.5 12.5 17 12 22C11.5 17 7 12.5 2 12C7 11.5 11.5 7 12 2Z" fill="url(#gemini-gradient)" />
    <defs>
      <linearGradient id="gemini-gradient" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
        <stop stopColor="#4facfe" />
        <stop offset="1" stopColor="#f093fb" />
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
  const [selectedText, setSelectedText] = useState('');

  const overlayRef = useRef<HTMLDivElement>(null);

  // 开始选择
  const startSelection = (e: React.PointerEvent) => {
    if (showResults) return;

    const x = e.clientX;
    const y = e.clientY;

    // 获取选中的文本
    const text = window.getSelection()?.toString() || '';
    setSelectedText(text);

    setDragStart({ x, y });
    setSelection({ x, y, width: 0, height: 0 });
    setIsDragging(true);
    setShowInput(false);
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

  // 结束选择
  const endSelection = () => {
    setIsDragging(false);
    if (selection && (selection.width < 10 || selection.height < 10)) {
      setSelection(null);
    } else {
      setShowInput(true);
    }
  };

  // 提问 Gemini
  const handleAskGemini = () => {
    setIsLoading(true);
    setShowResults(true);

    // 模拟 API 调用
    setTimeout(() => {
      setIsLoading(false);
    }, 2000);
  };

  // 回车提交
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      handleAskGemini();
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
      setSelectedText('');
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
              {/* Gemini 输入框 */}
              {!isDragging && showInput && (
                <div
                  className="absolute top-full left-0 mt-3 bg-neutral-900 text-white p-3 rounded-xl shadow-xl flex items-center gap-3 min-w-[280px]"
                  style={{ pointerEvents: 'auto' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <GeminiLogo />
                  <input
                    type="text"
                    className="bg-transparent border-none outline-none flex-1 text-sm placeholder-neutral-400"
                    placeholder="问问 Gemini..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                  />
                </div>
              )}
            </div>
          )}

          {/* 提示文字 */}
          {!selection && !isDragging && (
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white px-4 py-2 rounded-lg shadow-lg font-medium text-sm pointer-events-none">
              拖拽框选文章内容，然后提问
            </div>
          )}
        </div>
      )}

      {/* 结果面板 */}
      {showResults && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-900 rounded-t-3xl shadow-2xl max-h-[60vh] overflow-hidden"
          style={{ animation: 'slideUp 0.3s ease-out' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 拖动手柄 */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 bg-neutral-600 rounded-full"></div>
          </div>

          {/* 内容 */}
          <div className="p-6 overflow-y-auto max-h-[calc(60vh-40px)]">
            {/* 标题 */}
            <div className="flex items-center gap-2 mb-4 text-neutral-300">
              <GeminiLogo />
              <span className="font-medium">Gemini 智能回答</span>
            </div>

            {isLoading ? (
              <div className="text-center py-8 text-neutral-500">
                <div className="inline-block">
                  正在思考<span className="animate-pulse">.</span><span className="animate-pulse delay-100">.</span><span className="animate-pulse delay-200">.</span>
                </div>
              </div>
            ) : (
              <>
                {/* 回答卡片 */}
                <div className="bg-neutral-800 rounded-2xl p-4 mb-4">
                  <h3 className="text-lg font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                    {inputValue || "关于选中内容的解释"}
                  </h3>
                  {selectedText && (
                    <div className="mb-3 p-3 bg-neutral-700 rounded-lg text-sm text-neutral-300 border-l-4 border-blue-500">
                      <div className="font-medium text-neutral-400 mb-1">选中的内容：</div>
                      "{selectedText}"
                    </div>
                  )}
                  <p className="text-neutral-300 leading-relaxed">
                    这是一个模拟的 AI 回答。在实际应用中，这里会显示 Gemini AI 对您选中内容的详细解释和分析。
                  </p>
                  <p className="text-neutral-400 text-sm mt-3">
                    您可以继续提问，或关闭此面板返回文章阅读。
                  </p>
                </div>

                {/* 相关搜索 */}
                <div className="mb-3 text-sm text-neutral-500">相关搜索</div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  <div className="bg-neutral-800 px-3 py-2 rounded-full text-sm whitespace-nowrap border border-neutral-700 text-neutral-300">
                    了解更多
                  </div>
                  <div className="bg-neutral-800 px-3 py-2 rounded-full text-sm whitespace-nowrap border border-neutral-700 text-neutral-300">
                    相关文章
                  </div>
                  <div className="bg-neutral-800 px-3 py-2 rounded-full text-sm whitespace-nowrap border border-neutral-700 text-neutral-300">
                    深入阅读
                  </div>
                </div>

                {/* 关闭按钮 */}
                <button
                  onClick={toggleSelectionMode}
                  className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-medium transition-colors"
                >
                  关闭并继续阅读
                </button>
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
