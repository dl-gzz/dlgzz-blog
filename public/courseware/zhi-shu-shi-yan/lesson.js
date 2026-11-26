(() => {
  const model = plantingModel;
  const cfgLib = zhiShuConfig;
  const node = (id) => document.getElementById(id);
  const road = node('road');

  let config = cfgLib.normalizeConfig(window.__COURSEWARE_INLINE_CONFIG__ || cfgLib.defaultConfig());
  let isPreview = false;
  let state = model.initialState(config.routeLength);
  state = {
    ...state,
    shape: config.defaultShape,
    mode: config.defaultMode,
    skin: config.defaultSkin,
  };

  let gameMode = 'explore'; // 'explore' | 'mission'
  let missionIndex = 0;
  const completedMissions = new Set();
  let lastPlantedIndex = -1;

  // Lightweight Web Audio synthesizer (zero external MP3 dependencies)
  let audioCtx = null;
  function playTone(type) {
    if (!config.soundEnabled) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      const playNote = (freq, start, dur, wave = 'sine', gainVal = 0.08) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = wave;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(gainVal, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(start);
        osc.stop(start + dur);
      };
      if (type === 'plant') {
        playNote(440, now, 0.09, 'triangle', 0.1);
        playNote(660, now + 0.04, 0.12, 'sine', 0.08);
      } else if (type === 'remove') {
        playNote(360, now, 0.08, 'triangle', 0.07);
        playNote(240, now + 0.04, 0.09, 'sine', 0.06);
      } else if (type === 'uniform') {
        [523, 659, 784].forEach((f, i) => playNote(f, now + i * 0.055, 0.14, 'sine', 0.08));
      } else if (type === 'win') {
        [523, 659, 784, 1046].forEach((f, i) => playNote(f, now + i * 0.08, 0.24, 'triangle', 0.1));
      }
    } catch {
      // Audio is optional; ignore autoplay/browser restrictions.
    }
  }

  function spawnParticles(x, y, colors = ['#f5bd42', '#34d399', '#60a5fa', '#fb7185'], count = 8) {
    const fx = node('fx');
    if (!fx) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
      const dist = 16 + Math.random() * 24;
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(x));
      circle.setAttribute('cy', String(y - 10));
      circle.setAttribute('r', String(3 + Math.random() * 2.5));
      circle.setAttribute('fill', colors[i % colors.length]);
      circle.setAttribute('class', 'particle');
      circle.style.setProperty('--dx', `${(Math.cos(angle) * dist).toFixed(1)}px`);
      circle.style.setProperty('--dy', `${(Math.sin(angle) * dist - 6).toFixed(1)}px`);
      frag.appendChild(circle);
      setTimeout(() => circle.remove(), 560);
    }
    fx.appendChild(frag);
  }

  function sceneryMarkup() {
    if (config.theme === 'night') {
      return `
        <circle cx="576" cy="48" r="18" fill="#fef08a" opacity=".88"/>
        <circle cx="583" cy="43" r="16" fill="#1a2d42"/>
        <circle cx="88" cy="42" r="2" fill="#e2e8f0" opacity=".8"/>
        <circle cx="174" cy="30" r="1.8" fill="#fef08a" opacity=".75"/>
        <circle cx="430" cy="36" r="2.2" fill="#e2e8f0" opacity=".7"/>
        <circle cx="510" cy="64" r="1.5" fill="#bae6fd" opacity=".7"/>
      `;
    }
    const sunColor = config.theme === 'autumn' ? '#f59e0b' : '#fde047';
    const tuftColor = config.theme === 'autumn' ? '#d9a45b' : '#7ec296';
    return `
      <circle cx="580" cy="46" r="24" fill="${sunColor}" opacity=".28"/>
      <circle cx="580" cy="46" r="15" fill="${sunColor}" opacity=".68"/>
      <path d="M42 54q6-12 12 0m4 0q5-9 10 0M520 310q6-11 12 0m5 0q5-8 9 0M115 304q5-10 10 0"
        fill="none" stroke="${tuftColor}" stroke-width="2.5" stroke-linecap="round" opacity=".75"/>
    `;
  }

  function pathMarkup() {
    const route = model.routes[state.shape];
    if (route.circle) {
      const { x, y, radius } = route.circle;
      return `
        <circle cx="${x}" cy="${y}" r="${radius}" fill="none" stroke="var(--road-edge)" stroke-width="38"/>
        <circle cx="${x}" cy="${y}" r="${radius}" fill="none" stroke="var(--road)" stroke-width="30"/>
        <circle cx="${x}" cy="${y}" r="${radius}" fill="none" stroke="#f7d674" stroke-width="2" stroke-dasharray="10 10" opacity=".75"/>
      `;
    }

    const lanePath = (segments) =>
      `M${segments[0].x} ${segments[0].y} ` +
      segments.map(({ end, bottom }) => `L${end} ${bottom}`).join(' ') +
      (route.closed ? 'Z' : '');

    if (state.shape === 'highway') {
      const [{ x, end }] = route.lanes[0];
      const { start, end: pavementEnd, center, radius } = route.pavement;
      return `
        <path d="M${start} ${center}H${pavementEnd}" fill="none" stroke="var(--road-edge)" stroke-width="${radius * 2 + 8}" stroke-linecap="round"/>
        <path d="M${start} ${center}H${pavementEnd}" fill="none" stroke="var(--road)" stroke-width="${radius * 2}" stroke-linecap="round"/>
        <path d="M${x} ${center}H${end}" stroke="#f5d061" stroke-width="3.2" stroke-dasharray="14 10" stroke-linecap="round"/>
        ${route.lanes.map((segments) => `<path d="${lanePath(segments)}" stroke="rgba(255,255,255,0.28)" stroke-width="1.5" stroke-dasharray="4 6"/>`).join('')}
        <text x="${x}" y="294" class="road-label">起点</text><text x="${end}" y="294" class="road-label">终点</text>
      `;
    }
    const [segments] = route.lanes;
    const [{ x, y, end }] = segments;
    const labels = route.closed
      ? ''
      : `<text x="${x}" y="${y + 56}" class="road-label">起点</text><text x="${end}" y="${y + 56}" class="road-label">终点</text>`;
    return `
      <path d="${lanePath(segments)}" fill="none" stroke="var(--road-edge)" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${lanePath(segments)}" fill="none" stroke="var(--road)" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${lanePath(segments)}" fill="none" stroke="#f7d674" stroke-width="2" stroke-dasharray="10 10" opacity=".72"/>
      ${labels}
    `;
  }

  function transform({ lane, t }, yOffset = 0) {
    const { x, y } = model.pointAt(state.shape, lane, t);
    return `translate(${x} ${y + yOffset})`;
  }

  function renderRoad() {
    node('scenery').innerHTML = sceneryMarkup();
    node('paths').innerHTML = pathMarkup();
    node('buildings').innerHTML = model
      .buildingsFor(state)
      .map((position) => `<use href="#building" transform="${transform(position)}"/>`)
      .join('');
    node('plants').innerHTML = state.plants
      .map(
        (position, idx) =>
          `<g class="planted${idx === lastPlantedIndex ? ' is-new' : ''}" data-plant-index="${idx}" transform="${transform(position)}">
            <rect x="-12" y="-36" width="24" height="42" rx="6" fill="transparent"/>
            <g class="plant-inner"><use href="#${state.skin}"/></g>
          </g>`
      )
      .join('');
    const data = model.readout(state);
    node('markers').innerHTML = state.markers
      .map((marker) => {
        const gapTag =
          data.average && marker.number === 1
            ? `<text y="28" class="gap-chip">${data.average}m</text>`
            : '';
        return `<g class="marker-badge" transform="${transform(marker, 16)}">
          <circle r="13" fill="#1d4ed8" stroke="#fff" stroke-width="2.4"/>
          <text class="marker-label">${marker.number}</text>
          ${gapTag}
        </g>`;
      })
      .join('');
    lastPlantedIndex = -1;
  }

  function eye(hidden) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.75"/>
      ${hidden ? '<path d="m4 4 16 16"/>' : ''}</svg>`;
  }

  function renderData() {
    const data = model.readout(state);
    node('course-title').textContent = config.title;
    node('course-subtitle').textContent = config.subtitle;
    node('route-length-label').textContent = `${data.routeLength} 米`;
    node('preview-pill').hidden = !isPreview;
    node('hint').textContent = data.hint;
    node('quantity-label').textContent = `总${data.unit}数`;
    node('quantity').textContent = String(data.count);
    node('intervals').textContent = String(data.totalIntervals);
    node('counts').hidden = data.dataHidden;
    node('data-hidden').hidden = !data.dataHidden;
    node('mode-title').textContent = data.title;

    const formula = node('formula');
    formula.classList.toggle('placeholder', !data.formula);
    formula.textContent = data.formula || '点击路面种树，自动揭示规律';
    if (data.formula?.endsWith(' × 2')) {
      formula.textContent = data.formula.slice(0, -3);
      const factor = document.createElement('span');
      factor.className = 'times-two';
      factor.textContent = '× 2';
      formula.append(factor);
    }
    node('average').hidden = data.average === null;
    node('average').textContent = data.average === null ? '' : `平均间距 ${data.average} 米`;

    const dataButton = node('toggle-data');
    dataButton.innerHTML = eye(data.dataHidden) + (data.dataHidden ? '显示数据' : '隐藏数据');
    dataButton.setAttribute('aria-pressed', String(data.dataHidden));
    const formulaButton = node('toggle-formula');
    const formulaAction = state.formulaHidden ? '显示公式' : '隐藏公式';
    formulaButton.innerHTML = eye(state.formulaHidden);
    formulaButton.setAttribute('aria-label', formulaAction);
    formulaButton.title = formulaAction;
    formulaButton.setAttribute('aria-pressed', String(state.formulaHidden));

    const soundBtn = node('toggle-sound');
    soundBtn.textContent = config.soundEnabled ? '🔊' : '🔇';
    soundBtn.setAttribute('aria-pressed', String(config.soundEnabled));
  }

  function renderMissions() {
    const missions = config.missions || [];
    node('star-counter').textContent = `⭐ ${completedMissions.size}/${missions.length}`;
    node('mission-bar').hidden = gameMode !== 'mission';
    node('tab-explore').classList.toggle('is-active', gameMode === 'explore');
    node('tab-explore').setAttribute('aria-selected', String(gameMode === 'explore'));
    node('tab-mission').classList.toggle('is-active', gameMode === 'mission');
    node('tab-mission').setAttribute('aria-selected', String(gameMode === 'mission'));
    if (gameMode !== 'mission' || !missions.length) return;

    missionIndex = Math.max(0, Math.min(missions.length - 1, missionIndex));
    const mission = missions[missionIndex];
    node('mission-pills').innerHTML = missions
      .map(
        (m, idx) =>
          `<button type="button" class="mission-pill${idx === missionIndex ? ' is-current' : ''}${completedMissions.has(m.id) ? ' is-done' : ''}" data-mission-idx="${idx}">${completedMissions.has(m.id) ? '⭐ ' : ''}${idx + 1}</button>`
      )
      .join('');
    node('mission-title').textContent = mission.title;
    node('mission-story').textContent = mission.story;
    node('mission-next-btn').hidden = !completedMissions.has(mission.id) || missionIndex >= missions.length - 1;
  }

  function loadMission(index) {
    const missions = config.missions || [];
    if (!missions[index]) return;
    missionIndex = index;
    const m = missions[index];
    state = {
      ...model.initialState(m.routeLength || config.routeLength),
      shape: m.shape,
      mode: m.mode,
      skin: m.skin,
    };
    const fb = node('mission-feedback');
    fb.hidden = true;
    fb.classList.remove('is-pass');
    render();
  }

  function render() {
    document.body.dataset.theme = config.theme || 'spring';
    renderRoad();
    renderData();
    renderMissions();
    const closed = Boolean(model.routes[state.shape].closed);
    node('mode-choices').hidden = closed;
    node('closed-mode').hidden = !closed;
    for (const key of ['shape', 'mode', 'skin']) {
      document.querySelectorAll(`button[data-${key}]`).forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset[key] === state[key]));
      });
    }
  }

  function update(next, sound) {
    if (next === state) return;
    state = next;
    if (sound) playTone(sound);
    render();
  }

  function applyConfig(nextConfig, previewFlag) {
    config = cfgLib.normalizeConfig(nextConfig, config);
    isPreview = previewFlag;
    state = {
      ...model.setShape(model.setRouteLength(state, config.routeLength), config.defaultShape),
      shape: config.defaultShape,
      mode: config.defaultMode,
      skin: config.defaultSkin,
    };
    if (gameMode === 'mission') {
      loadMission(Math.min(missionIndex, config.missions.length - 1));
    } else {
      render();
    }
  }

  // Tool buttons
  for (const [key, action] of Object.entries({
    shape: model.setShape,
    mode: model.setMode,
    skin: model.setSkin,
  })) {
    document.querySelectorAll(`button[data-${key}]`).forEach((button) => {
      button.addEventListener('click', () => update(action(state, button.dataset[key])));
    });
  }

  node('uniform').addEventListener('click', () => {
    const next = model.uniform(state);
    update(next, 'uniform');
  });
  node('reset').addEventListener('click', () => update(model.reset(state), 'remove'));
  node('toggle-data').addEventListener('click', () => update(model.toggleData(state)));
  node('toggle-formula').addEventListener('click', () => update(model.toggleFormula(state)));
  node('toggle-sound').addEventListener('click', () => {
    config = { ...config, soundEnabled: !config.soundEnabled };
    renderData();
  });

  // Mode tabs
  node('tab-explore').addEventListener('click', () => {
    gameMode = 'explore';
    state = model.setRouteLength(state, config.routeLength);
    render();
  });
  node('tab-mission').addEventListener('click', () => {
    gameMode = 'mission';
    loadMission(missionIndex);
  });

  // Mission controls
  node('mission-pills').addEventListener('click', (event) => {
    const btn = event.target.closest('button[data-mission-idx]');
    if (!btn) return;
    loadMission(Number(btn.dataset.missionIdx));
  });
  node('mission-hint-btn').addEventListener('click', () => {
    const m = config.missions[missionIndex];
    if (!m) return;
    const fb = node('mission-feedback');
    fb.textContent = `💡 提示：${m.hint}`;
    fb.classList.remove('is-pass');
    fb.hidden = false;
  });
  node('mission-check-btn').addEventListener('click', () => {
    const m = config.missions[missionIndex];
    const result = model.evaluateMission(state, m);
    const fb = node('mission-feedback');
    fb.textContent = result.feedback;
    fb.classList.toggle('is-pass', result.passed);
    fb.hidden = false;
    if (result.passed) {
      completedMissions.add(m.id);
      playTone('win');
      spawnParticles(320, 140, ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#a855f7'], 16);
      renderMissions();
    } else {
      playTone('remove');
    }
  });
  node('mission-next-btn').addEventListener('click', () => {
    loadMission(missionIndex + 1);
  });

  // Road click: plant new object OR click existing planted object to remove it
  road.addEventListener('click', (event) => {
    const plantedNode = event.target.closest('.planted');
    if (plantedNode) {
      const idx = Number(plantedNode.dataset.plantIndex);
      if (Number.isInteger(idx)) {
        const removed = state.plants[idx];
        if (removed) {
          const pt = model.pointAt(state.shape, removed.lane, removed.t);
          spawnParticles(pt.x, pt.y, ['#cbd5e1', '#94a3b8'], 5);
        }
        update(model.removeAt(state, idx), 'remove');
      }
      return;
    }
    const matrix = road.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const next = model.plant(state, point);
    if (next !== state) {
      lastPlantedIndex = next.plants.length - 1;
      const placed = next.plants[lastPlantedIndex];
      const pt = model.pointAt(next.shape, placed.lane, placed.t);
      spawnParticles(pt.x, pt.y);
      update(next, 'plant');
    }
  });

  // Export modal
  node('open-export').addEventListener('click', () => {
    node('export-status').hidden = true;
    node('export-modal').hidden = false;
  });
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      node(btn.dataset.close).hidden = true;
    });
  });

  // Export: Standalone offline HTML & Cross-Agent Markdown Pack
  // When embedded inside the whiteboard's sandboxed iframe, delegate downloads to the host via postMessage
  // and wait for an explicit confirmation instead of falsely claiming success.
  const isEmbedded = (() => {
    try {
      return window.parent && window.parent !== window;
    } catch {
      return true;
    }
  })();

  const pendingExports = new Map();

  function safeFilename(base, ext) {
    const cleaned = String(base || '植树大冒险')
      .replace(/[\\/:*?"<>|]+/g, '-')
      .trim()
      .slice(0, 48);
    return `${cleaned || '植树大冒险'}.${ext}`;
  }

  function triggerDirectDownload(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function requestHostExport(format, filename, extraPayload) {
    const status = node('export-status');
    const requestId = `exp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    status.textContent = '正在请求白板打包并下载，请稍候…';
    status.hidden = false;
    const timer = setTimeout(() => {
      if (!pendingExports.has(requestId)) return;
      pendingExports.delete(requestId);
      status.textContent = '当前嵌入环境未响应下载请求，请单独打开课件页下载，或使用「复制给其他智能体」。';
    }, 5000);
    pendingExports.set(requestId, { timer, status });
    window.parent.postMessage(
      {
        type: 'courseware:export-request',
        requestId,
        coursewareId: config.id || 'zhi-shu-shi-yan',
        format,
        filename,
        config,
        ...extraPayload,
      },
      new URL(window.location.href).origin
    );
  }

  node('download-html-btn').addEventListener('click', async () => {
    const filename = safeFilename(config.title, 'html');
    if (isEmbedded) {
      requestHostExport('html', filename, {});
      return;
    }
    const status = node('export-status');
    try {
      const [templateHtml, css, configJs, modelJs, lessonJs] = await Promise.all([
        fetch('index.html').then((r) => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        }),
        fetch('lesson.css').then((r) => r.text()),
        fetch('config.js').then((r) => r.text()),
        fetch('model.js').then((r) => r.text()),
        fetch('lesson.js').then((r) => r.text()),
      ]);
      const html = cfgLib.buildStandaloneHtml(
        templateHtml,
        { css, configJs, modelJs, lessonJs },
        config
      );
      triggerDirectDownload(filename, html, 'text/html;charset=utf-8');
      status.textContent = `已生成并下载离线单文件：${filename}，双击即可在教室大屏打开！`;
      status.hidden = false;
    } catch {
      status.textContent = '当前环境无法读取本地静态脚本，请通过 http://localhost 或白板打开后再下载离线 HTML。';
      status.hidden = false;
    }
  });

  node('copy-agent-md-btn').addEventListener('click', async () => {
    const md = cfgLib.buildAgentPromptPack(config);
    const status = node('export-status');
    try {
      await navigator.clipboard.writeText(md);
      status.textContent = '已复制跨智能体规格包，直接粘贴给 DeepSeek / 豆包 / Kimi / Claude 即可继续改编！';
    } catch {
      status.textContent = '当前环境限制剪贴板写入，请点击右侧「下载 .md 规格包」。';
    }
    status.hidden = false;
  });

  node('download-agent-md-btn').addEventListener('click', () => {
    const md = cfgLib.buildAgentPromptPack(config);
    const filename = safeFilename(`${config.title}-智能体规格包`, 'md');
    if (isEmbedded) {
      requestHostExport('markdown', filename, { markdown: md });
      return;
    }
    triggerDirectDownload(filename, md, 'text/markdown;charset=utf-8');
    const status = node('export-status');
    status.textContent = `已下载跨智能体规格包：${filename}。`;
    status.hidden = false;
  });

  // Listen for whiteboard host preview updates & export confirmations via postMessage
  window.addEventListener('message', (event) => {
    if (!isEmbedded || event.source !== window.parent ||
      event.origin !== new URL(window.location.href).origin) return;
    const payload = event.data;
    if (!payload || typeof payload !== 'object') return;
    if (payload.type === 'courseware:export-result' && typeof payload.requestId === 'string') {
      const entry = pendingExports.get(payload.requestId);
      if (!entry) return;
      clearTimeout(entry.timer);
      pendingExports.delete(payload.requestId);
      entry.status.textContent = payload.ok
        ? payload.message || '下载已完成！'
        : `下载失败：${payload.error || '请稍后重试'}`;
      entry.status.hidden = false;
      return;
    }
    if (payload.type === 'courseware:preview-config' && payload.config) {
      applyConfig(payload.config, true);
    } else if (payload.type === 'courseware:restore-default') {
      applyConfig(cfgLib.defaultConfig(), false);
    } else if (payload.type === 'courseware:ai-edit' && typeof payload.instruction === 'string') {
      const edited = cfgLib.applyNaturalLanguageEdit(config, payload.instruction);
      applyConfig(edited.config, true);
    }
  });

  render();
})();
