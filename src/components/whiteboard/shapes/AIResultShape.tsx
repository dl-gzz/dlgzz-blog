import { BaseBoxShapeUtil, HTMLContainer } from 'tldraw';

export class AIResultShapeUtil extends BaseBoxShapeUtil<any> {
    static override type = 'ai_result' as const;

    override getDefaultProps() {
        return {
            w: 300,
            h: 200,
            text: 'Result',
            color: '#f0fdf4'
        };
    }

    override component(shape: any) {
        const text = shape.props.text || '';

        // Check if text is a URL
        const urlPattern = /^https?:\/\/.+/i;
        const isUrl = urlPattern.test(text.trim());

        // Check if URL points to an image
        const imagePattern = /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i;
        const isImageUrl = isUrl && imagePattern.test(text.trim());

        // Check if text is HTML code
        const isHtml = text.trim().startsWith('<html') || text.trim().startsWith('<!DOCTYPE html');

        return (
            <HTMLContainer style={{
                pointerEvents: 'all',
                background: shape.props.color || '#fff',
                border: '1px solid #000',
                borderRadius: 4,
                padding: isHtml ? 0 : 12,
                overflow: 'hidden',
                fontFamily: 'monospace',
                fontSize: 14,
                whiteSpace: 'pre-wrap',
                boxShadow: '4px 4px 0px rgba(0,0,0,1)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8
            }}>
                {isHtml ? (
                    <iframe
                        srcDoc={text}
                        style={{ width: '100%', height: '100%', border: 'none' }}
                        sandbox="allow-scripts allow-forms allow-popups"
                    />
                ) : isImageUrl ? (
                    <>
                        <img
                            src={text.trim()}
                            alt="AI Generated"
                            style={{
                                maxWidth: '100%',
                                maxHeight: '200px',
                                objectFit: 'contain',
                                borderRadius: 4
                            }}
                        />
                        <a
                            href={text.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                fontSize: 10,
                                color: '#0066cc',
                                textDecoration: 'underline',
                                wordBreak: 'break-all'
                            }}
                        >
                            🔗 打开原图
                        </a>
                    </>
                ) : isUrl ? (
                    <a
                        href={text.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            color: '#0066cc',
                            textDecoration: 'underline',
                            wordBreak: 'break-all'
                        }}
                    >
                        🔗 {text.trim()}
                    </a>
                ) : (
                    text
                )}
            </HTMLContainer>
        );
    }

    override indicator(shape: any) {
        return <rect width={shape.props.w} height={shape.props.h} />;
    }
}

