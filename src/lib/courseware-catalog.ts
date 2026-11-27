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
    id: 'zhi-shu-shi-yan',
    title: '植树大冒险',
    articleHref: '/blog/zhi-shu-shi-yan',
    entryHref: '/courseware/zhi-shu-shi-yan/index.html',
    description: '从空路点种、均匀排列，完成直路、公路两侧和圆形花坛等五关。',
    searchTerms: ['zhi shu shi yan', '植树实验', '植树问题', '间隔', '端点', '公路两侧', '封闭路线'],
    teachingPoints: [
      '切换端点种法，比较间隔数和实际棵数。',
      '在校园直路、公路两侧与封闭路线中验证数量关系。',
    ],
  },
] as const;

export type CoursewareProduct = (typeof PUBLIC_COURSEWARE)[number];

export function isRetiredCoursewareId(id: unknown): id is 'zhi-shu' {
  return id === 'zhi-shu';
}

/** Retiring a lesson must not send its bookmarked URL into another local board. */
export function coursewareBoardKey(id: unknown) {
  const boardId = isRetiredCoursewareId(id) ? id : getCourseware(id)?.id;
  return boardId ? `oneworker-board-v2:courseware:${boardId}` : null;
}

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
