import {
  coursewareWhiteboardHref,
  getCourseware,
} from '@/components/own-whiteboard/core/courseware';
import { LocaleLink } from '@/i18n/navigation';
import { Play } from 'lucide-react';

export function CoursewareLaunch({ id }: { id: string }) {
  const courseware = getCourseware(id);
  if (!courseware) return null;

  return (
    <section
      aria-label="互动课件"
      className="not-prose my-8 rounded-2xl border border-blue-100 bg-blue-50 p-5 text-foreground sm:p-6 dark:border-blue-900 dark:bg-blue-950/30"
    >
      <p className="text-xs font-semibold tracking-wide text-blue-800 dark:text-blue-300">
        互动实验
      </p>
      <h2 className="mt-2 text-xl font-semibold">{courseware.title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        把大象拖上船、画出吃水线，再用石头和台秤验证你的办法。
      </p>
      <LocaleLink
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:focus-visible:outline-blue-300"
        href={coursewareWhiteboardHref(courseware)}
      >
        <Play className="size-4 shrink-0" aria-hidden="true" />
        在白板里做一次称象实验
      </LocaleLink>
    </section>
  );
}
