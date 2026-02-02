/**
 * 文件下载统计查看组件
 * 用于管理员查看文件下载统计
 */
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Users, Calendar, FileText } from 'lucide-react';

interface DownloadSummary {
  fileKey: string;
  fileName: string;
  downloadCount: number;
  lastDownload: string;
  uniqueUsers: number;
}

export function FileDownloadStats() {
  const [stats, setStats] = useState<DownloadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/files/stats');

      if (!response.ok) {
        throw new Error('获取统计失败');
      }

      const data = await response.json();
      setStats(data.summary || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">
        错误: {error}
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-muted-foreground">
        暂无下载记录
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">文件下载统计</h2>
        <Button onClick={fetchStats} variant="outline" size="sm">
          刷新
        </Button>
      </div>

      <div className="grid gap-4">
        {stats.map((stat) => (
          <div
            key={stat.fileKey}
            className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">{stat.fileName}</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-3">
                  {stat.fileKey}
                </p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    <Download className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{stat.downloadCount}</span>
                    <span className="text-muted-foreground">次下载</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{stat.uniqueUsers}</span>
                    <span className="text-muted-foreground">个用户</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      最后下载: {new Date(stat.lastDownload).toLocaleString('zh-CN')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
