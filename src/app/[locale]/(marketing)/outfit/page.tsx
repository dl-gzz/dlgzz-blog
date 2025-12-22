'use client';

import Container from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Users, User, UserCheck, ExternalLink, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import type { OutfitData, FilterType } from '@/types/outfit';
import outfitsData from '../../../../../mock/data.json';

export default function OutfitPage() {
  const t = useTranslations('OutfitPage');
  const router = useRouter();
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedOutfit, setSelectedOutfit] = useState<OutfitData | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 类型转换数据
  const typedOutfitsData = outfitsData as OutfitData[];

  // 过滤数据
  const filteredOutfits = typedOutfitsData.filter((outfit) => {
    if (filter === 'all') return true;
    return outfit.sex === filter;
  });

  // 打开模态框
  const openModal = (outfit: OutfitData) => {
    setSelectedOutfit(outfit);
    setCurrentImageIndex(0);
    setIsModalOpen(true);
  };

  // 关闭模态框
  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedOutfit(null);
    setCurrentImageIndex(0);
  };

  // 轮播图导航
  const nextImage = () => {
    if (selectedOutfit) {
      setCurrentImageIndex((prev) => 
        prev === selectedOutfit.split_images.length - 1 ? 0 : prev + 1
      );
    }
  };

  const prevImage = () => {
    if (selectedOutfit) {
      setCurrentImageIndex((prev) => 
        prev === 0 ? selectedOutfit.split_images.length - 1 : prev - 1
      );
    }
  };

  // 购买按钮处理
  const handleBuyNow = (amazonUrl: string) => {
    if (amazonUrl) {
      window.open(amazonUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // 试衣按钮处理
  const handleTryOn = () => {
    if (selectedOutfit) {
      // 跳转到 fitting-room 页面，携带outfit ID
      router.push(`/fitting-room?outfitId=${selectedOutfit.id}`);
    }
  };

  return (
    <Container className="py-16">
      <div className="mx-auto max-w-7xl">
        {/* 页面标题 */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent sm:text-6xl">
            {t('title')}
          </h1>
          <p className="mt-6 text-lg leading-8 text-muted-foreground max-w-3xl mx-auto">
            {t('description')}
          </p>
        </div>

        {/* 筛选器 */}
        <div className="flex justify-end mb-8">
          <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 rounded-lg p-1 border shadow-sm">
            <Button
              variant={filter === 'all' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('all')}
              className={filter === 'all' ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700' : 'hover:bg-purple-50 dark:hover:bg-purple-900/20'}
            >
              <Users className="size-4 mr-2" />
              {t('filters.all')}
            </Button>
            <Button
              variant={filter === 'male' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('male')}
              className={filter === 'male' ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700' : 'hover:bg-purple-50 dark:hover:bg-purple-900/20'}
            >
              <User className="size-4 mr-2" />
              {t('filters.male')}
            </Button>
            <Button
              variant={filter === 'female' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setFilter('female')}
              className={filter === 'female' ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700' : 'hover:bg-purple-50 dark:hover:bg-purple-900/20'}
            >
              <UserCheck className="size-4 mr-2" />
              {t('filters.female')}
            </Button>
          </div>
        </div>

        {/* 服装卡片网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredOutfits.map((outfit) => (
            <Card 
              key={outfit.id} 
              className="group cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-[1.02] border-purple-100 dark:border-purple-800 overflow-hidden"
              onClick={() => openModal(outfit)}
            >
              <CardContent className="p-0">
                <div className="aspect-[3/4] relative overflow-hidden">
                  <Image
                    src={outfit.url}
                    alt={`${outfit.sex} outfit`}
                    fill
                    className="object-cover group-hover:scale-110 transition-transform duration-500"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <Badge 
                    className="absolute top-3 right-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white border-0"
                  >
                    {outfit.split_images.length} {outfit.split_images.length === 1 ? 'item' : 'items'}
                  </Badge>
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs border-purple-200 text-purple-700 dark:border-purple-800 dark:text-purple-300">
                      {outfit.sex === 'male' ? t('filters.male') : t('filters.female')}
                    </Badge>
                    <Button size="sm" variant="ghost" className="text-purple-600 hover:text-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20">
                      {t('buttons.viewOutfit')}
                      <Sparkles className="size-3 ml-1" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 无结果提示 */}
        {filteredOutfits.length === 0 && (
          <div className="text-center py-16">
            <div className="mx-auto w-24 h-24 mb-4 bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/20 dark:to-blue-900/20 rounded-full flex items-center justify-center">
              <Sparkles className="size-8 text-purple-600" />
            </div>
            <p className="text-muted-foreground text-lg">{t('noResults')}</p>
          </div>
        )}

        {/* 模态框 */}
        <Dialog open={isModalOpen} onOpenChange={closeModal}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                {t('modal.outfitDetails')}
              </DialogTitle>
            </DialogHeader>
            
            {selectedOutfit && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 轮播图区域 */}
                <div className="relative">
                  <div className="aspect-[3/4] relative overflow-hidden rounded-lg border shadow-lg">
                    <Image
                      src={selectedOutfit.split_images[currentImageIndex]?.url || selectedOutfit.url}
                      alt={`${selectedOutfit.split_images[currentImageIndex]?.type || 'Outfit'} - Item ${currentImageIndex + 1}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      priority
                    />
                    
                    {/* 轮播图导航按钮 */}
                    {selectedOutfit.split_images.length > 1 && (
                      <>
                        <Button
                          variant="outline"
                          size="icon"
                          className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white shadow-lg backdrop-blur-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            prevImage();
                          }}
                        >
                          <ChevronLeft className="size-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white shadow-lg backdrop-blur-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            nextImage();
                          }}
                        >
                          <ChevronRight className="size-4" />
                        </Button>
                      </>
                    )}

                    {/* 图片计数器 */}
                    <div className="absolute top-3 left-3 bg-black/70 text-white text-sm px-2 py-1 rounded">
                      {currentImageIndex + 1} / {selectedOutfit.split_images.length}
                    </div>
                  </div>

                  {/* 轮播图指示器 */}
                  {selectedOutfit.split_images.length > 1 && (
                    <div className="flex justify-center gap-2 mt-4">
                      {selectedOutfit.split_images.map((_, index) => (
                        <button
                          key={index}
                          className={`w-3 h-3 rounded-full transition-all duration-200 ${
                            index === currentImageIndex 
                              ? 'bg-purple-600 scale-125' 
                              : 'bg-gray-300 hover:bg-gray-400 hover:scale-110'
                          }`}
                          onClick={() => setCurrentImageIndex(index)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* 详情和操作区域 */}
                <div className="space-y-6">
                  <div>
                    <Badge className="mb-4 bg-gradient-to-r from-purple-600 to-blue-600">
                      {selectedOutfit.sex === 'male' ? t('filters.male') : t('filters.female')}
                    </Badge>
                    <h3 className="text-2xl font-bold mb-2 capitalize">
                      {selectedOutfit.split_images[currentImageIndex]?.type || 'Complete Outfit'}
                    </h3>
                    <p className="text-muted-foreground text-lg">
                      {t('comingSoon')}
                    </p>
                  </div>

                  {/* 操作按钮 */}
                  <div className="space-y-3">
                    {selectedOutfit.split_images[currentImageIndex]?.amazon_url && (
                      <Button 
                        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-lg py-6"
                        onClick={() => handleBuyNow(selectedOutfit.split_images[currentImageIndex]?.amazon_url)}
                      >
                        <ExternalLink className="size-5 mr-2" />
                        {t('buttons.buyNow')}
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      className="w-full border-purple-200 text-purple-700 hover:bg-purple-50 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-900/20 text-lg py-6"
                      onClick={handleTryOn}
                    >
                      <Sparkles className="size-5 mr-2" />
                      {t('buttons.tryOn')}
                    </Button>
                  </div>

                  {/* 单品列表 */}
                  <div className="border-t pt-6">
                    <h4 className="font-semibold text-lg mb-4">
                      Outfit Items ({selectedOutfit.split_images.length})
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {selectedOutfit.split_images.map((item, index) => (
                        <div 
                          key={item.id}
                          className={`relative aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all duration-200 hover:scale-105 ${
                            index === currentImageIndex 
                              ? 'border-purple-500 ring-2 ring-purple-200 dark:ring-purple-800' 
                              : 'border-gray-200 hover:border-purple-300 dark:border-gray-700 dark:hover:border-purple-600'
                          }`}
                          onClick={() => setCurrentImageIndex(index)}
                        >
                          <Image
                            src={item.url}
                            alt={item.type}
                            fill
                            className="object-cover"
                            sizes="(max-width: 768px) 50vw, 33vw"
                          />
                          <div className="absolute bottom-1 left-1 bg-black/80 text-white text-xs px-2 py-1 rounded capitalize font-medium">
                            {item.type}
                          </div>
                          {index === currentImageIndex && (
                            <div className="absolute inset-0 bg-purple-500/20 border-2 border-purple-500 rounded-lg" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Container>
  );
}
