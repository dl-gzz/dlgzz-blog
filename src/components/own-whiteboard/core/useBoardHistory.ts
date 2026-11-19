'use client';

import { useCallback, useRef, useState } from 'react';
import { createDocument } from './model';
import type { BoardDocument } from './types';

/** Pointer moves are previews; pointer-up commits one complete undo transaction. */
export function useBoardHistory() {
  const [document, setDocument] = useState<BoardDocument>(createDocument);
  const current = useRef(document);
  const past = useRef<BoardDocument[]>([]);
  const future = useRef<BoardDocument[]>([]);
  const [, refresh] = useState(0);
  const publish = useCallback((next: BoardDocument) => {
    current.current = next;
    setDocument(next);
  }, []);
  const commit = useCallback(
    (next: BoardDocument, before = current.current) => {
      if (JSON.stringify(next) === JSON.stringify(before)) return;
      past.current = [...past.current.slice(-79), before];
      future.current = [];
      publish(next);
      refresh((v) => v + 1);
    },
    [publish]
  );
  const reset = useCallback(
    (next: BoardDocument) => {
      past.current = [];
      future.current = [];
      publish(next);
      refresh((v) => v + 1);
    },
    [publish]
  );
  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(current.current);
    publish(previous);
    refresh((v) => v + 1);
  }, [publish]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(current.current);
    publish(next);
    refresh((v) => v + 1);
  }, [publish]);
  return {
    document,
    current,
    commit,
    preview: publish,
    reset,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
