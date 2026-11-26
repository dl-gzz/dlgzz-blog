// Teacher-editable courseware configuration, safe offline packager, & cross-agent prompt builder.
// Classic script: works both inside sandbox="allow-scripts" iframes and standalone offline HTML.
const zhiShuConfig = (() => {
  const THEMES = {
    spring: {
      name: '晨光草坪',
      sky: '#e9f6ee',
      grassTop: '#dff2e2',
      grassBottom: '#c9e6cf',
      road: '#4a6b5f',
      roadEdge: '#324d43',
      accent: '#157347',
      accentWarm: '#f59e0b',
    },
    autumn: {
      name: '金秋银杏',
      sky: '#fdf5e6',
      grassTop: '#f5ead2',
      grassBottom: '#e8d7b4',
      road: '#6b5748',
      roadEdge: '#4a3b30',
      accent: '#b45309',
      accentWarm: '#eab308',
    },
    night: {
      name: '星空夜路',
      sky: '#182436',
      grassTop: '#1d3247',
      grassBottom: '#152536',
      road: '#334155',
      roadEdge: '#1e293b',
      accent: '#38bdf8',
      accentWarm: '#fbbf24',
    },
  };

  const SKIN_META = {
    ginkgo: { name: '银杏', unit: '棵', verb: '种' },
    pine: { name: '松树', unit: '棵', verb: '种' },
    lamp: { name: '路灯', unit: '盏', verb: '装' },
    flag: { name: '彩旗', unit: '面', verb: '插' },
  };

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function isClosedShape(shape) {
    return shape === 'circle' || shape === 'rectangle' || shape === 'triangle';
  }

  /**
   * Compute expected targetCount given routeLength, targetGap, shape, and mode.
   * Ensures targetCount, totalIntervals, and targetGap are mathematically consistent.
   */
  function computeTargetCount(routeLength, targetGap, shape, mode) {
    const gapsPerLane = Math.max(1, Math.round(routeLength / Math.max(1, targetGap)));
    if (isClosedShape(shape)) return gapsPerLane;
    const perLane =
      mode === 'both'
        ? gapsPerLane + 1
        : mode === 'neither'
          ? Math.max(1, gapsPerLane - 1)
          : gapsPerLane;
    return shape === 'highway' ? perLane * 2 : perLane;
  }

  /**
   * Pick a clean integer spacing that divides `routeLength` evenly and stays close
   * to the mission's preferred interval count (e.g. 4 or 5 intervals).
   */
  function pickCleanGap(routeLength, preferredGaps) {
    const targetGaps = Math.max(2, Math.min(10, preferredGaps || 4));
    const divisors = [];
    for (let g = 2; g <= Math.min(12, routeLength); g++) {
      if (routeLength % g === 0) divisors.push(g);
    }
    if (divisors.length) {
      divisors.sort((a, b) => Math.abs(a - targetGaps) - Math.abs(b - targetGaps));
      return routeLength / divisors[0];
    }
    return Math.max(1, Math.round((routeLength / targetGaps) * 10) / 10);
  }

  /**
   * Dynamically generate accurate story & hint text from structured mission numbers
   * so the prompt wording ALWAYS matches the grading criteria.
   */
  function buildMissionCopy(mission) {
    const skin = SKIN_META[mission.skin] || SKIN_META.ginkgo;
    const len = mission.routeLength;
    const gap = mission.targetGap;
    const gapsPerLane = Math.max(1, Math.round(len / Math.max(0.1, gap)));
    const gapText = Number.isInteger(gap) ? String(gap) : Number(gap).toFixed(1);

    if (mission.shape === 'highway') {
      const modeLabel =
        mission.mode === 'both'
          ? '两端都' + skin.verb
          : mission.mode === 'neither'
            ? '两端都不' + skin.verb
            : '只' + skin.verb + '一端';
      const perLane = Math.round(mission.targetCount / 2);
      const relationText =
        mission.mode === 'both'
          ? `${gapsPerLane} + 1 = ${perLane}`
          : mission.mode === 'neither'
            ? `${gapsPerLane} - 1 = ${perLane}`
            : `${gapsPerLane}`;
      return {
        story: `${len} 米大道公路两侧都要${skin.verb}${skin.name}，${modeLabel}，每 ${gapText} 米${skin.verb} 1 ${skin.unit}，两侧一共需要几${skin.unit}？`,
        hint: `先算单侧：${len} ÷ ${gapText} = ${gapsPerLane} 个间隔，单侧 ${relationText} ${skin.unit}，再乘 2 侧 = ${mission.targetCount} ${skin.unit}。`,
      };
    }

    if (isClosedShape(mission.shape)) {
      const shapeName =
        mission.shape === 'circle'
          ? '圆形花坛'
          : mission.shape === 'rectangle'
            ? '长方形操场'
            : '三角形池塘';
      return {
        story: `周长 ${len} 米的${shapeName}，每隔 ${gapText} 米${skin.verb} 1 ${skin.unit}${skin.name}，一共要${skin.verb}几${skin.unit}？`,
        hint: `把封闭路线剪开拉直就是「只种一端」：${len} ÷ ${gapText} = ${gapsPerLane} 个间隔，所以${skin.unit}数 = 间隔数。`,
      };
    }

    if (mission.mode === 'neither') {
      return {
        story: `两栋教学楼相距 ${len} 米，两端都不${skin.verb}${skin.name}，每 ${gapText} 米${skin.verb} 1 ${skin.unit}，需要${skin.verb}几${skin.unit}？`,
        hint: `${len} ÷ ${gapText} = ${gapsPerLane} 个间隔；两端都不种时，${skin.unit}数 = 间隔数 - 1。`,
      };
    }
    if (mission.mode === 'left' || mission.mode === 'right') {
      const side = mission.mode === 'left' ? '左端' : '右端';
      return {
        story: `校门旁 ${len} 米步道，只${skin.verb}${side}${skin.name}，每 ${gapText} 米${skin.verb} 1 ${skin.unit}，共需多少${skin.unit}？`,
        hint: `${len} ÷ ${gapText} = ${gapsPerLane} 个间隔；只种一端时，${skin.unit}数 = 间隔数。`,
      };
    }
    return {
      story: `${len} 米校园小路，两端都要${skin.verb}${skin.name}，每 ${gapText} 米${skin.verb} 1 ${skin.unit}。试着放好正确数量并均匀排列！`,
      hint: `${len} ÷ ${gapText} = ${gapsPerLane} 个间隔；两端都种时，${skin.unit}数 = 间隔数 + 1。`,
    };
  }

  function syncMissionForRouteLength(mission, nextRouteLength) {
    const len = clampNumber(nextRouteLength, 10, 2000, mission.routeLength || 100);
    const oldLen = mission.routeLength || 100;
    const oldGaps = Math.max(2, Math.round(oldLen / Math.max(1, mission.targetGap || 25)));
    const nextGap =
      mission.targetGap && len % mission.targetGap === 0 && len / mission.targetGap >= 2 && len / mission.targetGap <= 12
        ? mission.targetGap
        : pickCleanGap(len, oldGaps);
    const nextCount = computeTargetCount(len, nextGap, mission.shape, mission.mode);
    const updated = {
      ...mission,
      routeLength: len,
      targetGap: nextGap,
      targetCount: nextCount,
    };
    if (!mission.customStory) {
      const copy = buildMissionCopy(updated);
      updated.story = copy.story;
      updated.hint = copy.hint;
    }
    return updated;
  }

  function createBuiltInMission(spec) {
    const base = {
      ...spec,
      targetCount: computeTargetCount(spec.routeLength, spec.targetGap, spec.shape, spec.mode),
      customStory: false,
    };
    const copy = buildMissionCopy(base);
    return { ...base, story: copy.story, hint: copy.hint };
  }

  function defaultConfig() {
    return {
      id: 'zhi-shu-shi-yan',
      version: 2,
      title: '植树大冒险',
      subtitle: '人教版五年级数学 · 植树问题互动实验',
      routeLength: 100,
      theme: 'spring',
      defaultShape: 'line',
      defaultMode: 'both',
      defaultSkin: 'ginkgo',
      soundEnabled: true,
      teacherNote: '',
      missions: [
        createBuiltInMission({
          id: 'm1',
          title: '第 1 关 · 校园直路',
          shape: 'line',
          mode: 'both',
          skin: 'ginkgo',
          routeLength: 100,
          targetGap: 25,
        }),
        createBuiltInMission({
          id: 'm2',
          title: '第 2 关 · 两楼之间',
          shape: 'line',
          mode: 'neither',
          skin: 'pine',
          routeLength: 100,
          targetGap: 20,
        }),
        createBuiltInMission({
          id: 'm3',
          title: '第 3 关 · 校门一侧',
          shape: 'line',
          mode: 'left',
          skin: 'lamp',
          routeLength: 100,
          targetGap: 20,
        }),
        createBuiltInMission({
          id: 'm4',
          title: '第 4 关 · 林荫大道两侧',
          shape: 'highway',
          mode: 'both',
          skin: 'flag',
          routeLength: 100,
          targetGap: 25,
        }),
        createBuiltInMission({
          id: 'm5',
          title: '第 5 关 · 圆形花坛',
          shape: 'circle',
          mode: 'both',
          skin: 'ginkgo',
          routeLength: 100,
          targetGap: 20,
        }),
      ],
    };
  }

  function normalizeConfig(patch, base = defaultConfig()) {
    if (!patch || typeof patch !== 'object') return base;
    const routeLength = clampNumber(patch.routeLength, 10, 2000, base.routeLength);
    const routeLengthChanged = routeLength !== base.routeLength;

    const rawMissions =
      Array.isArray(patch.missions) && patch.missions.length ? patch.missions : base.missions;

    const missions = rawMissions.slice(0, 12).map((m, idx) => {
      const shape = ['line', 'highway', 'circle', 'rectangle', 'triangle'].includes(m.shape)
        ? m.shape
        : 'line';
      const mode = ['both', 'neither', 'left', 'right'].includes(m.mode) ? m.mode : 'both';
      const skin = ['ginkgo', 'pine', 'lamp', 'flag'].includes(m.skin) ? m.skin : 'ginkgo';
      const mLen = clampNumber(m.routeLength, 10, 2000, base.routeLength);
      const customStory = Boolean(m.customStory);

      let normalizedMission = {
        id: typeof m.id === 'string' && m.id ? m.id : `m${idx + 1}`,
        title:
          typeof m.title === 'string' && m.title.trim()
            ? m.title.trim().slice(0, 40)
            : `第 ${idx + 1} 关`,
        shape,
        mode,
        skin,
        routeLength: mLen,
        targetGap: Number(m.targetGap) > 0 ? Number(m.targetGap) : pickCleanGap(mLen, 4),
        targetCount: clampNumber(m.targetCount, 1, 40, 5),
        story: typeof m.story === 'string' ? m.story.trim().slice(0, 180) : '',
        hint: typeof m.hint === 'string' ? m.hint.trim().slice(0, 160) : '',
        customStory,
      };

      if (routeLengthChanged) {
        normalizedMission = syncMissionForRouteLength(normalizedMission, routeLength);
      } else {
        normalizedMission.targetCount = computeTargetCount(
          normalizedMission.routeLength,
          normalizedMission.targetGap,
          normalizedMission.shape,
          normalizedMission.mode
        );
        if (!customStory || !normalizedMission.story) {
          const copy = buildMissionCopy(normalizedMission);
          normalizedMission.story = copy.story;
          if (!normalizedMission.hint) normalizedMission.hint = copy.hint;
        }
      }
      return normalizedMission;
    });

    return {
      ...base,
      title:
        typeof patch.title === 'string' && patch.title.trim()
          ? patch.title.trim().slice(0, 40)
          : base.title,
      subtitle:
        typeof patch.subtitle === 'string' && patch.subtitle.trim()
          ? patch.subtitle.trim().slice(0, 80)
          : base.subtitle,
      routeLength,
      theme: patch.theme && THEMES[patch.theme] ? patch.theme : base.theme,
      defaultShape: ['line', 'highway', 'circle', 'rectangle', 'triangle'].includes(
        patch.defaultShape
      )
        ? patch.defaultShape
        : base.defaultShape,
      defaultMode: ['both', 'neither', 'left', 'right'].includes(patch.defaultMode)
        ? patch.defaultMode
        : base.defaultMode,
      defaultSkin: ['ginkgo', 'pine', 'lamp', 'flag'].includes(patch.defaultSkin)
        ? patch.defaultSkin
        : base.defaultSkin,
      soundEnabled:
        typeof patch.soundEnabled === 'boolean' ? patch.soundEnabled : base.soundEnabled,
      teacherNote:
        typeof patch.teacherNote === 'string'
          ? patch.teacherNote.slice(0, 240)
          : base.teacherNote,
      missions,
    };
  }

  /**
   * Local quick parameter editor (rule-based, zero LLM call).
   * Keeps routeLength, targetGap, targetCount, and mission story 100% in sync.
   */
  function applyNaturalLanguageEdit(config, instruction) {
    const text = String(instruction || '').trim();
    if (!text) return { config, summary: '未输入修改说明。' };
    const patch = { ...config, missions: config.missions.map((m) => ({ ...m })) };
    const changes = [];

    const lenMatch = text.match(/(?:全长|总长|长度|路线|小路|周长)[^\d]{0,4}(\d{2,4})\s*米?/);
    if (lenMatch) {
      const meters = clampNumber(lenMatch[1], 10, 2000, config.routeLength);
      patch.routeLength = meters;
      patch.missions = patch.missions.map((m) => syncMissionForRouteLength(m, meters));
      changes.push(`路线全长改为 ${meters} 米（已同步重算各关间距与题干）`);
    }

    const titleMatch = text.match(
      /(?:标题|名字|课名)(?:改成|改为|叫|设为)[「"“]?([^」"”，。\n]{2,24})[」"”]?/
    );
    if (titleMatch) {
      patch.title = titleMatch[1].trim();
      changes.push(`标题改为「${patch.title}」`);
    }

    if (/金秋|秋天|银杏主题|暖色/.test(text)) {
      patch.theme = 'autumn';
      changes.push('切换为「金秋银杏」主题');
    } else if (/星空|夜晚|夜景|暗色|夜路/.test(text)) {
      patch.theme = 'night';
      changes.push('切换为「星空夜路」主题');
    } else if (/春天|草坪|晨光|浅绿/.test(text)) {
      patch.theme = 'spring';
      changes.push('切换为「晨光草坪」主题');
    }

    if (/圆形|花坛/.test(text)) {
      patch.defaultShape = 'circle';
      changes.push('默认路形设为圆形');
    } else if (/公路|两侧/.test(text)) {
      patch.defaultShape = 'highway';
      changes.push('默认路形设为公路两侧');
    } else if (/长方形|操场/.test(text)) {
      patch.defaultShape = 'rectangle';
      changes.push('默认路形设为长方形');
    } else if (/三角形/.test(text)) {
      patch.defaultShape = 'triangle';
      changes.push('默认路形设为三角形');
    }

    if (/路灯/.test(text)) {
      patch.defaultSkin = 'lamp';
      changes.push('默认道具切换为路灯');
    } else if (/彩旗/.test(text)) {
      patch.defaultSkin = 'flag';
      changes.push('默认道具切换为彩旗');
    } else if (/松树/.test(text)) {
      patch.defaultSkin = 'pine';
      changes.push('默认道具切换为松树');
    }

    if (/两端都不种/.test(text)) {
      patch.defaultMode = 'neither';
      changes.push('默认模式设为两端都不种');
    } else if (/只种左端|只种一端/.test(text)) {
      patch.defaultMode = 'left';
      changes.push('默认模式设为只种左端');
    } else if (/两端都种/.test(text)) {
      patch.defaultMode = 'both';
      changes.push('默认模式设为两端都种');
    }

    const customMissionMatch = text.match(/(\d{1,2})\s*(?:棵|盏|面)/);
    if (customMissionMatch && /加.*关|新增.*题|自定义/.test(text)) {
      const targetCount = clampNumber(customMissionMatch[1], 2, 30, 6);
      const shape = patch.defaultShape;
      const mode = patch.defaultMode;
      const closed = isClosedShape(shape);
      const perLane = shape === 'highway' ? Math.ceil(targetCount / 2) : targetCount;
      const gaps = closed
        ? perLane
        : Math.max(1, perLane + (mode === 'both' ? -1 : mode === 'neither' ? 1 : 0));
      const targetGap = Number((patch.routeLength / gaps).toFixed(1));
      const newMission = {
        id: `m${patch.missions.length + 1}`,
        title: `第 ${patch.missions.length + 1} 关 · 老师定制`,
        shape,
        mode,
        skin: patch.defaultSkin,
        routeLength: patch.routeLength,
        targetCount: computeTargetCount(patch.routeLength, targetGap, shape, mode),
        targetGap,
        customStory: false,
      };
      const copy = buildMissionCopy(newMission);
      patch.missions.push({ ...newMission, story: copy.story, hint: copy.hint });
      changes.push(`新增第 ${patch.missions.length} 关（间距 ${targetGap} 米）`);
    }

    if (!changes.length) {
      patch.teacherNote = text.slice(0, 240);
      changes.push('已更新课堂教学提示');
    }

    return {
      config: normalizeConfig(patch, config),
      summary: changes.join('；'),
    };
  }

  /**
   * Safely serialize JSON for embedding inside an HTML `<script>` tag.
   * Neutralizes `</script>`, `<!--`, and JS line separators.
   */
  function escapeJsonForScript(value) {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  /**
   * Assemble a self-contained, zero-network offline HTML document from template + assets + config.
   */
  function buildStandaloneHtml(templateHtml, assets, config) {
    const safeConfigJson = escapeJsonForScript(normalizeConfig(config));
    const safeCss = String(assets.css || '').replace(/<\/style/gi, '<\\/style');
    const inlineJs =
      `window.__COURSEWARE_INLINE_CONFIG__ = ${safeConfigJson};\n` +
      `${assets.configJs || ''}\n${assets.modelJs || ''}\n${assets.lessonJs || ''}`;
    const safeJs = inlineJs.replace(/<\/script/gi, '<\\/script');

    let html = String(templateHtml || '');
    html = html.replace(/<link[^>]+href=["']lesson\.css["'][^>]*>\s*/gi, '');
    html = html.replace(/<script[^>]+src=["'](?:config|model|lesson)\.js["'][^>]*><\/script>\s*/gi, '');
    html = html.replace(
      /<\/head>/i,
      `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">\n<style>\n${safeCss}\n</style>\n</head>`
    );
    html = html.replace(/<\/body>/i, `<script>\n${safeJs}\n</script>\n</body>`);
    return html;
  }

  /**
   * Build a portable Markdown prompt + config pack for external AI agents
   * (Doubao, Kimi, Claude, DeepSeek, WorkBuddy, OpenClaw).
   */
  function buildAgentPromptPack(config) {
    const normalized = normalizeConfig(config);
    const missionLines = normalized.missions
      .map(
        (m, i) =>
          `${i + 1}. **${m.title}**（路形：${m.shape}｜模式：${m.mode}｜道具：${m.skin}｜全长：${m.routeLength}米｜间距：${m.targetGap}米｜目标数：${m.targetCount}）\n   - 情境：${m.story}\n   - 引导提示：${m.hint}`
      )
      .join('\n');

    return `# ${normalized.title} · 跨智能体互动课件规格包

> 适用教材：人教版小学数学五年级上册《数学广角——植树问题》
> 适用平台：DeepSeek / 豆包 / Kimi / Claude / WorkBuddy / 独立工作者白板

## 1. 核心教学目标与数学规律
- **两端都种**：棵数 = 间隔数 + 1
- **两端都不种**：棵数 = 间隔数 - 1
- **只种一端**：棵数 = 间隔数
- **公路两侧**：总棵数 = 单侧棵数 × 2
- **封闭路线（圆/长方形/三角形）**：棵数 = 间隔数

## 2. 当前老师定制配置（COURSEWARE_CONFIG）
\`\`\`json
${JSON.stringify(normalized, null, 2)}
\`\`\`

## 3. 闯关任务清单
${missionLines}

## 4. 不能带动部分的降维替代说明
- **音效与朗读**：若目标智能体不支持音频播放，请用文字气泡 + 分步节奏提示替代音效。
- **美术素材**：所有树木、路灯、彩旗、教学楼均采用纯内联 SVG 矢量图形，零外部图片依赖，离线可直接运行。
- **离线运行约束**：生成的单文件 HTML 不请求外网资源，兼容教室希沃白板和沙箱 iframe。

## 5. 教室大屏工整排版与护眼铁律（生成新课件必守）
- **严格网格对齐（工整）**：顶栏、主画布/数据栏、底栏共用同一套 CSS Grid 列宽变量（如 \`minmax(0, 1fr) var(--right-col)\`）和统一间距，所有上下卡片与按钮组的左右边线严格对齐，绝不参差错位。
- **横屏 100% 满屏**：采用 \`height: 100dvh\` + \`grid-template-rows: auto auto minmax(0, 1fr) auto\`，主画布吃满剩余高度，不留大片空白。
- **护眼与后排高对比**：默认暖米护眼纸底（\`#F3EFE6\`）+ 深墨松青主字（\`#122B22\`，对比度 > 12:1），核心数字与公式大号高亮，底部按钮高度 ≥ 40px 适配教室触控大屏。
- **课堂界面纯粹**：学生大屏不放“老师备课提示语”（备课引导放进配套文章）；同类操作归并同一排，重置按钮放顶栏防误触。

## 6. 给其他智能体的二次改编指令
请基于上面的 \`COURSEWARE_CONFIG\`、游戏化规则以及第 5 节的「工整排版与护眼铁律」，帮我：
1. 保持「自由探索 + 闯关任务 + 均匀排列编号 + 实时公式揭示」的核心互动；
2. 按我的新要求修改数值、情境或新增关卡（务必保持 routeLength、targetGap、targetCount 数学一致），并输出新的 \`COURSEWARE_CONFIG\` JSON 或工整满屏的单文件 HTML。
`;
  }

  return {
    THEMES,
    defaultConfig,
    normalizeConfig,
    computeTargetCount,
    syncMissionForRouteLength,
    buildMissionCopy,
    applyNaturalLanguageEdit,
    escapeJsonForScript,
    buildStandaloneHtml,
    buildAgentPromptPack,
  };
})();

if (typeof module !== 'undefined') module.exports = zhiShuConfig;
