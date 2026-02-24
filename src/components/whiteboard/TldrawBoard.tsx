'use client';

import React from 'react';
import { Tldraw } from 'tldraw';
import { customShapeUtils } from './shapes/registry';
import BoardLogic from './BoardLogic';

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
            {/* Desktop wallpaper background */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 0,
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 40%, #334155 70%, #1e293b 100%)',
                }}
            />

            {/* Override Tldraw styles */}
            <style>{`
                .tl-background { background: rgba(249, 250, 251, 0.85) !important; }
                /* 隐藏 tldraw 底部工具栏，由自定义 Dock 替代 */
                .tlui-layout__bottom { display: none !important; }
            `}</style>

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
