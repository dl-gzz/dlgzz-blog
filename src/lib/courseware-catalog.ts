/** Authored, public lessons. Do not add private whiteboards or drafts here. */
const PUBLIC_COURSEWARE = [
  {
    id: 'cao-chong',
    title: '曹冲称象',
    articleHref: '/blog/cao-chong-weighs-elephant',
    entryHref: '/courseware/cao-chong/index.html',
    description: '用同一条船和吃水线，让学生动手验证石头和大象的总质量相同。',
    searchTerms: ['cao chong', '吃水线', '浮力', '称重', '小学'],
    teachingPoints: [
      '拖大象上船，观察水面并画出吃水线。',
      '让大象回岸，逐块加石头，直到吃水线与水面重合。',
      '每批最多称三块石头，记录各批质量，相加后填写答案。',
      '讨论为什么同一条船回到相同吃水位置，说明两次载重相同。',
    ],
  },
  {
    id: 'zhi-shu',
    title: '直线植树',
    articleHref: '/blog/zhi-shu-wen-ti',
    entryHref: '/courseware/zhi-shu/index.html',
    description: '比较四种端点种法，再玩校门挑战：先领苗种树，校门换边后用原来的树重新布置。',
    searchTerms: ['zhi shu', '植树问题', '间隔', '端点', '小学数学'],
    teachingPoints: [
      '沿编号数出直路上的等距间隔。',
      '保持间隔数，比较四种端点种法，只观察两端树的变化。',
      '观察只有一段间隔且两端不种时，路段仍在，树数为零。',
      '先估算树苗数量，种好后移动校门，解释为什么不需要多领树苗。',
    ],
  },
] as const;

export type CoursewareProduct = (typeof PUBLIC_COURSEWARE)[number];

/** Only authored courseware IDs can resolve to executable lesson documents. */
export function getCourseware(id: unknown): CoursewareProduct | undefined {
  return PUBLIC_COURSEWARE.find((product) => product.id === id);
}

export function coursewareWhiteboardHref(product: CoursewareProduct) {
  return `/whiteboard?courseware=${encodeURIComponent(product.id)}`;
}

function normalizeCoursewareQuery(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[《》「」]/g, '').trim();
}

export function findPublishedCourseware(query?: string) {
  if (query === undefined) return PUBLIC_COURSEWARE;
  const search = normalizeCoursewareQuery(query);
  if (!search) return [];
  return PUBLIC_COURSEWARE.filter((product) => {
    const title = normalizeCoursewareQuery(product.title);
    return (
      search.includes(title) ||
      [product.id, title, ...product.searchTerms].some((term) =>
        term.includes(search)
      )
    );
  });
}
