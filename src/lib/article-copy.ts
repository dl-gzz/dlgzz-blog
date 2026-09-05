/** A portable article, not a summary or instructions added on the author's behalf. */
export function buildArticleCopy({
  title,
  description,
  body,
  sourceUrl,
  images = [],
}: {
  title: string;
  description?: string;
  body: string;
  sourceUrl: string;
  images?: string[];
}) {
  const parts = [`# ${title}`, `来源：${sourceUrl}`];
  if (description?.trim()) parts.push(description.trim());
  if (body.trim()) parts.push(body.trim());

  // Gallery/cover images can live in frontmatter rather than the article body.
  // Keep them as links: copying does not download or re-upload any image.
  const extraImages = [...new Set(images)].filter(
    (url) => url && !body.includes(url)
  );
  if (extraImages.length) {
    parts.push(
      '## 文章配图\n\n' +
        extraImages
          .map((url, index) => {
            const absolute = new URL(url, sourceUrl).href;
            return `![文章配图 ${index + 1}](${absolute})`;
          })
          .join('\n\n')
    );
  }
  return parts.join('\n\n');
}
