'use client';

import React from 'react';
import { Tldraw } from 'tldraw';
import { customShapeUtils } from './shapes/registry';
import BoardLogic from './BoardLogic';
import Link from 'next/link';

const TldrawBoard: React.FC = () => {
    const licenseKey = process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY;
    const hasTldrawLicense = Boolean(
        licenseKey &&
        licenseKey.trim().length > 0
    );
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction && !hasTldrawLicense) {
        return (
            <div className="fixed inset-0 flex items-center justify-center bg-black text-white p-6">
                <div className="max-w-xl text-center space-y-3">
                    <h1 className="text-2xl font-semibold">Whiteboard is not configured</h1>
                    <p className="text-white/80">
                        tldraw requires a production license key. Please set
                        <code className="mx-1">NEXT_PUBLIC_TLDRAW_LICENSE_KEY</code>
                        in your deployment environment and redeploy.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ position: 'fixed', inset: 0 }}>
            {/* 返回首页按钮 */}
            <Link
                href="/"
                className="fixed top-4 right-4 z-[1000] bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-4 rounded-lg shadow-lg transition-all duration-200 flex items-center gap-2"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
                返回首页
            </Link>

            <Tldraw
                shapeUtils={customShapeUtils}
                licenseKey={licenseKey}
            >
                <BoardLogic />
            </Tldraw>
        </div>
    );
};

export default TldrawBoard;
