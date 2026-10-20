/* SPDX-License-Identifier: Apache-2.0 */
/**
 * furniture.js — built-in furniture as boards (KHADRAW F): a free-form element of class furniture (freeform-model.js) whose
 * groups and components are boxes is read as the panels a joinery shop cuts — each with its size, thickness, material, role,
 * edge banding and the holes System 32 puts in it — and listed as a cut list. No DOM: tests/furniture-test.mjs runs it.
 * Millimetres throughout; the cabinet's own frame (the element's: x along its width, y back from its front, z up).
 *
 *   panelsOf(json, { frontY = 'min' }) → { panels: [panel], loose: n (faces not in a box: not cut) }
 *     panel = { id, name, material, color, L, W, T (mm: length ≥ width ≥ thickness), axes { l, w, t } (unit vectors in the
 *       cabinet), origin (its min corner, mm), box: { min, max } (mm, cabinet), role: 'side' | 'horizontal' | 'back' |
 *       'front', banding: { l1, l2, w1, w2 } (which edges get a strip: l = the long edges, w = the short; 1 = front / bottom) }
 *     roles: the board's thickness along x → a side; along z → top, bottom or shelf; along y → a back (≤ 8 mm thick, or at the
 *     back) or a front (a door or drawer front: at the front)
 *   drill(panels, rules) → holes per panel id: [{ x, y (mm, on the panel's face: x along L, y along W from its min corner),
 *       d, depth, face: 'top' | 'edge-…', kind: 'shelf-pin' | 'hinge' | 'connector' | 'cam' | 'dowel' }]
 *     rules (DRILL_RULES): System 32 — shelf pins Ø5 × 12 every 32 mm, 37 mm in from the front and back edges, from 96 mm
 *     above the bottom to 96 mm below the top; hinge cups Ø35 × 13, 22.5 mm from the hinge edge, 100 mm from each end (three
 *     on a door over 1200 mm); where a horizontal board meets a side: Ø8 through the side 37 mm from front and back, on the
 *     horizontal board a Ø15 × 12.5 cam 34 mm in from its end and a Ø8 × 30 bore into its end (edge)
 *   cutList(panels) → [{ name, qty, L, W, T, material, banding, grain, ids }]   identical boards together
 *   THICKNESSES (the sheets one buys: 3 … 25 mm) · thicknessOk(T)
 */
import { Model, faceTris } from './mc/model.js';

export const THICKNESSES = [3, 4, 6, 9, 12, 15, 16, 18, 19, 20, 25];
export const thicknessOk = (T) => THICKNESSES.some((x) => Math.abs(x - T) < 0.6);
export const DRILL_RULES = Object.freeze({
  pitch: 32, pinInset: 37, pinD: 5, pinDepth: 12, pinEnd: 96,
  cupD: 35, cupDepth: 13, cupEdge: 22.5, cupEnd: 100,
  connInset: 37, connD: 8, camD: 15, camDepth: 12.5, camInset: 34, boreD: 8, boreDepth: 30,
});
const MATERIAL_OF = [['#f4f4f1', 'Melamine white'], ['#c9c9c5', 'Melamine light grey'], ['#8a8a86', 'Melamine grey'], ['#3b3b3b', 'Melamine black']];
const apply = (M, p) => [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]];
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const r1 = (v) => Math.round(v * 10) / 10;

/** A definition that is one box: 6 flat faces of 4 corners on 8 corners, its edges at right angles. → { o, e: [3 vectors] } | null */
function boxOf(def, M) {
  if (def.faces.size !== 6 || def.verts.size !== 8 || def.insts.size) return null;
  for (const f of def.faces.values()) if (f.loops.length !== 1 || f.loops[0].length !== 4) return null;
  const P = [...def.verts.values()].map((p) => apply(M, p).map((v) => v * 1000));
  // a corner and its three neighbours along edges
  const o = P[0], nb = [];
  for (const e of def.edges.values()) {
    const a = def.verts.get(e.a), b = def.verts.get(e.b), pa = apply(M, a).map((v) => v * 1000), pb = apply(M, b).map((v) => v * 1000);
    if (len(sub(pa, o)) < 1e-6) nb.push(sub(pb, o)); else if (len(sub(pb, o)) < 1e-6) nb.push(sub(pa, o));
  }
  if (nb.length !== 3) return null;
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (Math.abs(dot(nb[i], nb[j])) > 1e-3 * len(nb[i]) * len(nb[j])) return null;
  return { o, e: nb, P };
}

export function panelsOf(json, { frontY = 'min' } = {}) {
  const m = new Model();
  m.load(typeof json === 'string' ? JSON.parse(json) : json);
  const raw = [];
  let loose = 0, n = 0;
  const walk = (def, M, color, name) => {
    if (def !== m.root) {
      const b = boxOf(def, M);
      if (b) {
        const faceColor = [...def.faces.values()].map((f) => f.color).find(Boolean);
        raw.push({ b, name: def.name || name, color: (faceColor || color || '').toLowerCase() });
        return;
      }
    }
    for (const f of def.faces.values()) if (!f.hidden && faceTris(def, f).length) loose++;
    for (const i of def.insts.values()) { const d = m.defs.get(i.def); if (d) walk(d, mul(M, i.m), i.color || color, i.name || d.name); }
  };
  walk(m.root, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], null, '');
  // the cabinet's extent (for front / back)
  const all = raw.flatMap((r) => r.b.P);
  const ext = { min: [0, 1, 2].map((k) => Math.min(...all.map((p) => p[k]))), max: [0, 1, 2].map((k) => Math.max(...all.map((p) => p[k]))) };
  const panels = raw.map((r) => {
    const dims = r.b.e.map((v) => ({ v, l: len(v) })).sort((a, b) => b.l - a.l);
    const [lv, wv, tv] = dims.map((d) => d.v.map((x) => x / d.l));
    const box = { min: [0, 1, 2].map((k) => Math.min(...r.b.P.map((p) => p[k]))), max: [0, 1, 2].map((k) => Math.max(...r.b.P.map((p) => p[k]))) };
    const T = r1(dims[2].l), L = r1(dims[0].l), W = r1(dims[1].l);
    const ax = [Math.abs(tv[0]), Math.abs(tv[1]), Math.abs(tv[2])], along = ax.indexOf(Math.max(...ax));
    const atFront = frontY === 'min' ? box.min[1] - ext.min[1] < 25 : ext.max[1] - box.max[1] < 25;
    const role = along === 0 ? 'side' : along === 2 ? 'horizontal' : (T <= 8 || !atFront ? 'back' : 'front');
    // edge banding: what shows — a side's and a horizontal board's front edge, a front's four edges, a back none
    const frontIsLong = role === 'side' ? Math.abs(lv[2]) > 0.9 : Math.abs(lv[0]) > 0.9;   // which pair of edges lies at the front
    const banding = role === 'front' ? { l1: true, l2: true, w1: true, w2: true } : role === 'back' ? { l1: false, l2: false, w1: false, w2: false }
      : frontIsLong ? { l1: true, l2: false, w1: false, w2: false } : { l1: false, l2: false, w1: true, w2: false };
    const material = (r.name.match(/(melamine|mfc|mdf|plywood|ply|hmr|particle|ไม้อัด|เมลามีน)[^,;]*/i) || [])[0]
      || (MATERIAL_OF.find(([c]) => c === r.color) || [])[1] || (r.color ? 'Colour ' + r.color : 'Board');
    return { id: ++n, name: r.name || 'Panel ' + n, material: material.trim(), color: r.color, L, W, T, axes: { l: lv, w: wv, t: tv }, origin: box.min, box, role, banding };
  });
  return { panels, loose };
}

/** Where a horizontal board touches a side: the side's face against its end. → [{ side, h, end: 'min' | 'max' }] */
function contacts(panels) {
  const out = [], tol = 1.5;
  for (const s of panels.filter((p) => p.role === 'side')) for (const h of panels.filter((p) => p.role === 'horizontal')) {
    const yz = h.box.min[1] < s.box.max[1] - tol && h.box.max[1] > s.box.min[1] + tol && h.box.min[2] < s.box.max[2] - tol && h.box.max[2] > s.box.min[2] + tol;
    if (!yz) continue;
    if (Math.abs(h.box.min[0] - s.box.max[0]) < tol) out.push({ side: s, h, end: 'min' });
    else if (Math.abs(h.box.max[0] - s.box.min[0]) < tol) out.push({ side: s, h, end: 'max' });
  }
  return out;
}

export function drill(panels, rules = DRILL_RULES) {
  const R = { ...DRILL_RULES, ...rules }, holes = new Map(panels.map((p) => [p.id, []]));
  // a cabinet point → the panel's face coordinates (x along L, y along W, from its min corner)
  const local = (p, q) => { const d = sub(q, p.origin); return [Math.abs(dot(d, p.axes.l)), Math.abs(dot(d, p.axes.w))]; };
  for (const p of panels) {
    const H = holes.get(p.id);
    if (p.role === 'side') {
      // shelf pins: two rows (front and back), every pitch, between pinEnd from the bottom and from the top
      const zLong = Math.abs(p.axes.l[2]) > 0.9;   // the side's length runs up
      const rows = [R.pinInset, (zLong ? p.W : p.L) - R.pinInset];
      const runLen = zLong ? p.L : p.W;
      for (let a = R.pinEnd; a <= runLen - R.pinEnd + 1e-6; a += R.pitch) for (const r of rows) H.push(zLong ? { x: a, y: r, d: R.pinD, depth: R.pinDepth, face: 'top', kind: 'shelf-pin' } : { x: r, y: a, d: R.pinD, depth: R.pinDepth, face: 'top', kind: 'shelf-pin' });
    }
    if (p.role === 'front' && p.T >= 15) {
      // hinge cups on the left edge (seen from the front), 100 mm from each end; a third in the middle over 1200 mm
      const upL = Math.abs(p.axes.l[2]) > 0.9, run = upL ? p.L : p.W;
      const at = [R.cupEnd, run - R.cupEnd, ...(run > 1200 ? [run / 2] : [])];
      for (const a of at) H.push(upL ? { x: a, y: R.cupEdge, d: R.cupD, depth: R.cupDepth, face: 'top', kind: 'hinge' } : { x: R.cupEdge, y: a, d: R.cupD, depth: R.cupDepth, face: 'top', kind: 'hinge' });
    }
  }
  for (const c of contacts(panels)) {
    const { side, h } = c, yMin = h.box.min[1], yMax = h.box.max[1], zMid = (h.box.min[2] + h.box.max[2]) / 2;
    for (const y of [yMin + R.connInset, yMax - R.connInset]) {
      const xSide = c.end === 'min' ? side.box.max[0] : side.box.min[0];
      const [sx, sy] = local(side, [xSide, y, zMid]);
      holes.get(side.id).push({ x: sx, y: sy, d: R.connD, depth: side.T, face: 'top', kind: 'connector' });
      const xEnd = c.end === 'min' ? h.box.min[0] : h.box.max[0];
      const [hx, hy] = local(h, [xEnd + (c.end === 'min' ? R.camInset : -R.camInset), y, h.box.max[2]]);
      holes.get(h.id).push({ x: hx, y: hy, d: R.camD, depth: R.camDepth, face: 'top', kind: 'cam' });
      const [ex, ey] = local(h, [xEnd, y, zMid]);
      holes.get(h.id).push({ x: ex, y: ey, d: R.boreD, depth: R.boreDepth, face: 'edge-' + (ex < h.L / 2 ? 'start' : 'end'), kind: 'dowel' });
    }
  }
  for (const H of holes.values()) for (const x of H) { x.x = r1(x.x); x.y = r1(x.y); }
  return holes;
}

export function cutList(panels) {
  const by = new Map();
  for (const p of panels) {
    const band = ['l1', 'l2', 'w1', 'w2'].filter((k) => p.banding[k]).join(' ');
    const k = [p.name.replace(/\s*\d+$/, ''), p.L, p.W, p.T, p.material, band].join('|');
    let row = by.get(k);
    if (!row) { row = { name: p.name.replace(/\s*\d+$/, '') || p.role, qty: 0, L: p.L, W: p.W, T: p.T, material: p.material, banding: band, grain: 'L', role: p.role, ids: [] }; by.set(k, row); }
    row.qty++; row.ids.push(p.id);
  }
  return [...by.values()].sort((a, b) => a.material.localeCompare(b.material) || b.T - a.T || b.L * b.W - a.L * a.W);
}
