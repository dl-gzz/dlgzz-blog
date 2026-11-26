// Classic scripts also load in the whiteboard's opaque-origin iframe.
const plantingModel = (() => {
  const modes = {
    both: { title: '两端都种', adjustment: -1, start: 0, buildings: [] },
    neither: { title: '两端都不种', adjustment: 1, start: 1, buildings: [0, 1] },
    left: { title: '只种一端', adjustment: 0, start: 0, buildings: [1] },
    right: { title: '只种一端', adjustment: 0, start: 1, buildings: [0] },
  };
  const skins = {
    ginkgo: { unit: '棵', label: '银杏', hint: '点击路面种银杏，点击已种树木可拔除' },
    pine: { unit: '棵', label: '松树', hint: '点击路面种松树，点击已种树木可拔除' },
    lamp: { unit: '盏', label: '路灯', hint: '点击路面安装路灯，点击已装路灯可移除' },
    flag: { unit: '面', label: '彩旗', hint: '点击路面插彩旗，点击已插彩旗可拔除' },
  };

  const line = (x, y, end, bottom = y) => ({ x, y, end, bottom, length: Math.hypot(end - x, bottom - y) });
  const polygon = (vertices) => vertices.map(([x, y], i) => line(x, y, ...vertices[(i + 1) % vertices.length]));
  const routes = {
    line: { lanes: [[line(62, 187, 578)]] },
    highway: {
      lanes: [[line(62, 147, 578)], [line(62, 229, 578)]],
      pavement: { start: 88, end: 552, center: 188, radius: 77, divider: 5 },
    },
    circle: { closed: true, circle: { x: 320, y: 183, radius: 121 } },
    rectangle: { closed: true, lanes: [polygon([[109, 89], [531, 89], [531, 281], [109, 281]])] },
    triangle: { closed: true, lanes: [polygon([[320, 65], [452, 65 + 132 * Math.sqrt(3)], [188, 65 + 132 * Math.sqrt(3)]])] },
  };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const lengthOf = (segments) => segments.reduce((sum, segment) => sum + segment.length, 0);
  const interpolate = (segment, t) => ({
    x: segment.x + (segment.end - segment.x) * t,
    y: segment.y + (segment.bottom - segment.y) * t,
  });

  function pointAt(shape, lane, t) {
    const route = routes[shape];
    if (route.circle) {
      const { x, y, radius } = route.circle;
      const angle = t * 2 * Math.PI;
      return { x: x + radius * Math.sin(angle), y: y - radius * Math.cos(angle) };
    }
    const segments = route.lanes[lane];
    let remaining = t * lengthOf(segments);
    for (const segment of segments) {
      if (remaining <= segment.length) return interpolate(segment, remaining / segment.length);
      remaining -= segment.length;
    }
    return interpolate(segments.at(-1), 1);
  }

  function project(shape, point) {
    const route = routes[shape];
    if (route.circle) {
      const { x, y } = route.circle;
      const turn = Math.atan2(point.x - x, y - point.y) / (2 * Math.PI);
      const t = (turn + 1) % 1;
      return distance(point, pointAt(shape, 0, t)) <= 16 ? { lane: 0, t } : null;
    }
    if (route.pavement) {
      const { start, end, center, radius, divider } = route.pavement;
      const edgeX = Math.max(start, Math.min(end, point.x));
      if (Math.abs(point.y - center) < divider ||
          distance(point, { x: edgeX, y: center }) > radius) return null;
      const lane = Number(point.y > center);
      const [segment] = route.lanes[lane];
      return { lane, t: clamp((point.x - segment.x) / segment.length) };
    }
    let nearest = null;
    let limit = 16;
    route.lanes.forEach((segments, lane) => {
      const total = lengthOf(segments);
      let traversed = 0;
      for (const segment of segments) {
        const dot = (point.x - segment.x) * (segment.end - segment.x) +
          (point.y - segment.y) * (segment.bottom - segment.y);
        const fraction = clamp(dot / segment.length ** 2);
        const gap = distance(point, interpolate(segment, fraction));
        if (gap <= limit) {
          limit = gap;
          nearest = { lane, t: (traversed + fraction * segment.length) / total };
        }
        traversed += segment.length;
      }
    });
    if (nearest && route.closed && nearest.t === 1) nearest.t = 0;
    return nearest;
  }

  /** @typedef {{ lane: number, t: number }} Position */
  /** @typedef {{ shape: string, mode: string, skin: string, routeLength?: number, plants: Position[],
   * markers: (Position & { number: number })[], dataHidden: boolean, formulaHidden: boolean }} State */
  /** @returns {State} */
  const initialState = (routeLength = 100) => ({
    shape: 'line', mode: 'both', skin: 'ginkgo', routeLength,
    plants: [], markers: [], dataHidden: false, formulaHidden: false,
  });
  const reset = (state) => ({ ...state, plants: [], markers: [] });
  const setShape = (state, shape) => state.shape === shape ? state : reset({ ...state, shape });
  const setMode = (state, mode) => routes[state.shape].closed ? state : { ...state, mode };
  const setSkin = (state, skin) => ({ ...state, skin });
  const setRouteLength = (state, routeLength) => ({
    ...state,
    routeLength: Math.max(10, Math.min(2000, Math.round(Number(routeLength) || 100))),
  });
  const toggleData = (state) => ({ ...state, dataHidden: !state.dataHidden });
  const toggleFormula = (state) => ({ ...state, formulaHidden: !state.formulaHidden });

  function plant(state, point) {
    const position = project(state.shape, point);
    if (!position) return state;
    const anchor = ({ lane, t }) => pointAt(state.shape, lane, t);
    const snapped = anchor(position);
    if (state.plants.some((item) => distance(anchor(item), snapped) <= 7)) return state;
    return { ...state, plants: [...state.plants, position], markers: [] };
  }

  function removeAt(state, index) {
    if (index < 0 || index >= state.plants.length) return state;
    const plants = state.plants.filter((_, i) => i !== index);
    return { ...state, plants, markers: [] };
  }

  // An empty lane contributes zero. It has no objects to interpret under an endpoint rule.
  const intervals = (count, mode) => count ? count + modes[mode].adjustment : 0;

  function readout(state) {
    const { shape, mode, skin, plants, dataHidden, formulaHidden } = state;
    const routeLength = Number(state.routeLength) > 0 ? Number(state.routeLength) : 100;
    const { unit, hint } = skins[skin];
    const count = plants.length;
    const closed = Boolean(routes[shape].closed);
    const highway = shape === 'highway';
    const upper = plants.filter(({ lane }) => lane === 0).length;
    const laneIntervals = highway
      ? [intervals(upper, mode), intervals(count - upper, mode)]
      : [closed ? count : intervals(count, mode)];
    const totalIntervals = laneIntervals.reduce((sum, value) => sum + value, 0);
    // Asymmetric lane interval counts have no common single-lane average.
    const denominator = highway && laneIntervals[0] !== laneIntervals[1] ? 0 : laneIntervals[0];
    const adjustment = closed ? 0 : modes[mode].adjustment;
    const relation = '间隔数' + (adjustment < 0 ? ' + 1' : adjustment > 0 ? ' - 1' : '');
    const formula = highway
      ? `总${unit}数 = ${adjustment ? `(${relation})` : relation} × 2`
      : `${unit}数 = ${relation}`;
    return {
      count, totalIntervals, laneIntervals, dataHidden, unit, hint, routeLength,
      title: closed ? '封闭路线' : highway ? '公路两侧植树' : modes[mode].title,
      formula: count && !formulaHidden ? formula : null,
      average: denominator > 0 ? (routeLength / denominator).toFixed(1) : null,
    };
  }

  /** @param {State} state @returns {Position[]} */
  function buildingsFor({ shape, mode }) {
    const route = routes[shape];
    return route.closed ? [] : route.lanes.flatMap((_, lane) =>
      modes[mode].buildings.map((t) => ({ lane, t })));
  }

  function uniform(state) {
    const { shape, mode, plants } = state;
    if (!plants.length) return state;
    if (routes[shape].closed) {
      const n = plants.length;
      const segments = routes[shape].lanes?.[0];
      // A multiple of four on the rectangle gives each edge the same number
      // of divisions, so eight objects land on the corners and edge midpoints.
      const fraction = (index) => {
        if (shape !== 'rectangle' || n % 4) return index / n;
        const edge = index * 4 / n;
        const whole = Math.floor(edge);
        const before = segments.slice(0, whole).reduce((sum, part) => sum + part.length, 0);
        return (before + (edge - whole) * segments[whole].length) / lengthOf(segments);
      };
      return {
        ...state,
        plants: Array.from({ length: n }, (_, i) => ({ lane: 0, t: fraction(i) })),
        markers: Array.from({ length: n }, (_, i) => ({ lane: 0, t: fraction(i + 0.5), number: i + 1 })),
      };
    }
    const lanes = routes[shape].lanes;
    const n = Math.ceil(plants.length / lanes.length);
    const k = intervals(n, mode);
    if (!k) {
      if (lanes.length === 1) return state;
      // A single object per side has no interval. Align both sides to the
      // first existing anchor, including when a second object is added.
      return { ...state, plants: lanes.map((_, lane) => ({ lane, t: plants[0].t })), markers: [] };
    }
    return {
      ...state,
      plants: lanes.flatMap((_, lane) =>
        Array.from({ length: n }, (_, i) => ({ lane, t: (i + modes[mode].start) / k }))),
      markers: lanes.flatMap((_, lane) =>
        Array.from({ length: k }, (_, i) => ({ lane, t: (i + 0.5) / k, number: i + 1 }))),
    };
  }

  /**
   * Evaluate whether the current board solves a game mission.
   */
  function evaluateMission(state, mission) {
    if (!mission) return { passed: false, stars: 0, feedback: '请先选择关卡。' };
    const data = readout(state);
    const closed = Boolean(routes[mission.shape]?.closed);
    if (state.shape !== mission.shape) {
      return { passed: false, stars: 0, feedback: '先在下方切换到本关对应的路形哦！' };
    }
    if (!closed && state.mode !== mission.mode) {
      return { passed: false, stars: 0, feedback: '再检查一下「排列模式」（两端都种/都不种/只种一端）。' };
    }
    if (data.count === 0) {
      return { passed: false, stars: 0, feedback: '还没有放置对象，点击路面开始种树吧！' };
    }
    if (data.count < mission.targetCount) {
      return {
        passed: false,
        stars: 1,
        feedback: `目前放了 ${data.count} ${data.unit}，还差 ${mission.targetCount - data.count} ${data.unit}！`,
      };
    }
    if (data.count > mission.targetCount) {
      return {
        passed: false,
        stars: 1,
        feedback: `目前放了 ${data.count} ${data.unit}，多了 ${data.count - mission.targetCount} ${data.unit}（点树木可拔掉）。`,
      };
    }
    if (state.markers.length === 0) {
      return {
        passed: false,
        stars: 2,
        feedback: '数量对了！再点一下「均匀排列」验证每段间距吧。',
      };
    }
    if (
      typeof mission.routeLength === 'number' &&
      mission.routeLength > 0 &&
      Math.abs(data.routeLength - mission.routeLength) > 0.05
    ) {
      return {
        passed: false,
        stars: 1,
        feedback: `当前路线全长是 ${data.routeLength} 米，与本关要求的 ${mission.routeLength} 米不一致。`,
      };
    }
    if (typeof mission.targetGap === 'number' && mission.targetGap > 0) {
      const actualGap = data.average !== null ? Number(data.average) : NaN;
      if (!Number.isFinite(actualGap) || Math.abs(actualGap - mission.targetGap) > 0.1) {
        return {
          passed: false,
          stars: 1,
          feedback: `当前平均间距是 ${data.average ?? '未形成'} 米，本关要求每 ${mission.targetGap} 米放 1 ${data.unit}，再算算间隔数！`,
        };
      }
    }
    return {
      passed: true,
      stars: 3,
      feedback: `闯关成功！共 ${data.count} ${data.unit}、${data.totalIntervals} 个间隔${data.average ? `，平均间距 ${data.average} 米` : ''}！`,
    };
  }

  return {
    routes,
    initialState,
    reset,
    setShape,
    setMode,
    setSkin,
    setRouteLength,
    toggleData,
    toggleFormula,
    pointAt,
    plant,
    removeAt,
    readout,
    buildingsFor,
    uniform,
    evaluateMission,
  };
})();

if (typeof module !== 'undefined') module.exports = plantingModel;
