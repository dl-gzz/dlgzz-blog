'use client';

import React, { useState, useEffect } from 'react';
import { useEditor, createShapeId } from 'tldraw';

// AI Configuration
// 支持多个 AI 提供商：gemini, zhipu, qwen, claude
const AI_PROVIDER = (process.env.NEXT_PUBLIC_AI_PROVIDER || 'zhipu').trim();
const API_KEY = (process.env.NEXT_PUBLIC_AI_API_KEY || '').trim();

// API 端点配置
const API_ENDPOINTS = {
    gemini: process.env.NEXT_PUBLIC_GEMINI_API_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent',
    zhipu: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    qwen: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
    claude: process.env.NEXT_PUBLIC_CLAUDE_API_ENDPOINT || 'https://api.anthropic.com'
};

const API_ENDPOINT = API_ENDPOINTS[AI_PROVIDER as keyof typeof API_ENDPOINTS] || API_ENDPOINTS.zhipu;

// Helper function to extract image data from shapes
const extractDataFromShape = (editor: any, shape: any) => {
    if (!shape) return null;

    if (shape.type === 'image') {
        try {
            const asset = editor.getAsset(shape.props.assetId);
            if (asset && asset.props.src) {
                const base64Data = asset.props.src.split(',')[1] || asset.props.src;
                const mimeType = asset.props.mimeType || 'image/png';
                return { type: 'image', data: base64Data, mimeType, name: asset.props.name };
            }
        } catch (e) {
            console.warn('Image extraction failed', e);
        }
        return null;
    }

    return null;
};

interface Message {
    role: 'system' | 'user' | 'assistant';
    text: string;
}

const BoardLogic: React.FC = () => {
    const editor = useEditor();

    // AI Chat State
    const [isAiOpen, setIsAiOpen] = useState(false);
    const [aiInput, setAiInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        { role: 'system', text: '已切换至 Tldraw (DOM) 架构。我是您的全能 OS 助手。' }
    ]);
    const [loading, setLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);

    const startVoiceInput = () => {
        if (!('webkitSpeechRecognition' in window)) {
            return alert('您的浏览器不支持语音输入 (需 Chrome/Edge)');
        }
        const recognition = new (window as any).webkitSpeechRecognition();
        recognition.lang = 'zh-CN';
        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onresult = (e: any) => {
            const text = e.results[0][0].transcript;
            setAiInput(text);
        };
        recognition.start();
    };

    // File Drop Handler
    useEffect(() => {
        if (!editor) return;

        const handleDrop = async (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const now = Date.now();
            if ((window as any)._dropLock && now - (window as any)._dropLock < 2000) {
                return;
            }

            const files = Array.from(e.dataTransfer?.files || []);
            if (files.length === 0) return;

            const fileFingerprint = files.map(f => `${f.name}-${f.size}`).join('|');
            if ((window as any)._lastDropFingerprint === fileFingerprint && now - (window as any)._dropLock < 2000) {
                return;
            }

            (window as any)._dropLock = now;
            (window as any)._lastDropFingerprint = fileFingerprint;

            const point = editor.screenToPage({ x: e.clientX, y: e.clientY });
            let offset = 0;

            for (const file of files) {
                // Handle Image Files
                if (file.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = async (e) => {
                        const src = e.target?.result as string;
                        const assetIdString = `asset:${Date.now()}` as any;

                        const img = new window.Image();
                        img.onload = () => {
                            const w = img.width;
                            const h = img.height;
                            let scale = 1;
                            if (w > 1000) scale = 1000 / w;

                            editor.createAssets([{
                                id: assetIdString,
                                typeName: 'asset',
                                type: 'image',
                                props: {
                                    w: w,
                                    h: h,
                                    mimeType: file.type,
                                    src: src,
                                    name: file.name,
                                    isAnimated: false
                                },
                                meta: {}
                            } as any]);

                            editor.createShape({
                                id: createShapeId(),
                                type: 'image',
                                x: point.x + offset,
                                y: point.y + offset,
                                props: {
                                    w: w * scale,
                                    h: h * scale,
                                    assetId: assetIdString
                                }
                            });
                        };
                        img.src = src;
                    };
                    reader.readAsDataURL(file);
                    offset += 40;
                    continue;
                }

                // Handle Text/Code Files
                if (file.type.startsWith('text/') ||
                    file.name.toLowerCase().endsWith('.md') ||
                    file.name.toLowerCase().endsWith('.markdown') ||
                    file.name.toLowerCase().endsWith('.txt') ||
                    file.name.toLowerCase().endsWith('.json') ||
                    file.name.toLowerCase().endsWith('.js') ||
                    file.name.toLowerCase().endsWith('.jsx') ||
                    file.name.toLowerCase().endsWith('.ts') ||
                    file.name.toLowerCase().endsWith('.tsx') ||
                    file.name.toLowerCase().endsWith('.py') ||
                    file.name.toLowerCase().endsWith('.csv') ||
                    file.name.toLowerCase().endsWith('.html') ||
                    file.name.toLowerCase().endsWith('.css')) {

                    const text = await file.text();

                    editor.createShape({
                        id: createShapeId(),
                        type: 'ai_result',
                        x: point.x + offset,
                        y: point.y + offset,
                        props: {
                            text: text.slice(0, 2000) + (text.length > 2000 ? "\n...(truncated)" : ""),
                            w: 240,
                            h: 240
                        }
                    });

                    offset += 40;
                }
            }
        };

        const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
        };

        window.addEventListener('drop', handleDrop as any, true);
        window.addEventListener('dragover', handleDragOver as any, true);

        return () => {
            window.removeEventListener('drop', handleDrop as any, true);
            window.removeEventListener('dragover', handleDragOver as any, true);
        };
    }, [editor]);

    // AI System Prompt
    const SYSTEM_PROMPT = `⚠️ CRITICAL JSON-ONLY MODE ⚠️

You are a Courseware Designer & Developer specialized in creating interactive educational tools.

🚨 ABSOLUTE RULE: You MUST respond with VALID JSON ONLY. No explanations, no markdown, no code blocks.

📋 REQUIRED JSON FORMAT:
{
  "thought": "中文思考过程",
  "voice_response": "中文语音反馈",
  "operations": [
    {
      "action": "create",
      "type": "preview_html",
      "props": {
        "w": 600,
        "h": 400,
        "html": "完整的HTML代码..."
      }
    }
  ]
}

🎯 SUPPORTED TYPES:
- "preview_html": Full HTML applications/slides with CSS/JS
- "ai_result": Text cards (props: {text: "...", w: 300, h: 200})
- "arrow": Connections (props: {start: {x, y}, end: {x, y}})

💡 HTML REQUIREMENTS (for preview_html):
- Self-contained: Include ALL CSS/JS inline
- Interactive: Use onclick, animations, transitions
- Beautiful: Modern UI, colors, gradients
- Professional: 14px+ fonts, 1.6 line-height

🖼️ MULTIMODAL CAPABILITIES:
- You can see and analyze images in the context
- If user selects an image and asks about it, analyze the visual content
- You can reference image details in your responses
- Combine visual analysis with code generation when relevant

🌍 LANGUAGE: Use Chinese for "thought" and "voice_response"

❌ DO NOT:
- Return explanatory text
- Use markdown code blocks
- Explain what you will do
- Return anything except pure JSON

✅ EXAMPLE RESPONSE:
{"thought":"我将创建一个太阳系幻灯片，包含8大行星介绍","voice_response":"好的，我已经为您创建了太阳系演示文稿","operations":[{"action":"create","type":"preview_html","props":{"w":800,"h":600,"html":"<!DOCTYPE html><html><head><style>body{margin:0;padding:20px;background:#000;color:#fff;font-family:Arial}</style></head><body><h1>太阳系</h1></body></html>"}}]}
    `;

    // AI Call Handler
    async function callAI(promptOverride: string | null = null) {
        if (!promptOverride && !aiInput.trim()) return;

        const userText = promptOverride || aiInput;
        if (!promptOverride) {
            setMessages(prev => [...prev, { role: 'user', text: userText }]);
            setAiInput('');
        }
        setLoading(true);

        try {
            // Gather Context (Selected Shapes)
            const selectedIds = editor.getSelectedShapeIds();
            let contextData = 'Selected Shapes:\n';
            const imageData: any[] = [];

            if (selectedIds.length > 0) {
                selectedIds.forEach(id => {
                    const shape = editor.getShape(id);
                    if (!shape) return;
                    let content = '';

                    if (shape.type === 'ai_result' || shape.type === 'text') {
                        content = `Content: "${(shape.props as any).text}"`;
                    } else if (shape.type === 'preview_html') {
                        content = `Code: "${(shape.props as any).html?.substring(0, 200)}..."`;
                    } else if (shape.type === 'ai_terminal') {
                        content = `AI Terminal (interactive chat component)`;
                    } else if (shape.type === 'image') {
                        const imgData = extractDataFromShape(editor, shape);
                        if (imgData && imgData.type === 'image') {
                            imageData.push({
                                data: imgData.data,
                                mimeType: imgData.mimeType,
                                name: imgData.name || `image-${id}`
                            });
                            content = `Image: "${imgData.name || 'Unnamed'}" (${imgData.mimeType})`;
                        } else {
                            content = `Image (failed to extract)`;
                        }
                    } else {
                        const propsStr = JSON.stringify(shape.props).substring(0, 100);
                        content = `Props: ${propsStr}...`;
                    }
                    contextData += `- ID: ${shape.id}, Type: ${shape.type}, ${content}, Size: ${Math.round((shape.props as any).w || 0)}x${Math.round((shape.props as any).h || 0)}\n`;
                });
            } else {
                contextData += 'No shapes selected.\n';
            }

            // Build request based on AI provider
            let body: any;
            let headers: any = { 'Content-Type': 'application/json' };
            let fetchUrl = API_ENDPOINT;

            const finalPrompt = SYSTEM_PROMPT + '\n\nCURRENT CONTEXT:\n' + contextData + '\n\nUSER REQUEST: ' + userText;

            if (AI_PROVIDER === 'zhipu') {
                // 智谱 GLM-4V 格式
                headers['Authorization'] = `Bearer ${API_KEY}`;

                // 构建用户消息内容
                const userContent: any[] = [
                    { type: 'text', text: 'CURRENT CONTEXT:\n' + contextData + '\n\nUSER REQUEST: ' + userText }
                ];

                // 添加图片（智谱格式）
                if (imageData.length > 0) {
                    imageData.forEach(img => {
                        userContent.push({
                            type: 'image_url',
                            image_url: {
                                url: `data:${img.mimeType};base64,${img.data}`
                            }
                        });
                    });
                }

                body = {
                    model: 'glm-4v',
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: userContent }
                    ]
                };
            } else if (AI_PROVIDER === 'qwen') {
                // 通义千问格式
                headers['Authorization'] = `Bearer ${API_KEY}`;
                headers['X-DashScope-SSE'] = 'disable';

                const content: any[] = [{ text: finalPrompt }];

                if (imageData.length > 0) {
                    imageData.forEach(img => {
                        content.push({
                            image: `data:${img.mimeType};base64,${img.data}`
                        });
                    });
                }

                body = {
                    model: 'qwen-vl-plus',
                    input: {
                        messages: [
                            { role: 'user', content }
                        ]
                    }
                };
            } else if (AI_PROVIDER === 'claude') {
                // Claude API 格式（代理不支持 system 参数，需要将 system prompt 放入用户消息）
                headers['x-api-key'] = API_KEY;
                headers['anthropic-version'] = '2023-06-01';

                fetchUrl = `${API_ENDPOINT}/v1/messages`;

                // 构建消息内容（支持多模态）
                // 将 SYSTEM_PROMPT 放入用户消息的开头
                const content: any[] = [
                    { type: 'text', text: SYSTEM_PROMPT + '\n\nCURRENT CONTEXT:\n' + contextData + '\n\nUSER REQUEST: ' + userText }
                ];

                // 添加图片（Claude 格式）
                if (imageData.length > 0) {
                    imageData.forEach(img => {
                        content.push({
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: img.mimeType,
                                data: img.data
                            }
                        });
                    });
                }

                body = {
                    model: 'claude-sonnet-4-5-20250929',
                    max_tokens: 4096,
                    messages: [
                        { role: 'user', content }
                    ]
                };
            } else {
                // Gemini 格式（默认）
                // 如果是自定义端点，使用 Authorization header 和 OpenAI 兼容格式
                if (process.env.NEXT_PUBLIC_GEMINI_API_ENDPOINT) {
                    headers['Authorization'] = `Bearer ${API_KEY}`;

                    // 直接使用配置的端点，不添加额外路径
                    fetchUrl = API_ENDPOINT;

                    // 构建用户消息内容（支持多模态）
                    const userContent: any[] = [
                        { type: 'text', text: 'CURRENT CONTEXT:\n' + contextData + '\n\nUSER REQUEST: ' + userText }
                    ];

                    // 添加图片（OpenAI 格式）
                    if (imageData.length > 0) {
                        imageData.forEach(img => {
                            userContent.push({
                                type: 'image_url',
                                image_url: {
                                    url: `data:${img.mimeType};base64,${img.data}`
                                }
                            });
                        });
                    }

                    // 使用 OpenAI 兼容格式（适用于大多数第三方代理）
                    body = {
                        model: 'gemini-2.0-flash-exp',
                        messages: [
                            { role: 'system', content: SYSTEM_PROMPT },
                            { role: 'user', content: userContent }
                        ]
                    };
                } else {
                    // 标准 Gemini API 格式
                    fetchUrl = `${API_ENDPOINT}?key=${API_KEY}`;

                    const parts: any[] = [{ text: finalPrompt }];

                    if (imageData.length > 0) {
                        imageData.forEach(img => {
                            parts.push({
                                inline_data: {
                                    mime_type: img.mimeType,
                                    data: img.data
                                }
                            });
                        });
                    }

                    body = {
                        contents: [{ parts }]
                    };
                }
            }

            const res = await fetch(fetchUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });

            const data = await res.json();

            // 调试日志：打印完整响应
            console.log('API Response:', JSON.stringify(data, null, 2));

            let responseText = '';

            // 解析响应（根据不同提供商）
            if (AI_PROVIDER === 'zhipu') {
                responseText = data.choices?.[0]?.message?.content || '';
            } else if (AI_PROVIDER === 'qwen') {
                responseText = data.output?.choices?.[0]?.message?.content || '';
            } else if (AI_PROVIDER === 'claude') {
                // Claude API 响应格式
                if (data.content && Array.isArray(data.content)) {
                    for (const block of data.content) {
                        if (block.type === 'text' && block.text) {
                            responseText = block.text;
                            break;
                        }
                    }
                }
            } else {
                // Gemini
                responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

                if (!responseText && data.candidates?.[0]?.content?.parts) {
                    for (const part of data.candidates[0].content.parts) {
                        if (part.text) {
                            responseText = part.text;
                            break;
                        }
                    }
                }
            }

            if (!responseText) {
                let errorMsg = 'Empty Response';
                if (data.error) {
                    errorMsg = data.error.message || JSON.stringify(data.error);
                }
                throw new Error('AI Error: ' + errorMsg);
            }

            // Parse JSON & Execute
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                let jsonStr = jsonMatch[0];
                let plan: any;

                // Try to parse JSON, with fallback for control character issues
                try {
                    plan = JSON.parse(jsonStr);
                } catch (parseError: any) {
                    // If parsing fails due to control characters, try cleaning the string
                    console.warn('Initial JSON parse failed, attempting cleanup:', parseError.message);

                    // Log the problematic JSON for debugging
                    console.log('Problematic JSON:', jsonStr.substring(0, 500));

                    // Attempt to extract and display the raw response as fallback
                    setMessages(prev => [...prev, {
                        role: 'system',
                        text: `JSON 解析失败: ${parseError.message}\n\n原始响应:\n${responseText.substring(0, 300)}...`
                    }]);
                    return;
                }

                setMessages(prev => [...prev, { role: 'assistant', text: plan.thought || 'Processing...' }]);

                // Voice Output
                if (plan.voice_response && 'speechSynthesis' in window) {
                    const utterance = new SpeechSynthesisUtterance(plan.voice_response);
                    utterance.lang = 'zh-CN';
                    window.speechSynthesis.speak(utterance);
                }

                // Execute Operations
                if (plan.operations) {
                    const center = editor.getViewportPageBounds().center;
                    let offset = 0;

                    plan.operations.forEach((op: any) => {
                        if (op.action === 'create') {
                            const newId = createShapeId();
                            let x = center.x + (op.x || 0) + offset;
                            let y = center.y + (op.y || 0) + offset;

                            if (selectedIds.length > 0) {
                                const first = editor.getShape(selectedIds[0]);
                                if (first) {
                                    x = first.x + (first.props as any).w + 40;
                                    y = first.y;
                                }
                            }

                            const finalProps = op.props;
                            let shapeType = op.type;

                            if (shapeType === 'note' || shapeType === 'geo' || shapeType === 'text') {
                                shapeType = 'ai_result';
                                finalProps.text = finalProps.text || 'New Note';
                                finalProps.w = 300;
                                finalProps.h = 200;
                            }

                            if (shapeType === 'connector' || shapeType === 'edge') {
                                shapeType = 'arrow';
                            }

                            if (shapeType === 'preview_html') {
                                finalProps.w = finalProps.w || 480;
                                finalProps.h = finalProps.h || 640;
                            }

                            if (shapeType === 'arrow') {
                                const arrowProps = {
                                    start: {
                                        x: finalProps.start?.x || 0,
                                        y: finalProps.start?.y || 0
                                    },
                                    end: {
                                        x: finalProps.end?.x || 100,
                                        y: finalProps.end?.y || 100
                                    }
                                };

                                editor.createShape({
                                    id: newId,
                                    type: 'arrow',
                                    props: arrowProps
                                });
                                offset += 40;
                                return;
                            }

                            editor.createShape({
                                id: newId,
                                type: shapeType,
                                x: x,
                                y: y,
                                props: finalProps
                            });
                            offset += 40;
                        } else if (op.action === 'update' && op.id) {
                            editor.updateShape({
                                id: op.id,
                                props: op.props
                            } as any);
                        }
                    });
                }
            } else {
                setMessages(prev => [...prev, { role: 'assistant', text: responseText }]);
            }

        } catch (e: any) {
            console.error(e);
            setMessages(prev => [...prev, { role: 'system', text: 'Error: ' + e.message }]);
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            {/* AI Widget / Chat Panel */}
            <div
                style={{
                    position: 'absolute',
                    top: 12,
                    right: 180,
                    width: 380,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    pointerEvents: 'none'
                }}
            >
                {/* Chat Bubble */}
                {isAiOpen && (
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(12px)',
                        borderRadius: 20,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                        border: '1px solid rgba(255,255,255,0.5)',
                        padding: 16,
                        maxHeight: 500,
                        display: 'flex',
                        flexDirection: 'column',
                        pointerEvents: 'all'
                    }}>
                        {/* Header with Clear Button */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            marginBottom: 12,
                            paddingBottom: 8,
                            borderBottom: '1px solid #e5e7eb'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 16 }}>✨</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>AI 助手</span>
                                <span style={{
                                    fontSize: 10,
                                    padding: '2px 6px',
                                    background: '#dbeafe',
                                    color: '#1e40af',
                                    borderRadius: 4,
                                    fontWeight: 500
                                }}>
                                    {AI_PROVIDER === 'zhipu' ? 'GLM-4V' :
                                     AI_PROVIDER === 'qwen' ? 'Qwen-VL' :
                                     AI_PROVIDER === 'claude' ? 'Claude Sonnet 4.5' :
                                     'Gemini 3 Pro'}
                                </span>
                            </div>
                            <button
                                onClick={() => setMessages([{ role: 'system', text: '已切换至 Tldraw (DOM) 架构。我是您的全能 OS 助手。' }])}
                                style={{
                                    padding: '4px 8px',
                                    fontSize: 11,
                                    border: '1px solid #e5e7eb',
                                    background: '#fff',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    color: '#666',
                                    fontWeight: 500,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4
                                }}
                                title="清空对话历史"
                            >
                                🗑️ 清空
                            </button>
                        </div>

                        {/* Messages */}
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            marginBottom: 12,
                            minHeight: 100,
                            fontSize: 13,
                            gap: 12,
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            {messages.map((m, i) => (
                                <div key={i} style={{
                                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                                    background: m.role === 'user' ? '#000' : '#f3f4f6',
                                    color: m.role === 'user' ? '#fff' : '#000',
                                    padding: '8px 12px',
                                    borderRadius: 12,
                                    maxWidth: '85%',
                                    lineHeight: 1.4
                                }}>
                                    {m.text}
                                </div>
                            ))}
                            {loading && <div style={{ color: '#666', fontSize: 12 }}>Processing...</div>}
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    borderRadius: 8,
                                    border: '1px solid #ddd',
                                    fontSize: 13,
                                    outline: 'none'
                                }}
                                placeholder="描述一个应用、工具或修改..."
                                value={aiInput}
                                onChange={e => setAiInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && callAI()}
                            />
                            {/* Voice Button */}
                            <button
                                onClick={startVoiceInput}
                                style={{
                                    width: 36,
                                    borderRadius: 8,
                                    border: 'none',
                                    background: isListening ? '#ef4444' : '#fee2e2',
                                    color: '#b91c1c',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                title="Voice Input"
                            >
                                🎤
                            </button>
                            {/* Send Button */}
                            <button
                                onClick={() => callAI()}
                                style={{
                                    background: '#000',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 8,
                                    padding: '0 16px',
                                    cursor: 'pointer',
                                    fontWeight: 600
                                }}
                            >
                                ↵
                            </button>
                        </div>
                    </div>
                )}

                {/* Floating Action Button (FAB) */}
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    pointerEvents: 'all'
                }}>
                    {/* AI 助手按钮 */}
                    <button
                        onClick={() => setIsAiOpen(!isAiOpen)}
                        title="AI 助手"
                        style={{
                            width: 48,
                            height: 48,
                            borderRadius: 24,
                            background: '#000',
                            color: '#fff',
                            border: 'none',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                            fontSize: 20,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s cubic-bezier(0.25, 1, 0.5, 1)'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.1)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                    >
                        {isAiOpen ? '✕' : '✨'}
                    </button>
                </div>
            </div>
        </>
    );
};

export default BoardLogic;

