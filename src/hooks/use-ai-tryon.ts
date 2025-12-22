'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';

export type TryOnStatus = 'PENDING' | 'PRE-PROCESSING' | 'RUNNING' | 'POST-PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN' | 'CANCELED';

interface TryOnTaskData {
  taskId: string;
  status: TryOnStatus;
  imageUrl?: string;
  error?: {
    code: string;
    message: string;
  };
}

interface TryOnRequest {
  personImageUrl: string;
  topGarmentUrl?: string;
  bottomGarmentUrl?: string;
}

export function useAITryOn() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentTask, setCurrentTask] = useState<TryOnTaskData | null>(null);
  const { toast } = useToast();
  const t = useTranslations('Dashboard.fittingRoom');

  const submitTryOnTask = useCallback(async (data: TryOnRequest): Promise<string | null> => {
    setIsProcessing(true);
    
    try {
      const response = await fetch('/api/ai-tryon', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personImageUrl: data.personImageUrl,
          topGarmentUrl: data.topGarmentUrl,
          bottomGarmentUrl: data.bottomGarmentUrl,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        // Handle subscription-specific errors
        if (result.code === 'SUBSCRIPTION_REQUIRED') {
          toast({
            title: '付费功能',
            description: result.error || 'AI虚拟试衣功能仅限付费用户使用',
            variant: 'destructive',
          });
          setIsProcessing(false);
          return null;
        }
        
        throw new Error(result.error || 'Failed to submit try-on task');
      }

      const taskData: TryOnTaskData = {
        taskId: result.taskId,
        status: result.status,
      };

      setCurrentTask(taskData);
      return result.taskId;

    } catch (error) {
      console.error('Submit try-on task error:', error);
      
      toast({
        title: 'AI试衣失败',
        description: error instanceof Error ? error.message : '提交AI试衣任务失败，请重试',
        variant: 'destructive',
      });

      setIsProcessing(false);
      return null;
    }
  }, [toast]);

  const checkTaskStatus = useCallback(async (taskId: string): Promise<TryOnTaskData | null> => {
    try {
      const response = await fetch(`/api/ai-tryon?taskId=${taskId}`, {
        method: 'GET',
      });

      const result = await response.json();

      if (!response.ok) {
        // Handle subscription-specific errors
        if (result.code === 'SUBSCRIPTION_REQUIRED') {
          toast({
            title: '付费功能',
            description: result.error || 'AI虚拟试衣功能仅限付费用户使用',
            variant: 'destructive',
          });
          setIsProcessing(false);
          return null;
        }
        
        throw new Error(result.error || 'Failed to check task status');
      }

      const taskData: TryOnTaskData = {
        taskId: result.taskId,
        status: result.status,
        imageUrl: result.imageUrl,
        error: result.error,
      };

      setCurrentTask(taskData);

      // If task is completed (success or failed), stop processing
      if (taskData.status === 'SUCCEEDED' || taskData.status === 'FAILED') {
        setIsProcessing(false);
        
        if (taskData.status === 'SUCCEEDED') {
          toast({
            title: 'AI试衣成功',
            description: '试衣效果已生成，请查看右侧预览',
          });
        } else if (taskData.status === 'FAILED') {
          toast({
            title: 'AI试衣失败',
            description: taskData.error?.message || '试衣生成失败，请重试',
            variant: 'destructive',
          });
        }
      }

      return taskData;

    } catch (error) {
      console.error('Check task status error:', error);
      return null;
    }
  }, [toast]);

  const startTryOn = useCallback(async (data: TryOnRequest): Promise<void> => {
    // Submit the task
    const taskId = await submitTryOnTask(data);
    if (!taskId) return;

    // Start polling for status immediately
    const pollStatus = async () => {
      const taskData = await checkTaskStatus(taskId);
      
      if (taskData && ['PENDING', 'PRE-PROCESSING', 'RUNNING', 'POST-PROCESSING'].includes(taskData.status)) {
        // Continue polling after 3 seconds
        setTimeout(pollStatus, 3000);
      }
    };

    // Start polling immediately, then every 3 seconds
    await pollStatus();
  }, [submitTryOnTask, checkTaskStatus]);

  const resetTask = useCallback(() => {
    setCurrentTask(null);
    setIsProcessing(false);
  }, []);

  const getStatusText = useCallback((status: TryOnStatus): string => {
    switch (status) {
      case 'PENDING':
        return '任务排队中...';
      case 'PRE-PROCESSING':
        return '前置处理中...';
      case 'RUNNING':
        return 'AI试衣生成中...';
      case 'POST-PROCESSING':
        return '后置处理中...';
      case 'SUCCEEDED':
        return '试衣完成';
      case 'FAILED':
        return '试衣失败';
      case 'CANCELED':
        return '任务已取消';
      default:
        return '未知状态';
    }
  }, []);

  return {
    isProcessing,
    currentTask,
    startTryOn,
    checkTaskStatus,
    resetTask,
    getStatusText,
  };
} 