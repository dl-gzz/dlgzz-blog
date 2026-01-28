'use client';

import React from 'react';
import { Tldraw } from 'tldraw';
import { customShapeUtils } from './shapes/registry';
import BoardLogic from './BoardLogic';

const TldrawBoard: React.FC = () => {
    return (
        <div style={{ position: 'fixed', inset: 0 }}>
            <Tldraw shapeUtils={customShapeUtils}>
                <BoardLogic />
            </Tldraw>
        </div>
    );
};

export default TldrawBoard;
