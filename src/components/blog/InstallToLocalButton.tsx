'use client';

interface InstallToLocalButtonProps {
  title: string;
  description: string;
  slug: string;
  whiteboardPrompt?: string;
  localPort?: number;
}

export function InstallToLocalButton({
  title,
  description,
  slug,
  whiteboardPrompt,
  localPort = 3001,
}: InstallToLocalButtonProps) {
  const handleClick = () => {
    const params = new URLSearchParams({
      article: slug,
      title: title,
      desc: description,
      ...(whiteboardPrompt ? { prompt: whiteboardPrompt } : {}),
    });
    // 打开用户本地运行的 One Worker OS
    window.open(`http://localhost:${localPort}/whiteboard?${params.toString()}`, '_blank');
  };

  return (
    <button
      onClick={handleClick}
      title="需要本地运行 One Worker OS"
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
    >
      <span>⬇</span>
      <span>安装到本地</span>
    </button>
  );
}
