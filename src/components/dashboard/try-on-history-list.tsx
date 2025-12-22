'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, Download, Calendar, User, Shirt } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useTryOnHistory, type TryOnHistoryItem } from '@/hooks/use-try-on-history';
import { formatDistanceToNow } from 'date-fns';
import { zhCN, enUS } from 'date-fns/locale';
import { useLocale } from 'next-intl';

export function TryOnHistoryList() {
  const t = useTranslations('Dashboard.fittingRoom');
  const locale = useLocale();
  const { history, isLoading, isDeleting, loadHistory, deleteHistoryItem } = useTryOnHistory();

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const formatDate = (date: Date) => {
    return formatDistanceToNow(new Date(date), {
      addSuffix: true,
      locale: locale === 'zh' ? zhCN : enUS,
    });
  };

  const getClothingTypeText = (type: string) => {
    return type === 'topAndBottom' ? t('topAndBottomType') : t('onepieceType');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-500" />
          <p className="text-gray-600">{t('loadingTryOnHistory')}</p>
        </div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="mx-auto w-24 h-24 mb-4 bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 rounded-full flex items-center justify-center">
          <Shirt className="size-8 text-purple-600" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">{t('noTryOnHistory')}</h3>
        <p className="text-gray-500 mb-6">{t('startFirstTryOn')}</p>
        <Button 
          onClick={() => window.location.href = '/fitting-room'}
          className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
        >
          {t('startTryOn')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('tryOnHistory')}</h2>
          <p className="text-muted-foreground">{t('yourTryOnRecords')} ({history.length} {t('records')})</p>
        </div>
        <Button 
          onClick={loadHistory}
          variant="outline"
          disabled={isLoading}
        >
          {t('refresh')}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {history.map((item: TryOnHistoryItem) => (
          <Card key={item.id} className="group hover:shadow-lg transition-shadow duration-300 max-h-[380px] overflow-hidden">
            <div className="relative overflow-hidden bg-gray-100 flex items-center justify-center" style={{ height: '240px' }}>
              <Image
                src={item.resultImageUrl}
                alt={t('aiTryOnResult')}
                width={0}
                height={0}
                sizes="100vw"
                className="max-w-full max-h-full w-auto h-auto object-contain group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute top-2 right-2">
                <Badge variant="secondary" className="bg-white/90">
                  {getClothingTypeText(item.clothingType)}
                </Badge>
              </div>
            </div>
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User className="h-3 w-3" />
                <span className="truncate">{item.modelName}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Calendar className="h-3 w-3" />
                <span>{formatDate(item.createdAt)}</span>
              </div>
              <div className="flex gap-2 pt-1">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1 h-7 text-xs"
                  onClick={() => window.open(item.resultImageUrl, '_blank')}
                >
                  <Download className="h-3 w-3 mr-1" />
                  {t('download')}
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => deleteHistoryItem(item.id)}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
} 