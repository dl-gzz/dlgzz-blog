import { BaseBoxShapeUtil, HTMLContainer } from 'tldraw';

export class PreviewHTMLShapeUtil extends BaseBoxShapeUtil<any> {
    static override type = 'preview_html' as const;

    override getDefaultProps() {
        return {
            w: 480,
            h: 640,
            html: '<div style="padding: 24px;"><h2>Loading App...</h2></div>',
            source: ''
        };
    }

    override component(shape: any) {
        return (
            <HTMLContainer style={{
                pointerEvents: 'all',
                background: '#fff',
                borderRadius: 8,
                boxShadow: '0 0 10px rgba(0,0,0,0.1)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Drag Handle Header */}
                <div
                    style={{
                        height: 32,
                        background: '#f3f4f6',
                        borderBottom: '1px solid #e5e7eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'grab',
                        userSelect: 'none'
                    }}
                    className="custom-drag-handle"
                >
                    <div style={{
                        width: 40,
                        height: 4,
                        borderRadius: 2,
                        background: '#d1d5db'
                    }} />
                </div>
                {/* Iframe Content */}
                <iframe
                    srcDoc={shape.props.html}
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        background: '#fff'
                    }}
                    sandbox="allow-scripts allow-top-navigation-by-user-activation allow-forms allow-same-origin allow-popups allow-modals allow-downloads"
                    onPointerDown={(e) => e.stopPropagation()}
                />
            </HTMLContainer>
        );
    }

    override indicator(shape: any) {
        return <rect width={shape.props.w} height={shape.props.h} />;
    }
}
