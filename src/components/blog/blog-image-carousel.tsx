'use client';

import {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { useEffect, useState } from 'react';

interface BlogImageCarouselProps {
  images: string[];
  title: string;
}

export function BlogImageCarousel({ images, title }: BlogImageCarouselProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) return;

    const updateCurrent = () => {
      setCurrent(api.selectedScrollSnap());
    };

    updateCurrent();
    api.on('select', updateCurrent);
    api.on('reInit', updateCurrent);

    return () => {
      api.off('select', updateCurrent);
      api.off('reInit', updateCurrent);
    };
  }, [api]);

  if (images.length === 0) return null;

  if (images.length === 1) {
    return (
      <div className="group overflow-hidden relative aspect-16/9 rounded-lg transition-all border">
        <Image
          src={images[0]}
          alt={title || 'image for blog post'}
          title={title || 'image for blog post'}
          loading="eager"
          fill
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <Carousel setApi={setApi} opts={{ loop: true, align: 'start' }}>
        <CarouselContent className="-ml-0">
          {images.map((image, index) => (
            <CarouselItem key={`${image}-${index}`} className="pl-0">
              <div className="relative aspect-16/9 overflow-hidden rounded-lg border bg-muted">
                <Image
                  src={image}
                  alt={`${title || 'blog image'} ${index + 1}`}
                  title={title || 'image for blog post'}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  fill
                  className="object-contain"
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-3 bg-background/85 backdrop-blur hover:bg-background" />
        <CarouselNext className="right-3 bg-background/85 backdrop-blur hover:bg-background" />
      </Carousel>

      <div className="absolute right-4 top-4 rounded-full bg-background/85 px-3 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur">
        {current + 1} / {images.length}
      </div>

      <div className="mt-4 flex justify-center gap-2">
        {images.map((image, index) => (
          <button
            key={`${image}-dot-${index}`}
            type="button"
            aria-label={`Go to image ${index + 1}`}
            className={cn(
              'h-2 rounded-full transition-all',
              current === index
                ? 'w-6 bg-primary'
                : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
            )}
            onClick={() => api?.scrollTo(index)}
          />
        ))}
      </div>
    </div>
  );
}
