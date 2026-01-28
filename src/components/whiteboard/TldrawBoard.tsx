'use client';

import React from 'react';
import { Tldraw } from 'tldraw';
import { customShapeUtils } from './shapes/registry';
import BoardLogic from './BoardLogic';
import Link from 'next/link';

const TldrawBoard: React.FC = () => {
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

            <Tldraw shapeUtils={customShapeUtils}>
                <BoardLogic />
            </Tldraw>
        </div>
    );
};

export default TldrawBoard;
