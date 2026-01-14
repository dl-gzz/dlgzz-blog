import { LockIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface PremiumBadgeProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function PremiumBadge({ className = '', size = 'md' }: PremiumBadgeProps) {
  const t = useTranslations('Blog');

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const iconSizes = {
    sm: 'size-3',
    md: 'size-4',
    lg: 'size-5',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-semibold rounded-full ${sizeClasses[size]} ${className}`}
      title={t('premiumContent')}
    >
      <LockIcon className={iconSizes[size]} />
      <span>{t('premium')}</span>
    </span>
  );
}
