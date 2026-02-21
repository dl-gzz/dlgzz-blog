import { BaseBoxShapeUtil, HTMLContainer, type TLBaseShape } from 'tldraw';

interface BlogPostShapeProps {
  w: number;
  h: number;
  title: string;
  description: string;
  image: string;
  date: string;
  categories: string[];
  url: string;
}

type BlogPostShape = TLBaseShape<'blog_post', BlogPostShapeProps>;

export class BlogPostShapeUtil extends BaseBoxShapeUtil<BlogPostShape> {
  static override type = 'blog_post' as const;

  override getDefaultProps(): BlogPostShapeProps {
    return {
      w: 320,
      h: 380,
      title: 'Blog Post',
      description: '',
      image: '',
      date: '',
      categories: [],
      url: '',
    };
  }

  override component(shape: BlogPostShape) {
    const { title, description, image, date, categories, url } =
      shape.props;

    const formattedDate = date
      ? new Date(date).toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : '';

    return (
      <HTMLContainer
        style={{
          pointerEvents: 'all',
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        {/* 封面图 */}
        {image && (
          <div
            style={{
              width: '100%',
              height: 180,
              overflow: 'hidden',
              background: '#f3f4f6',
              flexShrink: 0,
            }}
          >
            <img
              src={image}
              alt={title}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          </div>
        )}

        {/* 内容区 */}
        <div
          style={{
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            flex: 1,
          }}
        >
          {/* 分类标签 */}
          {categories.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {categories.map((cat, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 11,
                    padding: '2px 8px',
                    background: '#dbeafe',
                    color: '#1e40af',
                    borderRadius: 4,
                    fontWeight: 500,
                  }}
                >
                  {cat}
                </span>
              ))}
            </div>
          )}

          {/* 标题 */}
          <h3
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: '#111',
              margin: 0,
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {title}
          </h3>

          {/* 描述 */}
          {description && (
            <p
              style={{
                fontSize: 13,
                color: '#6b7280',
                margin: 0,
                lineHeight: 1.5,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {description}
            </p>
          )}

          {/* 底部：日期 + 链接 */}
          <div
            style={{
              marginTop: 'auto',
              paddingTop: 8,
              borderTop: '1px solid #f3f4f6',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 12, color: '#9ca3af' }}>
              {formattedDate}
            </span>
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 12,
                  color: '#3b82f6',
                  textDecoration: 'none',
                  fontWeight: 500,
                }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                打开文章 →
              </a>
            )}
          </div>
        </div>
      </HTMLContainer>
    );
  }

  override indicator(shape: BlogPostShape) {
    return (
      <rect
        width={shape.props.w}
        height={shape.props.h}
        rx={12}
        ry={12}
      />
    );
  }
}
