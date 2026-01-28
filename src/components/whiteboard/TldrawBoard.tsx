'use client';

import React, { useEffect } from 'react';
import { Tldraw } from 'tldraw';
import { customShapeUtils } from './shapes/registry';
import BoardLogic from './BoardLogic';
import Link from 'next/link';

const TldrawBoard: React.FC = () => {
    // 动态加载 tldraw CSS
    useEffect(() => {
        // 检查是否已经加载了 tldraw CSS
        const existingLink = document.querySelector('link[href*="tldraw"]');
        if (!existingLink) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = '/css/tldraw.css';
            link.onload = () => {
                console.log('✅ Tldraw CSS loaded successfully from local');
                console.log('Checking tldraw elements:', document.querySelectorAll('[class*="tl-"]').length);
                // 延迟检查，等待 Tldraw 完全初始化
                setTimeout(() => {
                    console.log('After init - tldraw elements:', document.querySelectorAll('[class*="tl-"]').length);
                    console.log('Canvas element:', document.querySelector('.tl-canvas'));
                }, 1000);
            };
            link.onerror = () => {
                console.error('❌ Failed to load tldraw CSS, trying CDN fallback');
                // 如果本地加载失败，尝试 CDN
                const cdnLink = document.createElement('link');
                cdnLink.rel = 'stylesheet';
                cdnLink.href = 'https://unpkg.com/tldraw@4.2.3/tldraw.css';
                document.head.appendChild(cdnLink);
            };
            document.head.appendChild(link);
        }
    }, []);

    return (
        <div style={{ position: 'fixed', inset: 0 }}>
            {/* 返回首页按钮 */}
            <Link
                href="/"
                className="fixed top-4 left-4 z-50 bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-4 rounded-lg shadow-lg transition-all duration-200 flex items-center gap-2"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
                返回首页
            </Link>

            {/* 只测试 BoardLogic，不包含 customShapeUtils */}
            <Tldraw>
                <BoardLogic />
            </Tldraw>
        </div>
    );
};

export default TldrawBoard;
