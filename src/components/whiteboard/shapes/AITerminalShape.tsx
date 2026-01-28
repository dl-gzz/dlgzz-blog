import { BaseBoxShapeUtil, HTMLContainer, createShapeId, useEditor, TLBaseShape } from 'tldraw';
import React, { useState } from 'react';

// 定义 Shape 的 Props 类型
interface AITerminalShapeProps {
    w: number;
    h: number;
    messages: Array<{ role: 'user' | 'ai' | 'error'; text: string }>;
    sessionId: string | null;
    status: string;
}

// 定义 Shape 类型
type AITerminalShape = TLBaseShape<'ai_terminal', AITerminalShapeProps>;

// Helper Component for Collapsible Code
const CollapsibleCode = ({ code }: { code: string }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div style={{ marginTop: 8, marginBottom: 8, border: '1px solid #444', borderRadius: 6, overflow: 'hidden' }}>
            <div
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                    padding: '6px 10px',
                    background: '#252526',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    color: '#858585',
                    userSelect: 'none'
                }}
            >
                <span style={{ fontSize: 10 }}>{isOpen ? '▼' : '▶'}</span>
                <span style={{ fontWeight: 600 }}>JSON Actions Output</span>
            </div>
            {isOpen && (
                <div style={{ padding: 10, background: '#1e1e1e', overflowX: 'auto', borderTop: '1px solid #333' }}>
                    <code style={{ fontSize: 11, fontFamily: 'monospace', color: '#ce9178', whiteSpace: 'pre' }}>
                        {code}
                    </code>
                </div>
            )}
        </div>
    );
};

export class AITerminalShapeUtil extends BaseBoxShapeUtil<AITerminalShape> {
    static override type = 'ai_terminal' as const;

    override getDefaultProps(): AITerminalShapeProps {
        return {
            w: 400,
            h: 500,
            messages: [],
            sessionId: null,
            status: 'idle'
        };
    }

    override component(shape: AITerminalShape) {
        const editor = useEditor();
        const [input, setInput] = useState('');
        const [isSending, setIsSending] = useState(false);
        const messagesEndRef = React.useRef<HTMLDivElement>(null);

        // 自动滚动到底部
        const scrollToBottom = () => {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        };

        React.useEffect(() => {
            scrollToBottom();
        }, [shape.props.messages, isSending]);

        // 发送消息
        const sendMessage = async () => {
            if (!input.trim() || isSending) return;

            const userText = input;
            setInput('');
            setIsSending(true);

            // 1. 更新 UI：添加用户消息
            const newMessages = [
                ...(shape.props.messages || []),
                { role: 'user' as const, text: userText }
            ];

            editor.updateShape({
                id: shape.id,
                type: shape.type,
                props: { messages: newMessages }
            });

            try {
                // 2. 调用智谱 AI API
                const response = await fetch('/api/whiteboard/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        messages: [
                            { role: 'system', content: '你是一个友好的 AI 助手，帮助用户解答问题和提供建议。请用简洁、清晰的中文回答用户的问题。' },
                            ...newMessages.map(m => ({
                                role: m.role === 'user' ? 'user' : 'assistant',
                                content: m.text
                            }))
                        ]
                    })
                });

                const data = await response.json();

                if (!data.success) {
                    throw new Error(data.error || '请求失败');
                }

                const replyText = data.message;

                // 3. 更新 UI：添加 AI 回复
                editor.updateShape({
                    id: shape.id,
                    type: shape.type,
                    props: {
                        messages: [
                            ...newMessages,
                            { role: 'ai' as const, text: replyText }
                        ]
                    }
                });

            } catch (error) {
                console.error('对话失败:', error);
                editor.updateShape({
                    id: shape.id,
                    type: shape.type,
                    props: {
                        messages: [
                            ...newMessages,
                            { role: 'error' as const, text: '❌ 发送失败: ' + (error instanceof Error ? error.message : '未知错误') }
                        ]
                    }
                });
            } finally {
                setIsSending(false);
            }
        };

        const messages = shape.props.messages || [];

        return (
            <HTMLContainer style={{ pointerEvents: 'all' }}>
                <div style={{
                    width: shape.props.w,
                    height: shape.props.h,
                    background: '#1e1e1e',
                    borderRadius: 12,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    color: '#ccc',
                    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
                    border: '1px solid #333'
                }}>
                    {/* 标题栏 */}
                    <div style={{
                        padding: '10px 16px',
                        background: '#252526',
                        borderBottom: '1px solid #333',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>💬</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>AI Terminal</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#666' }}>
                            🟢 Ready
                        </div>
                    </div>

                    {/* 消息历史区 */}
                    <div
                        onPointerDown={(e) => e.stopPropagation()}
                        style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 16,
                            pointerEvents: 'auto'
                        }}
                    >
                        {messages.length === 0 && (
                            <div style={{
                                textAlign: 'center',
                                color: '#555',
                                marginTop: 40,
                                fontSize: 13
                            }}>
                                <div style={{ fontSize: 24, marginBottom: 10 }}>👋</div>
                                开始与 AI 对话...
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <div key={i} style={{
                                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                maxWidth: '85%',
                                fontSize: 18,
                                lineHeight: '1.6'
                            }}>
                                <div style={{
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    background: msg.role === 'user' ? '#0e639c' : '#333',
                                    color: msg.role === 'user' ? '#fff' : '#eee',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    border: msg.role === 'error' ? '1px solid #f44336' : 'none'
                                }}>
                                    {msg.text.split(/(```json[\s\S]*?```)/g).map((part, idx) => {
                                        if (part.startsWith('```json')) {
                                            const code = part.replace(/```json\n?/, '').replace(/```$/, '');
                                            return <CollapsibleCode key={idx} code={code} />;
                                        }
                                        return <span key={idx}>{part}</span>;
                                    })}
                                </div>
                                <div style={{
                                    fontSize: 10,
                                    marginTop: 4,
                                    opacity: 0.5,
                                    textAlign: msg.role === 'user' ? 'right' : 'left'
                                }}>
                                    {msg.role === 'user' ? 'You' : 'AI'}
                                </div>
                            </div>
                        ))}

                        {isSending && (
                            <div style={{ alignSelf: 'flex-start', color: '#888', fontSize: 12 }}>
                                ● 正在思考...
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* 输入区 */}
                    <div style={{
                        padding: 12,
                        background: '#252526',
                        borderTop: '1px solid #333',
                        display: 'flex',
                        gap: 8
                    }}>
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    sendMessage();
                                }
                            }}
                            placeholder="输入消息..."
                            style={{
                                flex: 1,
                                background: '#3c3c3c',
                                border: '1px solid #3c3c3c',
                                borderRadius: 4,
                                color: '#eee',
                                padding: '8px',
                                fontSize: 13,
                                resize: 'none',
                                height: 36,
                                outline: 'none',
                                fontFamily: 'inherit'
                            }}
                        />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                sendMessage();
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            disabled={isSending || !input.trim()}
                            style={{
                                background: isSending ? '#444' : '#0e639c',
                                color: 'white',
                                border: 'none',
                                borderRadius: 4,
                                padding: '0 16px',
                                cursor: isSending ? 'not-allowed' : 'pointer',
                                fontSize: 13,
                                fontWeight: 500
                            }}
                        >
                            发送
                        </button>
                    </div>
                </div>
            </HTMLContainer>
        );
    }

    override indicator(shape: AITerminalShape) {
        return <rect width={shape.props.w} height={shape.props.h} />;
    }
}

export default AITerminalShapeUtil;
