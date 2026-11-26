// Draws a business process in BPMN notation, as SVG, from the outline the documenter writes in a ```bpmn block:
//
//   process Credit approval
//   lane tier: Approver team for the application's tier
//   lane committee: Lending Credit Committee
//   start ready in tier: Ready for credit decision
//   task decision in tier: Credit decision
//   timer decision -> overdue: Due date passed
//   task overdue in tier: Credit decision overdue
//   xor outcome in tier: Outcome?
//   end approved in tier: Approved
//   ready -> decision
//   decision -> outcome
//   outcome -> approved: Approved
//   outcome -> other default
//
// Elements: start, task (a person's task), service (an automatic step), xor, and, or (gateways), end; "in <lane>"
// puts one in a lane (the first lane by default). "timer <task> -> <next>" is a timer on the task's edge: when it
// fires, the process leaves the task for <next>. "<from> -> <to>" is a sequence flow, "default" marks a gateway's
// default flow, and ": text" labels anything. Lines starting with # are comments.
//
// The layout runs left to right: each element goes one column after the one before it, a timer's next step goes
// under its task, and a gateway's branches fan out around it. It needs nothing but Node.

export class OutlineError extends Error {}

const KINDS = new Set(['start', 'task', 'service', 'xor', 'and', 'or', 'end']);
const FONT = "'Segoe UI', Arial, Helvetica, sans-serif";
const INK = '#1D2433';
const LINE = '#4A5568';

// ---------------------------------------------------------------------------------------------------------------
// The outline.

export function parseOutline(text) {
  const model = { title: '', lanes: [], nodes: [], flows: [], timers: [] };
  const ids = new Map();
  const refs = [];
  const fail = (k, message) => { throw new OutlineError(`BPMN outline, line ${k + 1}: ${message}`); };

  String(text).replace(/\r\n?/g, '\n').split('\n').forEach((raw, k) => {
    const line = raw.trim();
    let m;
    if (!line || line.startsWith('#')) return;

    if ((m = /^process\s+(.+)$/i.exec(line))) {
      model.title = m[1].trim();
    } else if ((m = /^lane\s+([\w-]+)\s*:\s*(.+)$/i.exec(line))) {
      if (model.lanes.some(l => l.id === m[1])) fail(k, `the lane "${m[1]}" is declared twice.`);
      model.lanes.push({ id: m[1], label: m[2].trim() });
    } else if ((m = /^(\w+)\s+([\w-]+)(?:\s+in\s+([\w-]+))?\s*(?::\s*(.*))?$/i.exec(line)) && KINDS.has(m[1].toLowerCase())) {
      if (ids.has(m[2])) fail(k, `"${m[2]}" is declared twice.`);
      const node = { id: m[2], kind: m[1].toLowerCase(), lane: m[3] || null, label: (m[4] || '').trim(), order: model.nodes.length, line: k };
      ids.set(node.id, node);
      model.nodes.push(node);
    } else if ((m = /^timer\s+([\w-]+)\s*->\s*([\w-]+)\s*(?::\s*(.*))?$/i.exec(line))) {
      model.timers.push({ from: m[1], to: m[2], label: (m[3] || '').trim(), line: k });
      refs.push([k, m[1], m[2]]);
    } else if ((m = /^([\w-]+)\s*->\s*([\w-]+)(\s+default)?\s*(?::\s*(.*))?$/i.exec(line))) {
      model.flows.push({ from: m[1], to: m[2], isDefault: !!m[3], label: (m[4] || '').trim(), order: model.flows.length, line: k });
      refs.push([k, m[1], m[2]]);
    } else {
      fail(k, `can't read "${line}".`);
    }
  });

  for (const [k, from, to] of refs) {
    if (!ids.has(from)) fail(k, `"${from}" isn't declared.`);
    if (!ids.has(to)) fail(k, `"${to}" isn't declared.`);
  }
  for (const t of model.timers) {
    if (!['task', 'service'].includes(ids.get(t.from).kind)) fail(t.line, `a timer goes on a task, and "${t.from}" isn't one.`);
  }
  for (const n of model.nodes) {
    if (n.lane && !model.lanes.some(l => l.id === n.lane)) fail(n.line, `the lane "${n.lane}" isn't declared.`);
    n.lane = n.lane || (model.lanes[0] ? model.lanes[0].id : '');
  }
  if (!model.nodes.length) throw new OutlineError('BPMN outline: it has no elements.');
  return model;
}

// ---------------------------------------------------------------------------------------------------------------
// Text: widths are estimated from the font's proportions (Segoe UI), close enough to wrap labels.

function textWidth(s, size) {
  let w = 0;
  for (const ch of String(s)) {
    if (" il.,:;|!'()[]-tfjr".includes(ch)) w += 0.3;
    else if ('mwMW@%'.includes(ch)) w += 0.86;
    else if (/[A-Z0-9?&]/.test(ch)) w += 0.62;
    else w += 0.53;
  }
  return w * size;
}

function wrap(text, size, width) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const widest = (lines, size) => Math.max(0, ...lines.map(l => textWidth(l, size)));

// ---------------------------------------------------------------------------------------------------------------
// Layout.

const TASK_W = 130;
const EVENT = 36;
const GATEWAY = 50;
const TEXT = 12.5; // task text
const SMALL = 11.5; // labels
const LINE_H = 15;
const SMALL_H = 14;
const POOL_HEADER = 30;
const LANE_HEADER = 30;
const PAD = 28;
const ROW_GAP = 18;
const GAP = 46;

function measure(n) {
  if (n.kind === 'task' || n.kind === 'service') {
    n.lines = wrap(n.label, TEXT, TASK_W - 20);
    n.w = TASK_W;
    n.h = Math.max(60, n.lines.length * LINE_H + 34);
  } else if (n.kind === 'start' || n.kind === 'end') {
    n.w = n.h = EVENT;
    n.lines = wrap(n.label, SMALL, n.kind === 'end' ? 150 : 96);
  } else {
    n.w = n.h = GATEWAY;
    n.lines = wrap(n.label, SMALL, 110);
  }
  n.above = 0;
  n.below = n.kind === 'start' && n.lines.length ? n.lines.length * SMALL_H + 6 : 0;
  n.spill = n.kind === 'end' && n.lines.length ? 8 + widest(n.lines, SMALL) : 0;
}

export function layout(model) {
  const nodes = model.nodes.map(n => ({ ...n }));
  nodes.forEach(measure);
  const byId = new Map(nodes.map(n => [n.id, n]));
  const edges = [
    ...model.flows.map(f => ({ ...f, kind: 'flow' })),
    ...model.timers.map((t, k) => ({ ...t, kind: 'timer', order: model.flows.length + k })),
  ].map(e => ({ ...e, source: byId.get(e.from), target: byId.get(e.to) }));
  const lanes = model.lanes.length ? model.lanes.map(l => ({ ...l })) : [{ id: '', label: '' }];

  // Back edges (loops) are the ones that return to a step already on the way from the start.
  const state = new Map();
  const visit = n => {
    state.set(n, 1);
    for (const e of edges.filter(x => x.source === n).sort((a, b) => a.order - b.order)) {
      if (state.get(e.target) === 1) e.back = true;
      else if (!state.has(e.target)) visit(e.target);
    }
    state.set(n, 2);
  };
  nodes.filter(n => !edges.some(e => e.target === n)).forEach(n => state.has(n) || visit(n));
  nodes.forEach(n => state.has(n) || visit(n));
  const forward = edges.filter(e => !e.back);

  // Columns: the longest way from a start; a timer's next step stays in its task's column.
  nodes.forEach(n => { n.rank = 0; });
  for (let pass = 0; pass < nodes.length + 1; pass++) {
    let moved = false;
    for (const e of forward) {
      const rank = e.source.rank + (e.kind === 'timer' ? 0 : 1);
      if (rank > e.target.rank) { e.target.rank = rank; moved = true; }
    }
    if (!moved) break;
  }

  // Rows within each lane: in line with what comes before; a gateway's branches fan out around it; a timer's next
  // step below its task. A flow that skips columns keeps its row free through them.
  const taken = new Set();
  const cell = (lane, rank, row) => `${lane}|${rank}|${row}`;
  const timerOf = n => forward.find(e => e.kind === 'timer' && e.target === n && e.source.rank === n.rank);
  const ranks = Math.max(...nodes.map(n => n.rank));
  for (let r = 0; r <= ranks; r++) {
    const here = nodes.filter(n => n.rank === r).sort((a, b) => (!!timerOf(a) - !!timerOf(b)) || a.order - b.order);
    for (const n of here) {
      const timer = timerOf(n);
      let want = 0;
      let down = false;
      if (timer) {
        want = timer.source.lane === n.lane ? timer.source.row + 1 : 0;
        down = true;
      } else {
        const from = forward.filter(e => e.target === n && e.source.lane === n.lane && e.source.row !== undefined)
          .sort((a, b) => a.order - b.order)[0];
        if (from) {
          const siblings = forward.filter(e => e.source === from.source && e.kind === 'flow' && e.target.rank === r && e.target.lane === n.lane)
            .sort((a, b) => a.order - b.order).map(e => e.target);
          const k = siblings.indexOf(n);
          want = from.source.row + (siblings.length > 1 && /^(xor|and|or)$/.test(from.source.kind) ? k - Math.floor((siblings.length - 1) / 2) : 0);
        }
      }
      let row = want;
      for (let step = 1; taken.has(cell(n.lane, r, row)); step++) {
        row = down ? want + step : want + (step % 2 ? Math.ceil(step / 2) : -step / 2);
      }
      n.row = row;
      taken.add(cell(n.lane, r, row));
      for (const e of forward.filter(x => x.source === n && x.kind === 'flow')) {
        for (let k = r + 1; k < e.target.rank; k++) taken.add(cell(n.lane, k, row));
      }
    }
  }

  // Heights: each lane's rows, top to bottom.
  const hasTimer = n => edges.some(e => e.kind === 'timer' && e.source === n);
  const timerLines = n => Math.max(1, ...edges.filter(e => e.kind === 'timer' && e.source === n).map(e => wrap(e.label, SMALL, n.w - 44).length));
  let y = 0;
  for (const lane of lanes) {
    const mine = nodes.filter(n => n.lane === lane.id);
    const rows = [...new Set(mine.map(n => n.row))].sort((a, b) => a - b);
    lane.labelLines = wrap(lane.label, 12, 400);
    let top = y + PAD;
    for (const row of rows) {
      const inRow = mine.filter(n => n.row === row);
      const center = Math.max(...inRow.map(n => n.above + n.h / 2), 0);
      const below = Math.max(...inRow.map(n => n.h / 2 + n.below + (hasTimer(n) ? 14 + timerLines(n) * SMALL_H : 0)), 0);
      inRow.forEach(n => { n.cy = top + center; });
      top += center + below + ROW_GAP;
    }
    lane.y = y;
    lane.h = Math.max(top - ROW_GAP + PAD - y, textWidth(lane.label, 12) + 24, 90);
    // Center the rows when the lane label made the lane taller.
    const used = top - ROW_GAP + PAD - y;
    if (lane.h > used) mine.forEach(n => { n.cy += (lane.h - used) / 2; });
    y += lane.h;
  }
  const height = y;

  // Widths: columns as wide as their widest element, and gaps wide enough for the labels that sit in them.
  const left = (model.title ? POOL_HEADER : 0) + (model.lanes.length ? LANE_HEADER : 0) + PAD;
  const columns = Array.from({ length: ranks + 1 }, (_, r) => Math.max(...nodes.filter(n => n.rank === r).map(n => n.w)));
  const gaps = columns.map(() => GAP);
  let routes = [];
  for (let pass = 0; pass < 4; pass++) {
    const x = [left];
    columns.forEach((w, r) => { x[r + 1] = x[r] + w + gaps[r]; });
    nodes.forEach(n => { n.cx = x[n.rank] + (n.kind === 'end' ? n.w / 2 : columns[n.rank] / 2); });
    routes = route(edges, nodes, x, gaps, lanes);

    const need = gaps.slice();
    const grow = (r, w) => { if (r >= 0 && r < gaps.length) need[r] = Math.max(need[r], w); };
    for (const n of nodes) {
      // An end's name, beside it, mustn't run into the next column's elements in the same lane.
      if (n.spill && nodes.some(o => o.rank === n.rank + 1 && o.lane === n.lane && Math.abs(o.cy - n.cy) < 60)) {
        grow(n.rank, n.w + n.spill - columns[n.rank] + 24);
      }
      // A gateway's name sits to the left of it, above the flow coming in.
      if (/^(xor|and|or)$/.test(n.kind) && n.lines.length) grow(n.rank - 1, widest(n.lines, SMALL) + 28 - (columns[n.rank] - n.w) / 2);
    }
    for (const r of routes) {
      if (!r.label.length) continue;
      const room = r.labelRoom;
      const want = widest(r.label, SMALL) + 16;
      if (room < want) grow(r.edge.target.rank - 1, gaps[r.edge.target.rank - 1] + want - room);
    }
    if (need.every((w, r) => w <= gaps[r])) break;
    need.forEach((w, r) => { gaps[r] = Math.max(gaps[r], Math.ceil(w)); });
  }

  const lastX = Math.max(...nodes.map(n => n.cx + n.w / 2 + n.spill), ...routes.flatMap(r => r.points.map(p => p[0])));
  const width = Math.ceil(lastX + PAD);
  return { title: model.title, lanes: model.lanes.length ? lanes : [], nodes, routes, width, height: Math.ceil(height) };
}

// Sequence flows as right-angled lines. From a gateway they leave by the corner facing their target; into a step
// they arrive from the left, turning in the gap before its column (one lane of the gap per target).
function route(edges, nodes, x, gaps, lanes) {
  const slots = new Map();
  const slot = (rank, target) => {
    const key = rank;
    if (!slots.has(key)) slots.set(key, []);
    const list = slots.get(key);
    if (!list.includes(target)) list.push(target);
    list.sort((a, b) => a.cy - b.cy);
    return () => {
      const k = list.indexOf(target);
      return (k - (list.length - 1) / 2) * 10;
    };
  };
  const pending = [];
  const isGateway = n => /^(xor|and|or)$/.test(n.kind);
  const leftOf = n => isGateway(n) ? n.cx - n.w / 2 : n.cx - n.w / 2;
  const laneOf = id => lanes.find(l => l.id === id);

  for (const e of edges) {
    const s = e.source;
    const t = e.target;
    const label = e.label ? wrap(e.label, SMALL, e.kind === 'timer' ? s.w - 44 : 130) : [];
    if (e.kind === 'timer') {
      const tx = s.cx + s.w / 2 - 26;
      const ty = s.cy + s.h / 2;
      if (t.rank === s.rank && t.cy > s.cy) {
        pending.push({ edge: e, label, points: [[tx, ty + 13], [tx, t.cy - t.h / 2]], timer: [tx, ty], labelAt: [tx - 17, ty + 16], labelRight: true, labelRoom: Infinity });
      } else {
        pending.push({ edge: e, label, points: [[tx, ty + 13], [tx, t.cy], [leftOf(t), t.cy]], timer: [tx, ty], labelAt: [tx - 17, ty + 16], labelRight: true, labelRoom: Infinity });
      }
      continue;
    }
    if (e.back || t.rank <= s.rank) {
      // Back to an earlier step: out to the right, under the lane, and up into it from below.
      const lane = laneOf(s.lane) || { y: 0, h: 0 };
      const below = lane.y + lane.h - 10;
      const out = s.cx + s.w / 2 + 14;
      pending.push({ edge: e, label, points: [[s.cx + s.w / 2, s.cy], [out, s.cy], [out, below], [t.cx, below], [t.cx, t.cy + t.h / 2]], labelAt: [t.cx + 8, below - 5], labelRoom: Infinity });
      continue;
    }
    const end = [leftOf(t), t.cy];
    if (isGateway(s) && Math.abs(t.cy - s.cy) > 1) {
      const up = t.cy < s.cy;
      const startY = s.cy + (up ? -s.h / 2 : s.h / 2);
      pending.push({ edge: e, label, points: [[s.cx, startY], [s.cx, t.cy], end], labelAt: [s.cx + 8, t.cy - 6], labelRoom: end[0] - s.cx });
      continue;
    }
    const startX = s.cx + s.w / 2;
    if (Math.abs(t.cy - s.cy) < 1) {
      pending.push({ edge: e, label, points: [[startX, s.cy], end], labelAt: [startX + 8, s.cy - 6], labelRoom: end[0] - startX });
      continue;
    }
    const offset = slot(t.rank - 1, t);
    pending.push({ edge: e, label, points: null, make: () => {
      const elbow = x[t.rank] - gaps[t.rank - 1] / 2 + offset();
      return [[startX, s.cy], [elbow, s.cy], [elbow, t.cy], end];
    }, labelRoom: 0 });
  }
  for (const p of pending) {
    if (p.make) {
      p.points = p.make();
      p.labelAt = [p.points[2][0] + 8, p.points[2][1] - 6];
      p.labelRoom = p.points[3][0] - p.points[2][0];
    }
  }
  return pending;
}

// ---------------------------------------------------------------------------------------------------------------
// SVG.

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = v => Math.round(v * 10) / 10;

function text(lines, x, y, { size = SMALL, anchor = 'start', weight = 'normal', fill = INK, lineH = SMALL_H } = {}) {
  return lines.map((l, k) => `<text x="${r1(x)}" y="${r1(y + k * lineH)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(l)}</text>`).join('');
}

function arrow(points) {
  const [a, b] = points.slice(-2);
  const dx = Math.sign(b[0] - a[0]);
  const dy = Math.sign(b[1] - a[1]);
  const [x, y] = b;
  const back = [x - dx * 9, y - dy * 9];
  const side = [dy * 4.5, dx * 4.5];
  return `<path d="M${r1(x)} ${r1(y)} L${r1(back[0] + side[0])} ${r1(back[1] + side[1])} L${r1(back[0] - side[0])} ${r1(back[1] - side[1])} Z" fill="${LINE}"/>`;
}

function shape(n) {
  const x = n.cx - n.w / 2;
  const y = n.cy - n.h / 2;
  switch (n.kind) {
    case 'task':
    case 'service': {
      const icon = n.kind === 'task'
        ? `<circle cx="${r1(x + 14)}" cy="${r1(y + 11)}" r="3.4" fill="#FFFFFF" stroke="#3B5B92" stroke-width="1.2"/><path d="M${r1(x + 8)} ${r1(y + 22)} Q${r1(x + 8)} ${r1(y + 15.5)} ${r1(x + 14)} ${r1(y + 15.5)} Q${r1(x + 20)} ${r1(y + 15.5)} ${r1(x + 20)} ${r1(y + 22)} Z" fill="#FFFFFF" stroke="#3B5B92" stroke-width="1.2"/>`
        : `<circle cx="${r1(x + 14)}" cy="${r1(y + 14)}" r="6" fill="#FFFFFF" stroke="#3B5B92" stroke-width="2.4" stroke-dasharray="2.4 1.6"/><circle cx="${r1(x + 14)}" cy="${r1(y + 14)}" r="2.2" fill="#FFFFFF" stroke="#3B5B92" stroke-width="1.2"/>`;
      const top = n.cy - ((n.lines.length - 1) * LINE_H) / 2 + 9;
      return `<rect x="${r1(x)}" y="${r1(y)}" width="${n.w}" height="${r1(n.h)}" rx="9" ry="9" fill="#F3F6FB" stroke="#3B5B92" stroke-width="1.5"/>${icon}`
        + text(n.lines, n.cx, top, { size: TEXT, anchor: 'middle', lineH: LINE_H });
    }
    case 'start':
      return `<circle cx="${r1(n.cx)}" cy="${r1(n.cy)}" r="${EVENT / 2}" fill="#EAF6EC" stroke="#2E7D32" stroke-width="2"/>`
        + text(n.lines, n.cx, n.cy + EVENT / 2 + 15, { anchor: 'middle' });
    case 'end':
      return `<circle cx="${r1(n.cx)}" cy="${r1(n.cy)}" r="${EVENT / 2 - 1.5}" fill="#FBEAEA" stroke="#B3261E" stroke-width="3.5"/>`
        + text(n.lines, n.cx + EVENT / 2 + 7, n.cy + 4 - ((n.lines.length - 1) * SMALL_H) / 2);
    default: {
      const h = n.w / 2;
      let marker = '';
      if (n.kind === 'xor') marker = `<path d="M${r1(n.cx - 8)} ${r1(n.cy - 8)} L${r1(n.cx + 8)} ${r1(n.cy + 8)} M${r1(n.cx + 8)} ${r1(n.cy - 8)} L${r1(n.cx - 8)} ${r1(n.cy + 8)}" stroke="#9A5B00" stroke-width="3.2" stroke-linecap="round"/>`;
      if (n.kind === 'and') marker = `<path d="M${r1(n.cx)} ${r1(n.cy - 11)} L${r1(n.cx)} ${r1(n.cy + 11)} M${r1(n.cx - 11)} ${r1(n.cy)} L${r1(n.cx + 11)} ${r1(n.cy)}" stroke="#9A5B00" stroke-width="3.2" stroke-linecap="round"/>`;
      if (n.kind === 'or') marker = `<circle cx="${r1(n.cx)}" cy="${r1(n.cy)}" r="10" fill="none" stroke="#9A5B00" stroke-width="2.6"/>`;
      const label = n.lines.length
        ? text(n.lines, n.cx - h - 8, n.cy - 9 - (n.lines.length - 1) * SMALL_H, { anchor: 'end' })
        : '';
      return `<path d="M${r1(n.cx)} ${r1(n.cy - h)} L${r1(n.cx + h)} ${r1(n.cy)} L${r1(n.cx)} ${r1(n.cy + h)} L${r1(n.cx - h)} ${r1(n.cy)} Z" fill="#FFF6E0" stroke="#9A5B00" stroke-width="1.5"/>${marker}${label}`;
    }
  }
}

function timerShape([x, y]) {
  const hands = `<path d="M${r1(x)} ${r1(y - 5.5)} L${r1(x)} ${r1(y)} L${r1(x + 4)} ${r1(y + 2)}" fill="none" stroke="#5B6474" stroke-width="1.3" stroke-linecap="round"/>`;
  return `<circle cx="${r1(x)}" cy="${r1(y)}" r="13" fill="#FFFFFF" stroke="#5B6474" stroke-width="1.3"/><circle cx="${r1(x)}" cy="${r1(y)}" r="10" fill="#FFFFFF" stroke="#5B6474" stroke-width="1"/><circle cx="${r1(x)}" cy="${r1(y)}" r="7.5" fill="#FFFFFF" stroke="#5B6474" stroke-width="1"/>${hands}`;
}

export function toSvg(drawing) {
  const { title, lanes, nodes, routes, width, height } = drawing;
  const parts = [];
  const header = title ? POOL_HEADER : 0;

  parts.push(`<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="#FFFFFF" stroke="#8C98AE" stroke-width="1"/>`);
  if (title) {
    parts.push(`<rect x="0.5" y="0.5" width="${POOL_HEADER}" height="${height - 1}" fill="#E8EDF5" stroke="#8C98AE" stroke-width="1"/>`);
    parts.push(`<text x="0" y="0" transform="translate(${r1(POOL_HEADER / 2 + 4.5)} ${r1(height / 2)}) rotate(-90)" font-size="12.5" font-weight="bold" fill="#1F3864" text-anchor="middle">${esc(title)}</text>`);
  }
  for (const [k, lane] of lanes.entries()) {
    if (k) parts.push(`<path d="M${header} ${r1(lane.y)} L${width - 0.5} ${r1(lane.y)}" stroke="#8C98AE" stroke-width="1"/>`);
    parts.push(`<rect x="${header + 0.5}" y="${r1(lane.y + 0.5)}" width="${LANE_HEADER}" height="${r1(lane.h - 1)}" fill="#F1F4F9" stroke="#8C98AE" stroke-width="1"/>`);
    parts.push(`<text x="0" y="0" transform="translate(${r1(header + LANE_HEADER / 2 + 4.5)} ${r1(lane.y + lane.h / 2)}) rotate(-90)" font-size="12" fill="#1F3864" text-anchor="middle">${esc(lane.label)}</text>`);
  }

  for (const r of routes) {
    const d = r.points.map((p, k) => `${k ? 'L' : 'M'}${r1(p[0])} ${r1(p[1])}`).join(' ');
    parts.push(`<path d="${d}" fill="none" stroke="${LINE}" stroke-width="1.4" stroke-linejoin="round"/>`);
    parts.push(arrow(r.points));
    if (r.edge.isDefault) {
      const [a, b] = r.points;
      const dx = Math.sign(b[0] - a[0]);
      const dy = Math.sign(b[1] - a[1]);
      const cx = a[0] + dx * 10;
      const cy = a[1] + dy * 10;
      parts.push(`<path d="M${r1(cx - 4 - dy * 2)} ${r1(cy + 4 + dx * 2)} L${r1(cx + 4 + dy * 2)} ${r1(cy - 4 - dx * 2)}" stroke="${LINE}" stroke-width="1.4"/>`);
    }
  }
  for (const n of nodes) parts.push(shape(n));
  for (const r of routes) {
    if (r.timer) parts.push(timerShape(r.timer));
    if (r.label.length) {
      const [x, y] = r.labelAt;
      const lines = r.label;
      const top = y - (lines.length - 1) * SMALL_H;
      const w = widest(lines, SMALL);
      if (r.labelRight) {
        parts.push(text(lines, x, top + (lines.length - 1) * SMALL_H, { fill: '#33415C', anchor: 'end' }));
        continue;
      }
      parts.push(`<rect x="${r1(x - 2)}" y="${r1(top - 11)}" width="${r1(w + 4)}" height="${r1(lines.length * SMALL_H + 1)}" fill="#FFFFFF" fill-opacity="0.85"/>`);
      parts.push(text(lines, x, top, { fill: '#33415C' }));
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${esc(FONT)}">${parts.join('')}</svg>`;
}

// ---------------------------------------------------------------------------------------------------------------
// BPMN 2.0 XML, with the same layout (diagram interchange), for BPMN tools such as Camunda Modeler or bpmn.io.

const TAGS = { start: 'startEvent', task: 'userTask', service: 'serviceTask', xor: 'exclusiveGateway', and: 'parallelGateway', or: 'inclusiveGateway', end: 'endEvent' };

export function toBpmnXml(drawing) {
  const { title, lanes, nodes, routes, width, height } = drawing;
  const x = s => esc(s).replace(/\s+/g, ' ');
  const id = n => `Node_${n.id.replace(/[^\w.-]/g, '_')}`;
  const flowId = r => r.edge.kind === 'timer' ? `TimerFlow_${r.timerIndex + 1}` : `Flow_${r.edge.order + 1}`;
  const timers = routes.filter(r => r.edge.kind === 'timer');
  timers.forEach((r, k) => { r.timerIndex = k; });
  const sourceId = r => r.edge.kind === 'timer' ? `Timer_${r.timerIndex + 1}` : id(r.edge.source);
  const name = s => s ? ` name="${x(s)}"` : '';
  const flows = (n, dir) => routes.filter(r => (dir === 'in' ? r.edge.target : r.edge.kind === 'timer' ? null : r.edge.source) === n)
    .map(r => `<bpmn:${dir === 'in' ? 'incoming' : 'outgoing'}>${flowId(r)}</bpmn:${dir === 'in' ? 'incoming' : 'outgoing'}>`).join('');

  const elements = nodes.map(n => {
    const fallback = routes.find(r => r.edge.source === n && r.edge.isDefault && r.edge.kind === 'flow');
    const extra = fallback && /^(xor|or)$/.test(n.kind) ? ` default="${flowId(fallback)}"` : '';
    return `<bpmn:${TAGS[n.kind]} id="${id(n)}"${name(n.label)}${extra}>${flows(n, 'in')}${flows(n, 'out')}</bpmn:${TAGS[n.kind]}>`;
  });
  const boundaries = timers.map(r => `<bpmn:boundaryEvent id="Timer_${r.timerIndex + 1}"${name(r.edge.label)} attachedToRef="${id(r.edge.source)}" cancelActivity="true"><bpmn:outgoing>${flowId(r)}</bpmn:outgoing><bpmn:timerEventDefinition id="Timer_${r.timerIndex + 1}_definition"/></bpmn:boundaryEvent>`);
  const sequence = routes.map(r => `<bpmn:sequenceFlow id="${flowId(r)}"${r.edge.kind === 'flow' ? name(r.edge.label) : ''} sourceRef="${sourceId(r)}" targetRef="${id(r.edge.target)}"/>`);
  const laneSet = lanes.length
    ? `<bpmn:laneSet id="LaneSet_1">${lanes.map((l, k) => `<bpmn:lane id="Lane_${k + 1}"${name(l.label)}>${nodes.filter(n => n.lane === l.id).map(n => `<bpmn:flowNodeRef>${id(n)}</bpmn:flowNodeRef>`).join('')}${timers.filter(r => r.edge.source.lane === l.id).map(r => `<bpmn:flowNodeRef>Timer_${r.timerIndex + 1}</bpmn:flowNodeRef>`).join('')}</bpmn:lane>`).join('')}</bpmn:laneSet>`
    : '';

  const bounds = (bx, by, bw, bh) => `<dc:Bounds x="${Math.round(bx)}" y="${Math.round(by)}" width="${Math.round(bw)}" height="${Math.round(bh)}"/>`;
  const header = title ? POOL_HEADER : 0;
  const shapes = [
    `<bpmndi:BPMNShape id="Participant_1_di" bpmnElement="Participant_1" isHorizontal="true">${bounds(0, 0, width, height)}</bpmndi:BPMNShape>`,
    ...lanes.map((l, k) => `<bpmndi:BPMNShape id="Lane_${k + 1}_di" bpmnElement="Lane_${k + 1}" isHorizontal="true">${bounds(header, l.y, width - header, l.h)}</bpmndi:BPMNShape>`),
    ...nodes.map(n => `<bpmndi:BPMNShape id="${id(n)}_di" bpmnElement="${id(n)}"${/^(xor|and|or)$/.test(n.kind) ? ' isMarkerVisible="true"' : ''}>${bounds(n.cx - n.w / 2, n.cy - n.h / 2, n.w, n.h)}</bpmndi:BPMNShape>`),
    ...timers.map(r => `<bpmndi:BPMNShape id="Timer_${r.timerIndex + 1}_di" bpmnElement="Timer_${r.timerIndex + 1}">${bounds(r.timer[0] - 18, r.timer[1] - 18, 36, 36)}</bpmndi:BPMNShape>`),
  ];
  const edges = routes.map(r => `<bpmndi:BPMNEdge id="${flowId(r)}_di" bpmnElement="${flowId(r)}">${r.points.map(p => `<di:waypoint x="${Math.round(p[0])}" y="${Math.round(p[1])}"/>`).join('')}</bpmndi:BPMNEdge>`);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_1" targetNamespace="urn:logic-fabric:document" exporter="Logic Fabric document" exporterVersion="1">',
    `<bpmn:collaboration id="Collaboration_1"><bpmn:participant id="Participant_1"${name(title || 'Process')} processRef="Process_1"/></bpmn:collaboration>`,
    `<bpmn:process id="Process_1"${name(title)} isExecutable="false">${laneSet}${elements.join('')}${boundaries.join('')}${sequence.join('')}</bpmn:process>`,
    `<bpmndi:BPMNDiagram id="Diagram_1"><bpmndi:BPMNPlane id="Plane_1" bpmnElement="Collaboration_1">${shapes.join('')}${edges.join('')}</bpmndi:BPMNPlane></bpmndi:BPMNDiagram>`,
    '</bpmn:definitions>',
    '',
  ].join(String.fromCharCode(10));
}

// The outline drawn: { svg, bpmn, width, height, title }.
export function drawProcess(outline) {
  const drawing = layout(parseOutline(outline));
  return { svg: toSvg(drawing), bpmn: toBpmnXml(drawing), width: drawing.width, height: drawing.height, title: drawing.title };
}
