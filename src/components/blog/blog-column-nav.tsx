import { LocaleLink } from '@/i18n/navigation';
import { BLOG_COLUMNS, getBlogSubcategories, type BlogColumnId } from '@/lib/blog-columns';

export function BlogColumnNav({ active, subcategory }: { active?: BlogColumnId; subcategory?: string }) {
  return (
    <>
    <nav aria-label="文章专栏" className="mb-8 grid gap-3 sm:grid-cols-3">
      {BLOG_COLUMNS.map((column) => {
        const selected = active === column.id;
        return (
          <LocaleLink
            key={column.id}
            href={`/blog?column=${column.id}`}
            aria-current={selected ? 'page' : undefined}
            className={`rounded-2xl border p-5 transition-colors ${
              selected
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-border bg-card hover:border-blue-300 hover:bg-blue-50/60 dark:hover:bg-blue-950/20'
            }`}
          >
            <div className="font-semibold">{column.name}</div>
            <div
              className={`mt-2 text-sm leading-6 ${
                selected ? 'text-blue-100' : 'text-muted-foreground'
              }`}
            >
              {column.description}
            </div>
          </LocaleLink>
        );
      })}
    </nav>
    {active && (
      <nav aria-label="子分类" className="mb-8 flex flex-wrap gap-3">
        {[{ id: '', name: '全部' }, ...getBlogSubcategories(active)].map((item) => (
          <LocaleLink key={item.id} href={`/blog?column=${active}${item.id ? `&subcategory=${item.id}` : ''}`}
            aria-current={(subcategory || '') === item.id ? 'page' : undefined}
            className={`rounded-full px-5 py-2 text-sm ${(subcategory || '') === item.id ? 'bg-blue-600 text-white' : 'bg-muted text-muted-foreground hover:text-blue-600'}`}>
            {item.name}
          </LocaleLink>
        ))}
      </nav>
    )}
    </>
  );
}
