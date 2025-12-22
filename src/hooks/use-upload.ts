'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface UploadResponse {
  success: boolean;
  url: string;
  ossKey: string;
  filename: string;
  size: number;
  type: string;
}

interface UploadError {
  error: string;
}

export function useUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const uploadFile = useCallback(async (
    file: File, 
    type: 'model' | 'clothing'
  ): Promise<UploadResponse | null> => {
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        const errorData = data as UploadError;
        throw new Error(errorData.error || 'Upload failed');
      }

      const uploadResponse = data as UploadResponse;
      
      toast({
        title: '上传成功',
        description: `文件 ${file.name} 上传成功`,
      });

      return uploadResponse;

    } catch (error) {
      console.error('Upload error:', error);
      
      toast({
        title: '上传失败',
        description: error instanceof Error ? error.message : '上传过程中发生错误，请重试',
        variant: 'destructive',
      });

      return null;
    } finally {
      setIsUploading(false);
    }
  }, [toast]);

  return {
    uploadFile,
    isUploading,
  };
} 