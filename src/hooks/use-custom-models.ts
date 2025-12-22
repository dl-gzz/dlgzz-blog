'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';
import type { CustomModelDB } from '@/types/model';

interface CreateCustomModelData {
  name: string;
  height: string;
  weight: string;
  bodyType: string;
  style: string;
  imageUrl: string;
  ossKey: string;
}

export function useCustomModels() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const t = useTranslations('Dashboard.fittingRoom');

  const createCustomModel = useCallback(async (data: CreateCustomModelData): Promise<CustomModelDB | null> => {
    setIsLoading(true);

    try {
      const response = await fetch('/api/custom-models', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create custom model');
      }

      toast({
        title: t('modelAdded'),
        description: `${t('modelAdded')}: ${data.name}`,
      });

      return result.data;

    } catch (error) {
      console.error('Create custom model error:', error);
      
      toast({
        title: t('uploadFailed'),
        description: error instanceof Error ? error.message : t('uploadFailed'),
        variant: 'destructive',
      });

      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast, t]);

  const getCustomModels = useCallback(async (): Promise<CustomModelDB[]> => {
    try {
      const response = await fetch('/api/custom-models', {
        method: 'GET',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch custom models');
      }

      return result.data || [];

    } catch (error) {
      console.error('Get custom models error:', error);
      return [];
    }
  }, []);

  const deleteCustomModel = useCallback(async (modelId: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/custom-models?id=${modelId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete custom model');
      }

      toast({
        title: t('modelDeletedSuccess'),
        description: t('modelDeletedSuccess'),
      });

      return true;

    } catch (error) {
      console.error('Delete custom model error:', error);
      
      toast({
        title: t('modelDeleteFailed'),
        description: error instanceof Error ? error.message : t('modelDeleteFailed'),
        variant: 'destructive',
      });

      return false;
    }
  }, [toast, t]);

  return {
    createCustomModel,
    getCustomModels,
    deleteCustomModel,
    isLoading,
  };
} 