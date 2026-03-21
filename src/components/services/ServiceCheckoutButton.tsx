'use client';

import { createServiceCheckoutAction } from '@/actions/create-service-checkout-session';
import { Button } from '@/components/ui/button';
import { Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface ServiceCheckoutButtonProps {
  userId: string;
  slug: string;
  serviceId: string;
  serviceName: string;
  priceId: string;
  className?: string;
  variant?:
    | 'default'
    | 'outline'
    | 'destructive'
    | 'secondary'
    | 'ghost'
    | 'link'
    | null;
  size?: 'default' | 'sm' | 'lg' | 'icon' | null;
  children?: React.ReactNode;
}

export function ServiceCheckoutButton({
  userId,
  slug,
  serviceId,
  serviceName,
  priceId,
  className,
  variant = 'default',
  size = 'default',
  children,
}: ServiceCheckoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    try {
      setIsLoading(true);
      const result = await createServiceCheckoutAction({
        userId,
        slug,
        serviceId,
        serviceName,
        priceId,
      });

      if (result?.data?.success && result.data.data?.url) {
        window.location.href = result.data.data.url;
        return;
      }

      toast.error(result?.data?.error || '创建购买链接失败');
    } catch (error) {
      toast.error('创建购买链接失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleClick}
      disabled={isLoading}
    >
      {isLoading ? (
        <>
          <Loader2Icon className="mr-2 size-4 animate-spin" />
          正在创建订单...
        </>
      ) : (
        children
      )}
    </Button>
  );
}
