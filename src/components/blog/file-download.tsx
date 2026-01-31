/**
 * 文章文件下载组件
 * 用于在博客文章中提供文件下载功能
 */
'use client';

import { Download, FileText, FileArchive, FileImage, FileCode, File as FileIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileDownloadProps {
  /** 文件 URL */
  href: string;
  /** 文件名 */
  name: string;
  /** 文件大小（可选，如 "2.5 MB"） */
  size?: string;
  /** 文件类型（可选，如 "PDF", "ZIP"） */
  type?: string;
  /** 文件描述（可选） */
  description?: string;
  /** 样式变体 */
  variant?: 'default' | 'compact' | 'card';
  /** 自定义类名 */
  className?: string;
}

// 根据文件扩展名获取图标
function getFileIcon(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'pdf':
      return <FileText className="h-5 w-5" />;
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return <FileArchive className="h-5 w-5" />;
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'svg':
    case 'webp':
      return <FileImage className="h-5 w-5" />;
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'json':
    case 'html':
    case 'css':
    case 'py':
    case 'java':
    case 'cpp':
    case 'c':
      return <FileCode className="h-5 w-5" />;
    default:
      return <FileIcon className="h-5 w-5" />;
  }
}

// 根据文件扩展名获取类型标签
function getFileType(filename: string, customType?: string): string {
  if (customType) return customType;

  const ext = filename.split('.').pop()?.toUpperCase();
  return ext || 'FILE';
}

export function FileDownload({
  href,
  name,
  size,
  type,
  description,
  variant = 'default',
  className,
}: FileDownloadProps) {
  const fileType = getFileType(name, type);
  const icon = getFileIcon(name);

  // 紧凑样式
  if (variant === 'compact') {
    return (
      <a
        href={href}
        download
        className={cn(
          'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent',
          className
        )}
      >
        {icon}
        <span className="font-medium">{name}</span>
        {size && <span className="text-xs text-muted-foreground">({size})</span>}
        <Download className="h-4 w-4 ml-auto" />
      </a>
    );
  }

  // 卡片样式
  if (variant === 'card') {
    return (
      <div
        className={cn(
          'group relative overflow-hidden rounded-xl border bg-card p-6 transition-all hover:shadow-lg',
          className
        )}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-base mb-1 truncate">{name}</h4>
            {description && (
              <p className="text-sm text-muted-foreground mb-3">{description}</p>
            )}
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 font-medium text-primary">
                {fileType}
              </span>
              {size && <span>{size}</span>}
            </div>
          </div>
        </div>
        <a
          href={href}
          download
          className="absolute inset-0 z-10"
          aria-label={`下载 ${name}`}
        >
          <span className="sr-only">下载</span>
        </a>
        <Button
          size="sm"
          className="absolute bottom-4 right-4 pointer-events-none opacity-0 transition-opacity group-hover:opacity-100"
          asChild
        >
          <span>
            <Download className="h-4 w-4 mr-2" />
            下载
          </span>
        </Button>
      </div>
    );
  }

  // 默认样式
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-accent',
        className
      )}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-medium text-sm truncate">{name}</h4>
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {fileType}
          </span>
        </div>
        {(description || size) && (
          <p className="text-xs text-muted-foreground">
            {description}
            {description && size && ' • '}
            {size}
          </p>
        )}
      </div>
      <Button size="sm" variant="outline" asChild>
        <a href={href} download>
          <Download className="h-4 w-4 mr-2" />
          下载
        </a>
      </Button>
    </div>
  );
}

// 文件列表容器
interface FileDownloadsProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export function FileDownloads({ children, title, className }: FileDownloadsProps) {
  return (
    <div className={cn('not-prose my-6', className)}>
      {title && (
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
      )}
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}
