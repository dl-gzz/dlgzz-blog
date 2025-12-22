'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, Loader2, RotateCcw, Download, Share2, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import type { TryOnStatus } from '@/hooks/use-ai-tryon';

interface AITryOnDisplayProps {
  isProcessing: boolean;
  status?: TryOnStatus;
  statusText?: string;
  resultImageUrl?: string;
  onRetry?: () => void;
  onReset?: () => void;
  onSave?: () => void;
  isSaving?: boolean;
}

export function AITryOnDisplay({
  isProcessing,
  status,
  statusText,
  resultImageUrl,
  onRetry,
  onReset,
  onSave,
  isSaving,
}: AITryOnDisplayProps) {
  const t = useTranslations('Dashboard.fittingRoom');

  // Loading animation component
  const LoadingAnimation = () => (
    <div className="flex flex-col items-center justify-center h-full space-y-6 p-8">
      <div className="relative">
        <div className="w-24 h-24 border-4 border-purple-200 border-t-purple-500 rounded-full animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles className="h-8 w-8 text-purple-500 animate-pulse" />
        </div>
      </div>
      
      <div className="text-center space-y-2">
        <h3 className="text-lg font-medium text-gray-700">AI试衣生成中</h3>
        <p className="text-sm text-gray-500">{statusText}</p>
      </div>
      
      {/* Progress steps */}
      <div className="w-full max-w-xs space-y-3">
        <div className="flex justify-between text-xs text-gray-400">
          <span>排队中</span>
          <span>处理中</span>
          <span>生成中</span>
          <span>完成</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all duration-1000"
            style={{
              width: getProgressWidth(status)
            }}
          />
        </div>
      </div>
      
      {/* Estimated time */}
      <p className="text-xs text-gray-400">预计需要 30-60 秒</p>
    </div>
  );

  // Skeleton placeholder
  const SkeletonDisplay = () => (
    <div className="space-y-4 p-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
      
      <div className="aspect-[3/4] w-full">
        <Skeleton className="w-full h-full" />
      </div>
      
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
      
      <div className="flex gap-2">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 flex-1" />
      </div>
    </div>
  );

  // Success result display
  const ResultDisplay = () => (
    <div className="space-y-4 p-6">
      <div className="text-center space-y-2">
        <h3 className="text-lg font-medium text-green-600">✨ AI试衣完成</h3>
        <p className="text-sm text-gray-500">试衣效果已生成</p>
      </div>
      
      {resultImageUrl && (
        <div className="space-y-4">
          <div className="relative bg-gray-100 rounded-lg overflow-hidden flex justify-center items-center" style={{ maxHeight: '480px' }}>
            <Image
              src={resultImageUrl}
              alt="AI try-on result"
              width={0}
              height={0}
              sizes="100vw"
              className="w-full h-auto max-h-[480px] object-contain"
              priority
            />
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              onClick={() => window.open(resultImageUrl, '_blank')}
            >
              <Download className="h-4 w-4 mr-2" />
              下载
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({
                    title: 'AI试衣效果',
                    url: resultImageUrl,
                  });
                }
              }}
            >
              <Share2 className="h-4 w-4 mr-2" />
              分享
            </Button>
          </div>
          
          {onSave && (
            <Button 
              onClick={onSave}
              disabled={isSaving}
              className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
              size="sm"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  保存到历史
                </>
              )}
            </Button>
          )}
          
          {onReset && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full"
              onClick={onReset}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              重新试衣
            </Button>
          )}
        </div>
      )}
    </div>
  );

  // Error display
  const ErrorDisplay = () => (
    <div className="flex flex-col items-center justify-center h-full space-y-4 p-8">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
        <span className="text-2xl">😞</span>
      </div>
      
      <div className="text-center space-y-2">
        <h3 className="text-lg font-medium text-red-600">试衣失败</h3>
        <p className="text-sm text-gray-500">生成过程中遇到问题</p>
      </div>
      
      {onRetry && (
        <Button onClick={onRetry} size="sm">
          <RotateCcw className="h-4 w-4 mr-2" />
          重新尝试
        </Button>
      )}
    </div>
  );

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          AI试衣效果
        </CardTitle>
      </CardHeader>
      <CardContent className="h-[calc(100%-80px)]">
        {isProcessing ? (
          <LoadingAnimation />
        ) : status === 'SUCCEEDED' && resultImageUrl ? (
          <ResultDisplay />
        ) : status === 'FAILED' ? (
          <ErrorDisplay />
        ) : status && !isProcessing ? (
          // Show completed status without result (shouldn't happen normally)
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center space-y-2">
              <Sparkles className="h-12 w-12 mx-auto" />
              <p>试衣已完成，但未收到结果图片</p>
              {onRetry && (
                <Button onClick={onRetry} size="sm" className="mt-4">
                  重新尝试
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center space-y-2">
              <Sparkles className="h-12 w-12 mx-auto" />
              <p>选择模特和服装，开始AI试衣</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function getProgressWidth(status?: TryOnStatus): string {
  switch (status) {
    case 'PENDING':
      return '25%';
    case 'PRE-PROCESSING':
      return '50%';
    case 'RUNNING':
      return '75%';
    case 'POST-PROCESSING':
      return '90%';
    case 'SUCCEEDED':
      return '100%';
    default:
      return '0%';
  }
} 