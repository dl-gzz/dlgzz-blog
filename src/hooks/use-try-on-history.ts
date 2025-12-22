'use client';

import { useState, useCallback } from 'react';
import { useAction } from 'next-safe-action/hooks';
import { saveTryOnHistory, getTryOnHistory, deleteTryOnHistory } from '@/actions/try-on-history';
import { useToast } from '@/hooks/use-toast';

export interface TryOnHistoryItem {
  id: string;
  userId: string;
  modelName: string;
  modelImageUrl: string;
  clothingType: string;
  topGarmentUrl: string | null;
  bottomGarmentUrl: string | null;
  resultImageUrl: string;
  resultOssKey: string;
  originalResultUrl: string | null;
  taskId: string | null;
  outfitId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function useTryOnHistory() {
  const [history, setHistory] = useState<TryOnHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const { execute: saveHistory, isExecuting: isSaving } = useAction(saveTryOnHistory, {
    onSuccess: (result) => {
      toast({
        title: '保存成功',
        description: '试衣结果已保存到历史记录',
      });
      // 重新加载历史记录
      loadHistory();
    },
    onError: (error) => {
      toast({
        title: '保存失败',
        description: error.error.serverError || '保存试衣结果失败',
        variant: 'destructive',
      });
    },
  });

  const { execute: loadHistoryAction, isExecuting: isLoadingHistory } = useAction(getTryOnHistory, {
    onSuccess: (result) => {
      setHistory(result.data || []);
      setIsLoading(false);
    },
    onError: (error) => {
      toast({
        title: '加载失败',
        description: error.error.serverError || '加载试衣历史失败',
        variant: 'destructive',
      });
      setIsLoading(false);
    },
  });

  const { execute: deleteHistoryAction, isExecuting: isDeleting } = useAction(deleteTryOnHistory, {
    onSuccess: () => {
      toast({
        title: '删除成功',
        description: '试衣记录已删除',
      });
      // 重新加载历史记录
      loadHistory();
    },
    onError: (error) => {
      toast({
        title: '删除失败',
        description: error.error.serverError || '删除试衣记录失败',
        variant: 'destructive',
      });
    },
  });

  const loadHistory = useCallback(() => {
    setIsLoading(true);
    loadHistoryAction();
  }, [loadHistoryAction]);

  const saveTryOnResult = useCallback((data: {
    modelName: string;
    modelImageUrl: string;
    clothingType: 'topAndBottom' | 'onepiece';
    topGarmentUrl?: string;
    bottomGarmentUrl?: string;
    originalResultUrl: string;
    taskId?: string;
    outfitId?: string;
  }) => {
    saveHistory(data);
  }, [saveHistory]);

  const deleteHistoryItem = useCallback((historyId: string) => {
    deleteHistoryAction({ historyId });
  }, [deleteHistoryAction]);

  return {
    history,
    isLoading: isLoading || isLoadingHistory,
    isSaving,
    isDeleting,
    loadHistory,
    saveTryOnResult,
    deleteHistoryItem,
  };
} 