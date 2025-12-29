'use client';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useLocaleRouter } from '@/i18n/navigation';
import { FileTextIcon, Loader2Icon } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

// Fumadocs search API response format
interface SearchResult {
  id: string;
  url: string;
  content: string;  // This is the title/content
  type: 'page' | 'heading' | 'text';
}

interface GlobalSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearchDialog({
  open,
  onOpenChange,
}: GlobalSearchDialogProps) {
  const t = useTranslations('Search');
  const locale = useLocale();
  const router = useLocaleRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          query: query.trim(),
          locale: locale,
        });
        const response = await fetch(`/api/search?${params.toString()}`);
        const data: SearchResult[] = await response.json();
        // Filter to only show pages and headings (not text fragments)
        const filteredResults = data.filter(
          (item) => item.type === 'page' || item.type === 'heading'
        );
        setResults(filteredResults);
      } catch (error) {
        console.error('Search error:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, locale]);

  const handleSelect = useCallback(
    (value: string) => {
      // Find the result by id
      const result = results.find((r) => r.id === value);
      if (result) {
        onOpenChange(false);
        router.push(result.url);
      }
    },
    [results, onOpenChange, router]
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('title')}
      description={t('description')}
      shouldFilter={false}
    >
      <CommandInput
        placeholder={t('placeholder')}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : results.length === 0 ? (
          <CommandEmpty>
            {query.trim() ? t('noResults') : t('typeToSearch')}
          </CommandEmpty>
        ) : (
          <CommandGroup heading={t('results', { count: results.length })}>
            {results.map((result) => (
              <CommandItem
                key={result.id}
                value={result.id}
                onSelect={handleSelect}
                className="cursor-pointer"
              >
                <FileTextIcon className="mr-2 size-4 shrink-0" />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-medium truncate">{result.content}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {result.url}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
