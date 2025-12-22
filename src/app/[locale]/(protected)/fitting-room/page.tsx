'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useUpload } from '@/hooks/use-upload';
import { useCustomModels } from '@/hooks/use-custom-models';
import { useAITryOn } from '@/hooks/use-ai-tryon';
import { useTryOnHistory } from '@/hooks/use-try-on-history';
import { useSubscriptionAccess } from '@/hooks/use-subscription-access';
import { AITryOnDisplay } from '@/components/fitting-room/ai-tryon-display';
import { Upload, Plus, Shirt, Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Model } from '@/types/model';
import type { OutfitData } from '@/types/outfit';
import modelsData from '../../../../../mock/models.json';
import outfitsData from '../../../../../mock/data.json';

interface ClothingImages {
  top?: File;
  bottom?: File;
  onepiece?: File;
}

interface ClothingUrls {
  top?: string;
  bottom?: string;
  onepiece?: string;
}

export default function FittingRoomPage() {
  const t = useTranslations('Dashboard.fittingRoom');
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const { uploadFile, isUploading } = useUpload();
  const { createCustomModel, getCustomModels, deleteCustomModel, isLoading: isCustomModelLoading } = useCustomModels();
  const { isProcessing, currentTask, startTryOn, resetTask, getStatusText } = useAITryOn();
  const { saveTryOnResult, isSaving } = useTryOnHistory();
  const { hasAccess: hasSubscriptionAccess, isLoading: isCheckingSubscription, isLifetime } = useSubscriptionAccess();
  
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [clothingType, setClothingType] = useState<'topAndBottom' | 'onepiece'>('topAndBottom');
  const [clothingImages, setClothingImages] = useState<ClothingImages>({});
  const [clothingUrls, setClothingUrls] = useState<ClothingUrls>({});
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showModelSelection, setShowModelSelection] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [preloadedOutfit, setPreloadedOutfit] = useState<OutfitData | null>(null);
  
  // New model form state
  const [newModel, setNewModel] = useState({
    name: '',
    height: '',
    weight: '',
    bodyType: '',
    style: '',
    image: null as File | null,
    imageUrl: '',
    ossKey: ''
  });
  const [isModelUploading, setIsModelUploading] = useState(false);
  
  const fileInputRefs = {
    top: useRef<HTMLInputElement>(null),
    bottom: useRef<HTMLInputElement>(null),
    onepiece: useRef<HTMLInputElement>(null),
    model: useRef<HTMLInputElement>(null)
  };

  // Load user models from database
  const loadUserModels = useCallback(async () => {
    setIsLoadingModels(true);
    try {
      const userModels = await getCustomModels();
      
      // Convert default models format
      const defaultModels: Model[] = modelsData.map(model => ({
        ...model,
        body: model.body,
        image: model.image,
        isCustom: false
      }));
      
      // Convert user models format and put them first
      const customModels: Model[] = userModels.map(model => ({
        id: model.id,
        name: model.name,
        style: model.style,
        height: model.height,
        weight: model.weight,
        body: model.bodyType,
        image: model.imageUrl,
        selected: false,
        isCustom: true
      }));
      
      // Custom models first, then default models
      setModels([...customModels, ...defaultModels]);
    } catch (error) {
      console.error('Failed to load models:', error);
      // Fallback to default models only
      const defaultModels: Model[] = modelsData.map(model => ({
        ...model,
        body: model.body,
        image: model.image,
        isCustom: false
      }));
      setModels(defaultModels);
    } finally {
      setIsLoadingModels(false);
    }
  }, [getCustomModels]);

  // Load models on component mount
  useEffect(() => {
    loadUserModels();
  }, [loadUserModels]);

  // Handle outfit preloading from URL params
  useEffect(() => {
    const outfitId = searchParams.get('outfitId');
    if (outfitId) {
      const typedOutfitsData = outfitsData as OutfitData[];
      const outfit = typedOutfitsData.find(o => o.id === outfitId);
      
      if (outfit) {
        setPreloadedOutfit(outfit);
        
        // Set clothing type based on outfit type
        if (outfit.type === 1) {
          setClothingType('onepiece');
        } else if (outfit.type === 2) {
          setClothingType('topAndBottom');
        }
        
        // Preload clothing URLs
        const newClothingUrls: ClothingUrls = {};
        
        if (outfit.type === 1) {
          // One-piece: use the first (and usually only) item
          const onePieceItem = outfit.split_images[0];
          if (onePieceItem) {
            newClothingUrls.onepiece = onePieceItem.url;
          }
        } else if (outfit.type === 2) {
          // Two-piece: find top and bottom
          const topItem = outfit.split_images.find(item => item.type === 'top');
          const bottomItem = outfit.split_images.find(item => item.type === 'bottom');
          
          if (topItem) {
            newClothingUrls.top = topItem.url;
          }
          if (bottomItem) {
            newClothingUrls.bottom = bottomItem.url;
          }
        }
        
        setClothingUrls(newClothingUrls);
        
        toast({
          title: '服装已预加载',
          description: `已从套装中加载${outfit.type === 1 ? '连体衣' : '上装和下装'}`,
        });
      }
    }
  }, [searchParams, toast]);

  const handleModelSelect = useCallback((model: Model) => {
    setSelectedModel(model);
    setModels(prev => prev.map(m => ({ ...m, selected: m.id === model.id })));
  }, []);

  const handleFileUpload = useCallback(async (type: keyof ClothingImages, file: File) => {
    setClothingImages(prev => ({ ...prev, [type]: file }));
    
    // 立即上传服装图片
    const uploadResult = await uploadFile(file, 'clothing');
    if (uploadResult) {
      setClothingUrls(prev => ({ ...prev, [type]: uploadResult.url }));
    }
  }, [uploadFile]);

  const handleModelImageUpload = useCallback(async (file: File) => {
    setNewModel(prev => ({ ...prev, image: file }));
    
    // 立即上传模特图片
    setIsModelUploading(true);
    const uploadResult = await uploadFile(file, 'model');
    if (uploadResult) {
      setNewModel(prev => ({ 
        ...prev, 
        imageUrl: uploadResult.url,
        ossKey: uploadResult.ossKey 
      }));
    }
    setIsModelUploading(false);
  }, [uploadFile]);

  const handleStartTryOn = useCallback(async () => {
    if (!selectedModel) {
      toast({
        title: 'Error',
        description: t('selectModelFirst'),
        variant: 'destructive'
      });
      return;
    }

    const hasRequiredImages = clothingType === 'topAndBottom' 
      ? clothingUrls.top && clothingUrls.bottom
      : clothingUrls.onepiece;

    if (!hasRequiredImages) {
      toast({
        title: 'Error',
        description: t('uploadClothingFirst'),
        variant: 'destructive'
      });
      return;
    }

    // Check subscription access
    if (!hasSubscriptionAccess) {
      toast({
        title: '付费功能',
        description: 'AI虚拟试衣功能仅限付费用户使用',
        variant: 'destructive'
      });
      return;
    }

    // 立即退出模特选择界面，显示AI试衣界面
    setShowModelSelection(false);

    // Call AI try-on API
    await startTryOn({
      personImageUrl: selectedModel.image,
      topGarmentUrl: clothingType === 'topAndBottom' ? clothingUrls.top : undefined,
      bottomGarmentUrl: clothingType === 'topAndBottom' ? clothingUrls.bottom : clothingUrls.onepiece,
    });
  }, [selectedModel, clothingType, clothingUrls, toast, t, startTryOn]);

  const handleAddModel = useCallback(async () => {
    if (!newModel.name || !newModel.height || !newModel.weight || !newModel.bodyType || !newModel.style || !newModel.imageUrl) {
      toast({
        title: 'Error',
        description: t('fillAllFields'),
        variant: 'destructive'
      });
      return;
    }

    const result = await createCustomModel({
      name: newModel.name,
      height: newModel.height,
      weight: newModel.weight,
      bodyType: newModel.bodyType,
      style: newModel.style,
      imageUrl: newModel.imageUrl,
      ossKey: newModel.ossKey,
    });

    if (result) {
      setIsDialogOpen(false);
      setNewModel({
        name: '',
        height: '',
        weight: '',
        bodyType: '',
        style: '',
        image: null,
        imageUrl: '',
        ossKey: ''
      });
      // Reload models to show the new one
      await loadUserModels();
    }
  }, [newModel, createCustomModel, t, toast, loadUserModels]);

  const handleDeleteModel = useCallback(async (model: Model) => {
    if (!model.isCustom) {
      toast({
        title: 'Error',
        description: t('cannotDeleteDefault'),
        variant: 'destructive'
      });
      return;
    }

    const success = await deleteCustomModel(model.id);
    if (success) {
      // Remove from current list
      setModels(prev => prev.filter(m => m.id !== model.id));
      
      // If deleted model was selected, clear selection
      if (selectedModel?.id === model.id) {
        setSelectedModel(null);
      }
    }
  }, [deleteCustomModel, selectedModel, toast, t]);

  const handleSelectModelClick = () => {
    setShowModelSelection(true);
  };

  const handleSaveTryOnResult = useCallback(() => {
    if (!selectedModel || !currentTask?.imageUrl) {
      toast({
        title: 'Error',
        description: '没有可保存的试衣结果',
        variant: 'destructive'
      });
      return;
    }

    const saveData = {
      modelName: selectedModel.name,
      modelImageUrl: selectedModel.image,
      clothingType: clothingType,
      topGarmentUrl: clothingType === 'topAndBottom' ? clothingUrls.top : undefined,
      bottomGarmentUrl: clothingType === 'topAndBottom' ? clothingUrls.bottom : clothingUrls.onepiece,
      originalResultUrl: currentTask.imageUrl,
      taskId: currentTask.taskId,
      outfitId: preloadedOutfit?.id,
    };

    saveTryOnResult(saveData);
  }, [selectedModel, currentTask, clothingType, clothingUrls, preloadedOutfit, saveTryOnResult, toast]);

  const FileUploadArea = ({ type, label }: { type: keyof ClothingImages; label: string }) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div 
        className={`border-2 border-dashed rounded-lg p-3 text-center transition-colors cursor-pointer min-h-[140px] flex flex-col justify-center ${
          clothingUrls[type] 
            ? 'border-green-300 bg-green-50 hover:border-green-400' 
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onClick={() => fileInputRefs[type]?.current?.click()}
      >
        {clothingUrls[type] ? (
          <div className="space-y-1">
            <div className="w-16 h-24 mx-auto relative rounded-lg overflow-hidden shadow-sm">
              <Image
                src={clothingUrls[type]!}
                alt={`${label} preview`}
                fill
                className="object-cover"
              />
            </div>
            <p className="text-xs text-green-600 font-medium">✓ {preloadedOutfit ? t('preloaded') : t('uploadSuccess')}</p>
            {clothingImages[type] && (
              <>
                <p className="text-xs text-gray-500 truncate px-1" title={clothingImages[type]?.name}>
                  {clothingImages[type]?.name}
                </p>
                <p className="text-xs text-gray-400">
                  {`${(clothingImages[type]!.size / 1024 / 1024).toFixed(2)} MB`}
                </p>
              </>
            )}
            <p className="text-xs text-blue-600 hover:text-blue-800">
              {t('clickToReupload')}
            </p>
          </div>
        ) : isUploading ? (
          <div className="space-y-2">
            <div className="w-16 h-24 mx-auto flex items-center justify-center bg-gray-100 rounded-lg">
              <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
            </div>
            <p className="text-xs text-purple-600">{t('uploadInProgress')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="w-16 h-24 mx-auto flex items-center justify-center bg-gray-50 rounded-lg border border-gray-200">
              <Upload className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-xs text-gray-600">
              {t('dragDropImage')}
            </p>
          </div>
        )}
        <input
          ref={fileInputRefs[type]}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(type, file);
          }}
        />
      </div>
    </div>
  );



      return (
    <div className="container mx-auto p-6 h-100vh flex gap-6">
      {/* Left Panel - Controls */}
      <div className="w-80 space-y-4 overflow-y-auto">
        {/* Model Selection */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Shirt className="h-4 w-4" />
              {t('selectModel')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              variant="outline" 
              className="w-full justify-start h-auto p-3"
              onClick={handleSelectModelClick}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center overflow-hidden">
                  {selectedModel ? (
                    <Image
                      src={selectedModel.image}
                      alt={selectedModel.name}
                      width={48}
                      height={48}
                      className="w-full h-full object-cover rounded"
                    />
                  ) : (
                    <Shirt className="h-6 w-6 text-gray-500" />
                  )}
                </div>
                <div className="text-left">
                  <p className="font-medium text-sm">
                    {selectedModel ? selectedModel.name : t('selectModel')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {selectedModel ? selectedModel.style : t('clickToSelectModel')}
                  </p>
                </div>
              </div>
            </Button>
            
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  <Plus className="h-4 w-4 mr-2" />
                  {t('addModel')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{t('addNewModel')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>{t('uploadModelImage')}</Label>
                    <div 
                      className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors cursor-pointer"
                      onClick={() => fileInputRefs.model?.current?.click()}
                    >
                      {newModel.imageUrl ? (
                        <div className="space-y-2">
                          <div className="w-24 h-32 mx-auto relative">
                            <Image
                              src={newModel.imageUrl}
                              alt="Model preview"
                              fill
                              className="object-cover rounded"
                            />
                          </div>
                          <p className="text-xs text-green-600">✓ {t('uploadSuccess')}</p>
                        </div>
                      ) : isModelUploading ? (
                        <div className="space-y-2">
                          <Loader2 className="mx-auto h-8 w-8 animate-spin text-purple-500" />
                          <p className="text-sm text-purple-600">{t('uploadInProgress')}</p>
                        </div>
                      ) : (
                        <>
                          <Upload className="mx-auto h-6 w-6 text-gray-400 mb-2" />
                          <p className="text-sm text-gray-600">
                            {newModel.image ? newModel.image.name : t('dragDropImage')}
                          </p>
                        </>
                      )}
                      <input
                        ref={fileInputRefs.model}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleModelImageUpload(file);
                        }}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label>{t('modelName')}</Label>
                    <Input
                      value={newModel.name}
                      onChange={(e) => setNewModel(prev => ({ ...prev, name: e.target.value }))}
                      placeholder={t('modelName')}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label>{t('height')}</Label>
                      <Input
                        value={newModel.height}
                        onChange={(e) => setNewModel(prev => ({ ...prev, height: e.target.value }))}
                        placeholder="165cm"
                      />
                    </div>
                    <div>
                      <Label>{t('weight')}</Label>
                      <Input
                        value={newModel.weight}
                        onChange={(e) => setNewModel(prev => ({ ...prev, weight: e.target.value }))}
                        placeholder="50kg"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <Label>{t('bodyType')}</Label>
                    <Select value={newModel.bodyType} onValueChange={(value) => setNewModel(prev => ({ ...prev, bodyType: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('bodyType')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pear Shape">Pear Shape</SelectItem>
                        <SelectItem value="Hourglass">Hourglass</SelectItem>
                        <SelectItem value="Athletic">Athletic</SelectItem>
                        <SelectItem value="Rectangle">Rectangle</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label>{t('style')}</Label>
                    <Select value={newModel.style} onValueChange={(value) => setNewModel(prev => ({ ...prev, style: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('style')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Elegant">Elegant</SelectItem>
                        <SelectItem value="Casual">Casual</SelectItem>
                        <SelectItem value="Athletic">Athletic</SelectItem>
                        <SelectItem value="Professional">Professional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                      className="flex-1"
                    >
                      {t('cancel')}
                    </Button>
                    <Button
                      onClick={handleAddModel}
                      disabled={isModelUploading}
                      className="flex-1"
                    >
                      {isModelUploading ? t('uploading') : t('confirm')}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        <Separator />

        {/* Clothing Type Selection */}
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">{t('clothingType')}</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup value={clothingType} onValueChange={(value: 'topAndBottom' | 'onepiece') => setClothingType(value)} disabled={!!preloadedOutfit}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="topAndBottom" id="topAndBottom" disabled={!!preloadedOutfit} />
                <Label htmlFor="topAndBottom" className={preloadedOutfit ? 'text-gray-500' : ''}>{t('topAndBottom')}</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="onepiece" id="onepiece" disabled={!!preloadedOutfit} />
                <Label htmlFor="onepiece" className={preloadedOutfit ? 'text-gray-500' : ''}>{t('onepiece')}</Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* File Upload */}
        <Card>
          <CardContent className="pt-0 space-y-3">
            {clothingType === 'topAndBottom' ? (
              <>
                <FileUploadArea type="top" label={t('uploadTop')} />
                <FileUploadArea type="bottom" label={t('uploadBottom')} />
              </>
            ) : (
              <FileUploadArea type="onepiece" label={t('uploadClothing')} />
            )}
          </CardContent>
        </Card>

        {/* Start Try-On Button */}
        {!hasSubscriptionAccess && !isCheckingSubscription ? (
          <div className="space-y-3">
            <Button 
              disabled
              className="w-full bg-gray-400 cursor-not-allowed"
            >
                             <span className="flex items-center gap-2">
                 🔒 {t('paidFeature')}
               </span>
             </Button>
             <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-center">
               <p className="text-sm text-purple-800 font-medium mb-2">
                 {t('subscriptionRequiredMessage')}
               </p>
               <p className="text-xs text-purple-600 mb-3">
                 {t('subscriptionRequiredDescription')}
               </p>
               <Button 
                 onClick={() => window.location.href = '/pricing'}
                 className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-xs h-8"
               >
                 {t('upgradeToPro')}
               </Button>
            </div>
          </div>
        ) : (
          <Button 
            onClick={handleStartTryOn}
            disabled={isProcessing || isCheckingSubscription}
            className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
          >
            {isCheckingSubscription ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('checkingSubscription')}
              </span>
            ) : isProcessing ? (
              getStatusText(currentTask?.status || 'PENDING')
            ) : (
              <span className="flex items-center gap-2">
                {isLifetime && '👑'} {t('startTryOn')}
              </span>
            )}
          </Button>
        )}
      </div>

      {/* Right Panel - Display Area */}
      <div className="flex-1 bg-gray-50 rounded-lg p-6 overflow-y-auto">
        {showModelSelection && !isProcessing ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">{t('modelSelection')}</h3>
              <div className="flex gap-2">
                {selectedModel && (
                  <Button 
                    onClick={handleStartTryOn}
                    disabled={isProcessing}
                    className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
                    size="sm"
                  >
                    {t('startTryOn')}
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowModelSelection(false)}
                >
                  {t('goBack')}
                </Button>
              </div>
            </div>
            
            {isLoadingModels ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center space-y-4">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-purple-500" />
                  <p className="text-gray-600">{t('loadingModels')}</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {models.map((model) => (
                  <div
                    key={model.id}
                    className={`relative cursor-pointer rounded-lg border-2 p-2 transition-all hover:shadow-md ${
                      model.selected ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* Delete button for custom models */}
                    {model.isCustom && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-1 right-1 z-10 h-6 w-6 p-0 bg-red-500 hover:bg-red-600 text-white rounded-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteModel(model);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                    
                    {/* Custom model badge */}
                    {model.isCustom && (
                      <div className="absolute top-1 left-1 z-10 bg-blue-500 text-white text-xs px-1 py-0.5 rounded">
                        {t('customModel')}
                      </div>
                    )}
                    
                    <div
                      onClick={() => handleModelSelect(model)}
                      className="w-full"
                    >
                      <div className="w-full h-48 relative mb-2">
                        <Image
                          src={model.image}
                          alt={model.name}
                          fill
                          className="object-contain rounded"
                        />
                        {model.selected && (
                          <div className="absolute top-1 right-1 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                            <div className="w-1.5 h-1.5 bg-white rounded-full" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-1 text-center">
                        <h4 className="font-medium text-xs truncate">{model.name}</h4>
                        <p className="text-xs text-gray-600 truncate">{model.style}</p>
                        <div className="text-xs text-gray-500">
                          <div>{model.height}</div>
                          <div>{model.weight}</div>
                        </div>
                        <p className="text-xs text-gray-500 truncate">{model.body}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <AITryOnDisplay
            isProcessing={isProcessing}
            status={currentTask?.status}
            statusText={currentTask?.status ? getStatusText(currentTask.status) : undefined}
            resultImageUrl={currentTask?.imageUrl}
            onRetry={() => {
              resetTask();
              handleStartTryOn();
            }}
            onReset={() => {
              resetTask();
              setShowModelSelection(true);
            }}
            onSave={handleSaveTryOnResult}
            isSaving={isSaving}
          />
        )}
      </div>
    </div>
  );
}
