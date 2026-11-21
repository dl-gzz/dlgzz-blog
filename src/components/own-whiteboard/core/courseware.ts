import {
  type CoursewareProduct,
  getCourseware,
} from '@/lib/courseware-catalog';
import { createShape } from './model';
import type { BoardDocument, BoardShape, Bounds } from './types';

export {
  type CoursewareProduct,
  coursewareWhiteboardHref,
  getCourseware,
} from '@/lib/courseware-catalog';

export function coursewareForShape(shape: BoardShape) {
  return shape.type === 'embed'
    ? getCourseware(shape.props.coursewareId)
    : undefined;
}

export function prepareCoursewareBoard(
  document: BoardDocument,
  product: CoursewareProduct,
  viewport: Pick<Bounds, 'w' | 'h'>
) {
  // Reopening the article reuses the existing lesson card and never replaces notes.
  for (const page of document.pages) {
    const existing = page.shapes.find(
      (shape) => coursewareForShape(shape)?.id === product.id
    );
    if (existing) {
      return {
        document: {
          ...document,
          currentPageId: page.id,
          pages: document.pages.map((candidate) =>
            candidate === page && candidate.camera.zoom === 1
              ? {
                  ...candidate,
                  camera: {
                    ...candidate.camera,
                    x: Math.round(candidate.camera.x),
                    y: Math.round(candidate.camera.y),
                  },
                }
              : candidate
          ),
        },
        shapeId: existing.id,
      };
    }
  }
  const w = Math.max(280, Math.min(1240, (viewport.w || 1000) - 36));
  const h = Math.max(320, Math.min(780, (viewport.h || 800) - 138));
  const shape = {
    ...createShape('embed', 0, 0, {
      title: product.title,
      coursewareId: product.id,
    }),
    w,
    h,
  };
  return {
    document: {
      ...document,
      pages: document.pages.map((page) =>
        page.id === document.currentPageId
          ? {
              ...page,
              shapes: [...page.shapes, shape],
              camera: {
                zoom: 1,
                x: Math.max(12, Math.round(((viewport.w || 1000) - w) / 2)),
                y: Math.max(54, Math.round(((viewport.h || 800) - h - 32) / 2)),
              },
            }
          : page
      ),
    },
    shapeId: shape.id,
  };
}
