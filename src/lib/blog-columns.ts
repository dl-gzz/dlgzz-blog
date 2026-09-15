export const BLOG_COLUMNS = [
  {
    id: 'ai-practice',
    name: 'AI实战',
    description: 'AI 工具、自动化流程与真实工作场景的实践方法。',
  },
  {
    id: 'solo-company',
    name: '一人公司',
    description: '一个人经营产品、内容、客户与长期事业的方法。',
  },
  {
    id: 'independent-thinking',
    name: '独立沉思',
    description: '关于独立工作、长期主义与个人选择的持续思考。',
  },
] as const;

export type BlogColumnId = (typeof BLOG_COLUMNS)[number]['id'];

export const BLOG_SUBCATEGORIES = [
  { id: 'workbuddy', name: 'WorkBuddy', column: 'ai-practice' },
] as const;

export function getBlogSubcategories(column?: string) {
  return BLOG_SUBCATEGORIES.filter((item) => item.column === column);
}

export function isBlogSubcategory(column?: string | null, subcategory?: string | null) {
  return BLOG_SUBCATEGORIES.some((item) => item.column === column && item.id === subcategory);
}

export function isBlogColumnId(value?: string | null): value is BlogColumnId {
  return BLOG_COLUMNS.some((column) => column.id === value);
}
