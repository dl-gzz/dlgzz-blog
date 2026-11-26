'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { buildStandaloneCoursewareHtml, plantingLessonConfig } from './core/courseware';
import { downloadBlob } from './core/export';

const directory = '/courseware/zhi-shu-shi-yan';

export default function PlantingLessonFrame({
  title,
  config,
}: { title: string; config: unknown }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const inProgress = useRef(false);
  const current = useMemo(() => plantingLessonConfig(config), [config]);
  const sync = useCallback(() => {
    frame.current?.contentWindow?.postMessage(
      current
        ? { type: 'courseware:preview-config', config: current }
        : { type: 'courseware:restore-default' },
      '*'
    );
  }, [current]);
  useEffect(sync, [sync]);

  useEffect(() => {
    let active = true;
    const onExport = async (event: MessageEvent) => {
      const child = frame.current?.contentWindow;
      const data = event.data;
      if (!child || event.source !== child || event.origin !== 'null' ||
        data?.type !== 'courseware:export-request' ||
        data.coursewareId !== 'zhi-shu-shi-yan' ||
        typeof data.requestId !== 'string' || !/^exp_[a-z0-9_]{1,48}$/.test(data.requestId))
        return;

      const reply = (ok: boolean, detail: string) => {
        if (!active || frame.current?.contentWindow !== child) return;
        child.postMessage({
          type: 'courseware:export-result', requestId: data.requestId, ok,
          ...(ok ? { message: detail } : { error: detail }),
        }, '*');
      };
      if (inProgress.current) return reply(false, '正在打包，请稍候再试');
      const basename = (typeof data.filename === 'string' ? data.filename.slice(0, 120) : title)
        .replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').trim().slice(0, 64) || '植树大冒险';
      inProgress.current = true;
      try {
        if (data.format === 'markdown' && typeof data.markdown === 'string' && data.markdown.length <= 96_000) {
          const name = basename.endsWith('.md') ? basename : basename + '.md';
          downloadBlob(new Blob([data.markdown], { type: 'text/markdown;charset=utf-8' }), name);
          return reply(true, '已提交规格包下载');
        }
        if (data.format !== 'html' || !plantingLessonConfig(data.config))
          return reply(false, '课件配置或导出格式无效');
        const signal = AbortSignal.timeout(4500);
        const assets = await Promise.all(
          ['index.html', 'lesson.css', 'config.js', 'model.js', 'lesson.js'].map(async (path) => {
            const response = await fetch(directory + '/' + path, { signal, redirect: 'error' });
            if (!response.ok) throw new Error('课件资源未载入');
            return response.text();
          })
        );
        if (!active || frame.current?.contentWindow !== child) return;
        const [template, css, configJs, modelJs, lessonJs] = assets;
        const html = buildStandaloneCoursewareHtml(template, { css, configJs, modelJs, lessonJs }, data.config);
        const name = basename.endsWith('.html') ? basename : basename + '.html';
        downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), name);
        reply(true, '已提交离线课件下载');
      } catch {
        reply(false, '未能打包课件，请稍后重试');
      } finally {
        inProgress.current = false;
      }
    };
    window.addEventListener('message', onExport);
    return () => {
      active = false;
      window.removeEventListener('message', onExport);
    };
  }, [title]);

  return <iframe ref={frame} title={title} src={directory + '/index.html'}
    sandbox="allow-scripts" allowFullScreen referrerPolicy="no-referrer"
    onLoad={sync} style={{ width: '100%', height: '100%' }} />;
}
