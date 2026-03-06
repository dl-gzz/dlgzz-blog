'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, createShapeId } from 'tldraw';

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

interface CustomDockItem {
    id: string;
    icon: string;
    label: string;
    type: string;
    props: Record<string, any>;
    createdAt: number;
}

const BoardLogic: React.FC = () => {
    const editor = useEditor();

    // AI Chat State
    const [isAiOpen, setIsAiOpen] = useState(false);
    const [aiInput, setAiInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        { role: 'system', text: '已进入 One Worker OS，您的智能工作空间。' }
    ]);
    const [loading, setLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);

    // Blog Picker State
    const [isBlogPickerOpen, setIsBlogPickerOpen] = useState(false);
    const [blogPosts, setBlogPosts] = useState<any[]>([]);
    const [blogLoading, setBlogLoading] = useState(false);
    const [blogSearch, setBlogSearch] = useState('');

    // Drawing Tools Panel State
    const [isDrawToolsOpen, setIsDrawToolsOpen] = useState(false);
    // Custom Dock Items (persisted in localStorage)
    const [customDockItems, setCustomDockItems] = useState<CustomDockItem[]>([]);
    const [selectedShapeForSave, setSelectedShapeForSave] = useState<string | null>(null);

    // Load custom dock items from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem('ow-os-custom-dock-items');
            if (stored) setCustomDockItems(JSON.parse(stored));
        } catch (_) { /* ignore */ }
    }, []);

    // Persist custom dock items
    const persistCustomDockItems = (items: CustomDockItem[]) => {
        setCustomDockItems(items);
        try {
            localStorage.setItem('ow-os-custom-dock-items', JSON.stringify(items));
        } catch (_) { /* ignore */ }
    };

    // Listen for shape selection changes → show "Save to Dock" button
    useEffect(() => {
        if (!editor) return;
        const check = () => {
            const ids = editor.getSelectedShapeIds();
            if (ids.length === 1) {
                const shape = editor.getShape(ids[0]);
                if (shape && ['preview_html', 'ai_result', 'blog_post'].includes(shape.type)) {
                    setSelectedShapeForSave(ids[0] as string);
                    return;
                }
            }
            setSelectedShapeForSave(null);
        };
        const unsubscribe = editor.store.listen(check, { scope: 'document', source: 'user' });
        return unsubscribe;
    }, [editor]);

    // Save a shape's config to Dock
    const saveShapeToDock = (shapeId: string) => {
        if (customDockItems.length >= 10) return; // max 10 custom items
        const shape = editor.getShape(shapeId as any);
        if (!shape) return;

        let label = '自定义应用';
        let icon = '📌';
        const props = { ...(shape.props as any) };

        if (shape.type === 'preview_html') {
            icon = '🌐';
            const titleMatch = props.html?.match(/<title>(.*?)<\/title>/i);
            const h1Match = props.html?.match(/<h1[^>]*>(.*?)<\/h1>/i);
            label = (titleMatch?.[1] || h1Match?.[1] || 'HTML 应用').replace(/<[^>]*>/g, '').trim().substring(0, 20);
        } else if (shape.type === 'ai_result') {
            icon = '📄';
            label = (props.text || '').split('\n')[0].substring(0, 20) || '文本卡片';
        } else if (shape.type === 'blog_post') {
            icon = '📝';
            label = props.title?.substring(0, 20) || '博客文章';
        }

        persistCustomDockItems([...customDockItems, {
            id: `custom-${Date.now()}`,
            icon,
            label,
            type: shape.type,
            props,
            createdAt: Date.now(),
        }]);
        setSelectedShapeForSave(null);
    };

    // Delete a custom dock item
    const deleteCustomDockItem = (itemId: string) => {
        persistCustomDockItems(customDockItems.filter(item => item.id !== itemId));
    };

    const fetchBlogPosts = async () => {
        if (blogPosts.length > 0) return;
        setBlogLoading(true);
        try {
            const res = await fetch('/api/whiteboard/blog-posts?locale=zh');
            const data = await res.json();
            if (data.success) {
                setBlogPosts(data.posts);
            }
        } catch (e) {
            // Failed to fetch blog posts
        } finally {
            setBlogLoading(false);
        }
    };

    const insertBlogPost = (post: any) => {
        const center = editor.getViewportPageBounds().center;
        editor.createShape({
            id: createShapeId(),
            type: 'blog_post',
            x: center.x - 160,
            y: center.y - 190,
            props: {
                title: post.title,
                description: post.description,
                image: post.image,
                date: post.date,
                categories: post.categories,
                url: post.url,
                w: 320,
                h: 380,
            },
        });
        setIsBlogPickerOpen(false);
    };

    const filteredBlogPosts = blogPosts.filter(
        (post) =>
            post.title.toLowerCase().includes(blogSearch.toLowerCase()) ||
            post.description.toLowerCase().includes(blogSearch.toLowerCase())
    );

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

You are an interactive content designer for a blog platform. Your specialty is turning blog articles into visual, interactive experiences — demos, installation guides, process flows, and before/after comparisons.

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
- "ai_result": Text cards (props: {text: "...", w: 300, h: 200, color: "#f0fdf4"})
- "arrow": Connections (props: {start: {x, y}, end: {x, y}})

🔄 UPDATE EXISTING SHAPES:
When shapes are selected (shown in CURRENT CONTEXT with [ID: shape:xxx]), you can modify them:
{"action":"update","id":"shape:xxxxxx","props":{...only_changed_props}}

Updatable props by type:
- "ai_result": {text, w, h, color} (color is CSS color like "#f0fdf4")
- "preview_html": {html, w, h} (html must be complete HTML document)
- "blog_post": {title, description, image, date, categories, url, w, h}

RULES for update:
- Use the EXACT id from CURRENT CONTEXT (format: "shape:xxxxxxxx")
- Only include props you want to change (partial update)
- If user says 修改/改/换/调整/fix/improve on selected shape → use "update"
- If user wants something NEW → use "create"
- Can mix "create" and "update" in same response

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

📚 BLOG CONTENT SCENARIOS — use these patterns when explaining blog articles:

1. 安装/配置流程 (Installation Guide)
   When user asks to show install steps, setup process, or configuration:
   - Create a step-by-step interactive card with numbered steps
   - Each step shows the CLI command in a dark terminal style block (monospace font, dark bg)
   - Steps highlight one at a time with a "下一步" / "上一步" button
   - Show progress bar at top
   - Example triggers: "演示安装过程", "展示配置步骤", "怎么安装"

2. 使用效果演示 (Usage Demo)
   When user asks to show what a tool does or how it works:
   - Create an interactive before/after split view or a live simulation
   - Left panel = "原始输入" (raw/messy state), Right panel = "处理结果" (clean/structured output)
   - Add a "运行" button that animates the transformation
   - Use realistic sample data relevant to the tool
   - Example triggers: "演示效果", "展示用法", "模拟运行", "效果是什么"

3. 工作流程图 (Workflow Diagram)
   When user asks to visualize a process or pipeline:
   - Use SVG or HTML+CSS to draw a flow: boxes connected by arrows
   - Each node is clickable and shows a tooltip with details
   - Use colors to distinguish input → process → output stages
   - Example triggers: "画流程图", "展示工作流", "整个流程是什么"

4. 前后对比 (Before/After Comparison)
   When user wants to show the value or impact of a tool:
   - Two-column layout: left = "没有用这个工具" (pain), right = "用了之后" (gain)
   - Use ❌ / ✅ icons, color contrast (red/green or gray/blue)
   - Example triggers: "对比", "有什么区别", "解决了什么问题"

5. 交互式 SVG 图表 (Interactive SVG Charts)
   When user asks for data visualization or diagrams:
   - Generate clean SVG inside HTML: pie charts, bar charts, timelines
   - Add hover tooltips and click interactions
   - Use smooth CSS animations on load
   - Example triggers: "数据图", "饼图", "柱状图", "SVG"

🌍 LANGUAGE: Use Chinese for "thought" and "voice_response"

❌ DO NOT:
- Return explanatory text
- Use markdown code blocks
- Explain what you will do
- Return anything except pure JSON

✅ EXAMPLE (installation guide):
{"thought":"用户想演示安装流程，我将创建一个步骤式安装向导","voice_response":"好的，已创建安装步骤演示","operations":[{"action":"create","type":"preview_html","props":{"w":700,"h":500,"html":"<!DOCTYPE html><html><head><style>body{margin:0;font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:24px}h2{color:#38bdf8;margin:0 0 20px}.step{padding:16px;border-radius:8px;background:#1e293b;border-left:3px solid #334155;margin-bottom:10px;opacity:.5}.step.active{opacity:1;border-left-color:#38bdf8}code{display:block;margin-top:8px;padding:10px;background:#000;border-radius:4px;color:#4ade80;font-family:monospace}button{padding:10px 20px;border:none;border-radius:6px;cursor:pointer;margin-right:8px;margin-top:16px}</style></head><body><h2>安装步骤</h2><div id='s0' class='step active'><strong>1. 克隆仓库</strong><code>git clone https://github.com/your/skill</code></div><div id='s1' class='step'><strong>2. 安装依赖</strong><code>npm install</code></div><div id='s2' class='step'><strong>3. 配置环境</strong><code>cp .env.example .env</code></div><div id='s3' class='step'><strong>4. 运行</strong><code>node scripts/orchestrate.js --content 会议内容</code></div><button style='background:#334155;color:#e2e8f0' onclick='go(-1)'>上一步</button><button style='background:#38bdf8;color:#000' onclick='go(1)'>下一步</button><script>var c=0;function go(d){document.getElementById('s'+c).className='step';c=Math.max(0,Math.min(3,c+d));document.getElementById('s'+c).className='step active'};</script></body></html>"}}]}

✅ EXAMPLE (update selected shape):
{"thought":"用户要求修改选中的应用背景色","voice_response":"已将背景改为深色","operations":[{"action":"update","id":"shape:abc123","props":{"html":"<!DOCTYPE html><html><head><style>body{margin:0;background:#1a1a2e;color:#fff}</style></head><body><h1>Updated</h1></body></html>"}}]}
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
                        const p = shape.props as any;
                        content = `Content: "${p.text}", color: "${p.color || '#f0fdf4'}"`;
                    } else if (shape.type === 'preview_html') {
                        const html = (shape.props as any).html || '';
                        content = `HTML App: "${html.substring(0, 2000)}${html.length > 2000 ? '...(truncated)' : ''}"`;
                    } else if (shape.type === 'blog_post') {
                        const p = shape.props as any;
                        content = `Blog: title="${p.title}", description="${p.description}", image="${p.image}", date="${p.date}", categories=${JSON.stringify(p.categories)}, url="${p.url}"`;
                    } else if (shape.type === 'ai_terminal') {
                        const p = shape.props as any;
                        content = `AI Terminal: ${(p.messages || []).length} messages, status="${p.status || 'idle'}"`;
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
                    contextData += `- [ID: ${shape.id}] Type: ${shape.type}, ${content}, Size: ${Math.round((shape.props as any).w || 0)}x${Math.round((shape.props as any).h || 0)}\n`;
                });
            } else {
                contextData += 'No shapes selected.\n';
            }

            const finalPrompt = SYSTEM_PROMPT + '\n\nCURRENT CONTEXT:\n' + contextData + '\n\nUSER REQUEST: ' + userText;
            const imageSummary = imageData.length > 0
                ? `\n\nIMAGE_CONTEXT: ${imageData.length} image(s) selected.`
                : '';

            const res = await fetch('/api/whiteboard/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [
                        { role: 'system', content: SYSTEM_PROMPT },
                        { role: 'user', content: `${finalPrompt}${imageSummary}` }
                    ]
                })
            });

            const data = await res.json();

            // 调试日志：打印完整响应
            console.log('API Response:', JSON.stringify(data, null, 2));

            if (!res.ok || !data?.success) {
                const errorMsg = data?.error || `HTTP ${res.status}`;
                throw new Error(`AI Error: ${errorMsg}`);
            }

            const responseText = typeof data.message === 'string'
                ? data.message
                : JSON.stringify(data.message || '');

            if (!responseText) {
                throw new Error('AI Error: Empty Response');
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
                            const existing = editor.getShape(op.id);
                            if (existing) {
                                editor.updateShape({
                                    id: op.id,
                                    type: existing.type,
                                    props: op.props,
                                });
                            }
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

    // Dock: Quick-insert shape at viewport center
    const insertQuickShape = (type: string, defaultProps: Record<string, any>) => {
        const center = editor.getViewportPageBounds().center;
        const w = defaultProps.w || 300;
        const h = defaultProps.h || 200;
        editor.createShape({
            id: createShapeId(),
            type,
            x: center.x - w / 2,
            y: center.y - h / 2,
            props: defaultProps,
        });
    };

    // Current tldraw tool tracking
    const [currentTool, setCurrentTool] = useState('select');

    useEffect(() => {
        if (!editor) return;
        setCurrentTool(editor.getCurrentToolId());
        const unsubscribe = editor.store.listen(() => {
            setCurrentTool(editor.getCurrentToolId());
        }, { scope: 'session' });
        return unsubscribe;
    }, [editor]);

    // Dock items config
    const dockItems = [
        {
            icon: '🏠',
            label: '返回首页',
            onClick: () => {
                window.location.href = '/';
            },
            active: false,
        },
        {
            icon: '✨',
            label: 'AI 助手',
            onClick: () => setIsAiOpen(!isAiOpen),
            active: isAiOpen,
        },
        {
            icon: '📝',
            label: '博客文章',
            onClick: () => {
                setIsBlogPickerOpen(!isBlogPickerOpen);
                if (!isBlogPickerOpen) fetchBlogPosts();
            },
            active: isBlogPickerOpen,
        },
        {
            icon: '🌐',
            label: 'HTML 应用',
            onClick: () => insertQuickShape('preview_html', {
                w: 480, h: 640,
                html: '<!DOCTYPE html><html><head><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#667eea,#764ba2);font-family:system-ui;color:#fff}h1{font-size:2em;text-align:center}</style></head><body><h1>New App</h1></body></html>',
            }),
            active: false,
        },
        {
            icon: '📄',
            label: '文本卡片',
            onClick: () => insertQuickShape('ai_result', {
                w: 300, h: 200,
                text: '在此输入内容...',
            }),
            active: false,
        },
        {
            icon: '🧰',
            label: '绘图工具',
            onClick: () => setIsDrawToolsOpen(!isDrawToolsOpen),
            active: isDrawToolsOpen,
        },
    ];

    // Dock tooltip state
    const [hoveredDock, setHoveredDock] = useState<number | null>(null);

    // ═══════════ Panel drag logic ═══════════
    const [panelPositions, setPanelPositions] = useState<Record<string, { x: number; y: number }>>({});
    const dragState = useRef<{
        active: boolean;
        panelId: string;
        startMouseX: number;
        startMouseY: number;
        startPanelX: number;
        startPanelY: number;
    }>({ active: false, panelId: '', startMouseX: 0, startMouseY: 0, startPanelX: 0, startPanelY: 0 });

    const handleDragStart = useCallback((e: React.MouseEvent, panelId: string) => {
        e.preventDefault();
        const panel = (e.currentTarget as HTMLElement).closest('[data-panel]') as HTMLElement;
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        const pos = panelPositions[panelId] || { x: rect.left, y: rect.top };
        dragState.current = {
            active: true,
            panelId,
            startMouseX: e.clientX,
            startMouseY: e.clientY,
            startPanelX: pos.x,
            startPanelY: pos.y,
        };
        if (!panelPositions[panelId]) {
            setPanelPositions(prev => ({ ...prev, [panelId]: { x: rect.left, y: rect.top } }));
        }
    }, [panelPositions]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!dragState.current.active) return;
            const { panelId, startMouseX, startMouseY, startPanelX, startPanelY } = dragState.current;
            setPanelPositions(prev => ({
                ...prev,
                [panelId]: {
                    x: startPanelX + (e.clientX - startMouseX),
                    y: startPanelY + (e.clientY - startMouseY),
                },
            }));
        };
        const onUp = () => { dragState.current.active = false; };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, []);

    return (
        <>
            {/* ═══════════ Blog Picker Panel (draggable) ═══════════ */}
            {isBlogPickerOpen && (
                <div
                    data-panel="blog"
                    style={{
                        position: 'absolute',
                        ...(panelPositions['blog']
                            ? { left: panelPositions['blog'].x, top: panelPositions['blog'].y }
                            : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }),
                        width: 380,
                        pointerEvents: 'all',
                        zIndex: 502,
                    }}
                >
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
                    }}>
                        {/* Drag Handle Header */}
                        <div
                            onMouseDown={(e) => handleDragStart(e, 'blog')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 12,
                                paddingBottom: 8,
                                borderBottom: '1px solid #e5e7eb',
                                cursor: 'grab',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color: '#ccc', fontSize: 10, letterSpacing: 2, userSelect: 'none' }}>⠿</span>
                                <span style={{ fontSize: 16 }}>📝</span>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#111' }}>
                                    插入博客文章
                                </span>
                            </div>
                            <button
                                onClick={() => setIsBlogPickerOpen(false)}
                                style={{
                                    padding: '4px 8px',
                                    fontSize: 11,
                                    border: '1px solid #e5e7eb',
                                    background: '#fff',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    color: '#666',
                                    fontWeight: 500,
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Search */}
                        <input
                            style={{
                                padding: '8px 12px',
                                borderRadius: 8,
                                border: '1px solid #ddd',
                                fontSize: 13,
                                outline: 'none',
                                marginBottom: 12,
                            }}
                            placeholder="搜索文章..."
                            value={blogSearch}
                            onChange={(e) => setBlogSearch(e.target.value)}
                        />

                        {/* Post List */}
                        <div style={{
                            flex: 1,
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                            minHeight: 200,
                        }}>
                            {blogLoading ? (
                                <div style={{ textAlign: 'center', color: '#666', padding: 20, fontSize: 13 }}>
                                    加载中...
                                </div>
                            ) : filteredBlogPosts.length === 0 ? (
                                <div style={{ textAlign: 'center', color: '#999', padding: 20, fontSize: 13 }}>
                                    {blogPosts.length === 0 ? '暂无文章' : '无匹配结果'}
                                </div>
                            ) : (
                                filteredBlogPosts.map((post, i) => (
                                    <div
                                        key={i}
                                        onClick={() => insertBlogPost(post)}
                                        style={{
                                            display: 'flex',
                                            gap: 10,
                                            padding: 10,
                                            borderRadius: 8,
                                            cursor: 'pointer',
                                            border: '1px solid #e5e7eb',
                                            transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#f9fafb'; }}
                                        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                                    >
                                        {post.image && (
                                            <img
                                                src={post.image}
                                                alt=""
                                                style={{
                                                    width: 60,
                                                    height: 45,
                                                    objectFit: 'cover',
                                                    borderRadius: 6,
                                                    flexShrink: 0,
                                                }}
                                            />
                                        )}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: 13,
                                                fontWeight: 600,
                                                color: '#111',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {post.title}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                                                {new Date(post.date).toLocaleDateString('zh-CN')}
                                                {post.categories.length > 0 && ` · ${post.categories.join(', ')}`}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════ AI Chat Panel (draggable) ═══════════ */}
            {isAiOpen && (
                <div
                    data-panel="ai"
                    style={{
                        position: 'absolute',
                        ...(panelPositions['ai']
                            ? { left: panelPositions['ai'].x, top: panelPositions['ai'].y }
                            : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }),
                        width: 380,
                        pointerEvents: 'all',
                        zIndex: 502,
                    }}
                >
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
                    }}>
                        {/* Drag Handle Header */}
                        <div
                            onMouseDown={(e) => handleDragStart(e, 'ai')}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 12,
                                paddingBottom: 8,
                                borderBottom: '1px solid #e5e7eb',
                                cursor: 'grab',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color: '#ccc', fontSize: 10, letterSpacing: 2, userSelect: 'none' }}>⠿</span>
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
                                    Server AI
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
                                title="语音输入"
                            >
                                🎤
                            </button>
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
                </div>
            )}

            {/* ═══════════ Drawing Tools Panel (draggable, above Dock) ═══════════ */}
            {isDrawToolsOpen && (
                <div
                    data-panel="tools"
                    style={{
                        position: 'absolute',
                        ...(panelPositions['tools']
                            ? { left: panelPositions['tools'].x, top: panelPositions['tools'].y }
                            : { bottom: 100, left: '50%', transform: 'translateX(-50%)' }),
                        pointerEvents: 'all',
                        zIndex: 501,
                    }}
                >
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.95)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        borderRadius: 16,
                        boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                        border: '1px solid rgba(255,255,255,0.5)',
                        padding: 12,
                    }}>
                        <div style={{
                            display: 'flex',
                            gap: 6,
                            alignItems: 'center',
                        }}>
                            {/* Drag grip */}
                            <div
                                onMouseDown={(e) => handleDragStart(e, 'tools')}
                                style={{
                                    cursor: 'grab',
                                    color: '#ccc',
                                    fontSize: 10,
                                    letterSpacing: 2,
                                    userSelect: 'none',
                                    padding: '4px 2px',
                                    display: 'flex',
                                    alignItems: 'center',
                                }}
                            >
                                ⠿
                            </div>
                            {([
                                { id: 'select', icon: '➤', label: '选择' },
                                { id: 'hand', icon: '🤚', label: '平移' },
                                { id: 'draw', icon: '✏️', label: '画笔' },
                                { id: 'eraser', icon: '🧹', label: '橡皮擦' },
                                { id: 'geo', icon: '⬜', label: '形状' },
                                { id: 'arrow', icon: '↗️', label: '箭头' },
                                { id: 'text', icon: '🔤', label: '文字' },
                                { id: 'note', icon: '🟨', label: '便签' },
                            ] as const).map((tool, idx) => {
                                const isActive = currentTool === tool.id;
                                const hoverKey = 2000 + idx;
                                return (
                                    <div
                                        key={tool.id}
                                        style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                                        onMouseEnter={() => setHoveredDock(hoverKey)}
                                        onMouseLeave={() => setHoveredDock(null)}
                                    >
                                        {hoveredDock === hoverKey && (
                                            <div style={{
                                                position: 'absolute',
                                                bottom: '100%',
                                                marginBottom: 6,
                                                padding: '3px 8px',
                                                background: 'rgba(0,0,0,0.8)',
                                                color: '#fff',
                                                fontSize: 11,
                                                fontWeight: 500,
                                                borderRadius: 6,
                                                whiteSpace: 'nowrap',
                                                pointerEvents: 'none',
                                            }}>
                                                {tool.label}
                                            </div>
                                        )}
                                        <button
                                            onClick={() => editor.setCurrentTool(tool.id)}
                                            style={{
                                                width: 44,
                                                height: 44,
                                                borderRadius: 10,
                                                border: 'none',
                                                background: isActive
                                                    ? 'rgba(59,130,246,0.15)'
                                                    : 'transparent',
                                                fontSize: 20,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                transition: 'background 0.15s',
                                                boxShadow: isActive ? '0 0 0 2px #3b82f6' : 'none',
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.05)';
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!isActive) e.currentTarget.style.background = isActive ? 'rgba(59,130,246,0.15)' : 'transparent';
                                            }}
                                        >
                                            {tool.icon}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════ "Save to Dock" floating button ═══════════ */}
            {selectedShapeForSave && (
                <div style={{
                    position: 'absolute',
                    bottom: 90,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    pointerEvents: 'all',
                    zIndex: 501,
                }}>
                    <button
                        onClick={() => saveShapeToDock(selectedShapeForSave)}
                        style={{
                            padding: '8px 16px',
                            background: 'rgba(0, 0, 0, 0.85)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 12,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            backdropFilter: 'blur(12px)',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                            transition: 'transform 0.15s',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.05)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                        📌 保存到 Dock
                    </button>
                </div>
            )}

            {/* ═══════════ macOS-style Dock Bar ═══════════ */}
            <div
                style={{
                    position: 'absolute',
                    bottom: 16,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    pointerEvents: 'all',
                    zIndex: 500,
                }}
            >
                <div style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    gap: 4,
                    padding: '8px 16px',
                    background: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    borderRadius: 20,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(255,255,255,0.5)',
                    border: '1px solid rgba(255,255,255,0.4)',
                }}>
                    {/* Built-in dock items */}
                    {dockItems.map((item, idx) => (
                        <div
                            key={idx}
                            style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                            onMouseEnter={() => setHoveredDock(idx)}
                            onMouseLeave={() => setHoveredDock(null)}
                        >
                            {hoveredDock === idx && (
                                <div style={{
                                    position: 'absolute',
                                    bottom: '100%',
                                    marginBottom: 8,
                                    padding: '4px 10px',
                                    background: 'rgba(0,0,0,0.8)',
                                    color: '#fff',
                                    fontSize: 11,
                                    fontWeight: 500,
                                    borderRadius: 6,
                                    whiteSpace: 'nowrap',
                                    pointerEvents: 'none',
                                }}>
                                    {item.label}
                                </div>
                            )}
                            <button
                                onClick={item.onClick}
                                style={{
                                    width: 52,
                                    height: 52,
                                    borderRadius: 14,
                                    border: 'none',
                                    background: item.active
                                        ? 'rgba(0,0,0,0.1)'
                                        : 'rgba(255,255,255,0.6)',
                                    fontSize: 24,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'transform 0.2s cubic-bezier(0.25, 1, 0.5, 1), background 0.15s',
                                    transform: hoveredDock === idx ? 'scale(1.3) translateY(-6px)' : 'scale(1)',
                                    boxShadow: item.active ? 'inset 0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                }}
                            >
                                {item.icon}
                            </button>
                            {item.active && (
                                <div style={{
                                    width: 4,
                                    height: 4,
                                    borderRadius: 2,
                                    background: '#000',
                                    marginTop: 4,
                                }} />
                            )}
                        </div>
                    ))}

                    {/* Separator + Custom dock items */}
                    {customDockItems.length > 0 && (
                        <div style={{
                            width: 1,
                            height: 36,
                            background: 'rgba(0,0,0,0.12)',
                            margin: '0 4px',
                            alignSelf: 'center',
                        }} />
                    )}
                    {customDockItems.map((item, idx) => {
                        const hoverIdx = dockItems.length + 1 + idx;
                        return (
                            <div
                                key={item.id}
                                style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                                onMouseEnter={() => setHoveredDock(hoverIdx)}
                                onMouseLeave={() => setHoveredDock(null)}
                            >
                                {hoveredDock === hoverIdx && (
                                    <div style={{
                                        position: 'absolute',
                                        bottom: '100%',
                                        marginBottom: 8,
                                        padding: '4px 10px',
                                        background: 'rgba(0,0,0,0.8)',
                                        color: '#fff',
                                        fontSize: 11,
                                        fontWeight: 500,
                                        borderRadius: 6,
                                        whiteSpace: 'nowrap',
                                        pointerEvents: 'auto',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                    }}>
                                        {item.label}
                                        <span
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteCustomDockItem(item.id);
                                            }}
                                            style={{
                                                cursor: 'pointer',
                                                opacity: 0.7,
                                                fontSize: 10,
                                                padding: '0 2px',
                                            }}
                                            onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '1'; }}
                                            onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '0.7'; }}
                                        >
                                            ✕
                                        </span>
                                    </div>
                                )}
                                <button
                                    onClick={() => insertQuickShape(item.type, { ...item.props })}
                                    style={{
                                        width: 52,
                                        height: 52,
                                        borderRadius: 14,
                                        border: 'none',
                                        background: 'rgba(255,255,255,0.6)',
                                        fontSize: 24,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'transform 0.2s cubic-bezier(0.25, 1, 0.5, 1), background 0.15s',
                                        transform: hoveredDock === hoverIdx ? 'scale(1.3) translateY(-6px)' : 'scale(1)',
                                    }}
                                >
                                    {item.icon}
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
};

export default BoardLogic;
