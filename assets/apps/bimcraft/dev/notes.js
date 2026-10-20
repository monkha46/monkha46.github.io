/* SPDX-License-Identifier: Apache-2.0 */
/**
 * notes.js — notes written on a view (KHADRAW P1.5): a text, a leader (an arrow to something, its text at the other end), a
 * dimension placed by hand (two points, an offset; the measured length, or a text of one's own) and a revision cloud (round 3:
 * a scalloped outline round what changed, its revision's number in a triangle; Text = that number). No DOM: tests/notes-test.mjs
 * runs it in Node. Plan millimetres of the view's level (the level's own X / Y), like drafting.js, in the same views.
 *
 * Kept in the IFC as an IfcAnnotation (ObjectType "Note") contained in the view's level:
 *   'FootPrint' / 'Annotation' / 'Annotation2D': the leader's or dimension's lines as an IfcGeometricCurveSet and the text as
 *   an IfcTextLiteral (other programs see both), and CadCraft_Note: View, Kind ('text' | 'leader' | 'dim'), Text, Height (the
 *   text's height on paper, mm), Rotation (degrees, text), Offset (dimension, plan mm, + = left of a → b), Points (JSON).
 * BimCraft draws a note only in its own view (never in 3D), on screen, on sheets and in the PDFs (scene.notes, scene.dims).
 *
 *   readNotes(w) → [{ id, guid, storey, view, kind, text, height, rot, offset, pts: [[x, y]…] }]
 *   addNote({ level (GlobalId), view, kind, pts, text, height, rot, offset }) → op ({ guid })
 *   changeNotes(guids, { text, height, rot, offset }) → op   moveNotes(guids, dx, dy) → op   removeNotes(guids) → op
 *   noteScene(notes, fmt(mm) → text) → { notes: [{ key?, guid, lines, arrows: [{ p, from }], texts: [{ s, at, h, rot, align }] }],
 *       dims: [{ guid, a, b, off, text }] }   what the view draws (texts' h in paper mm; dims as model-plan.js / the PDFs draw them)
 *   Errors: model.err.note.text (no text), model.err.note.short (a leader or dimension under 10 mm), model.err.dr.view,
 *   model.err.nolevel, model.err.gone
 */
import { op } from './model-ops.js';
import { ids, val } from './ifc-util.js';
import { round } from './model-write.js';
import { isViewKey } from './drafting.js';

export const NOTE_PSET = 'CadCraft_Note';
const OBJECT_TYPE = 'Note';
export const NOTE_KINDS = ['text', 'leader', 'dim', 'cloud'];
export const NOTE_HEIGHT = 2.5;   // mm on paper: the usual note text
const refuse = (key) => { throw Object.assign(new Error(key), { key }); };
const clean = (pts) => (pts || []).filter((q) => Array.isArray(q) && Number.isFinite(+q[0]) && Number.isFinite(+q[1])).map((q) => [+q[0], +q[1]]);
const heightOf = (x) => { const v = Number(x); return Number.isFinite(v) && v > 0 ? Math.min(20, Math.max(1, v)) : NOTE_HEIGHT; };
const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function readNotes(w) {
  const out = [];
  let list = [];
  try { list = ids(w.api, w.mid, 'IFCANNOTATION'); } catch (e) { return out; }
  const so = w.storeyOf();
  for (const id of list) {
    const ps = w.readPset(id, NOTE_PSET);
    if (!ps) continue;
    const a = w.api.GetLine(w.mid, id, false);
    let pts = [];
    try { pts = clean(JSON.parse(String(ps.Points || '[]'))); } catch (e) { pts = []; }
    out.push({
      id, guid: val(a.GlobalId), storey: so.get(id) ?? null, view: String(ps.View || ''), kind: NOTE_KINDS.includes(ps.Kind) ? ps.Kind : 'text',
      text: String(ps.Text ?? ''), height: heightOf(ps.Height), rot: Number(ps.Rotation) || 0, offset: Number(ps.Offset) || 0, pts,
    });
  }
  return out;
}

/** A dimension's two points moved out by its offset: the dimension line. */
export function dimLine(n) {
  const [a, b] = n.pts, L = len(a, b) || 1, nn = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
  return [[a[0] + nn[0] * n.offset, a[1] + nn[1] * n.offset], [b[0] + nn[0] * n.offset, b[1] + nn[1] * n.offset]];
}

function check(n) {
  if (n.kind === 'text' && !n.text.trim()) refuse('model.err.note.text');
  if (n.kind === 'text' && n.pts.length < 1) refuse('model.err.note.text');
  if (n.kind === 'leader' && (n.pts.length < 2 || len(n.pts[0], n.pts[1]) < 10)) refuse('model.err.note.short');
  if (n.kind === 'dim' && (n.pts.length < 2 || len(n.pts[0], n.pts[1]) < 10)) refuse('model.err.note.short');
  if (n.kind === 'cloud' && (n.pts.length < 3 || !n.text.trim())) refuse(n.text.trim() ? 'model.err.note.short' : 'model.err.note.text');
}

/** A cloud's outline: its corners counter-clockwise, each side a row of arcs bulging out (about 30 round the whole). */
export function cloudPath(pts) {
  let a2 = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
  const P = a2 < 0 ? pts.slice().reverse() : pts;
  let per = 0;
  for (let i = 0; i < P.length; i++) per += len(P[i], P[(i + 1) % P.length]);
  const chord = Math.max(30, Math.min(1500, per / 30)), out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = len(a, b);
    if (L < 1e-6) continue;
    const n = Math.max(1, Math.round(L / chord)), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], o = [u[1], -u[0]];   // outward of a CCW outline: right of a → b
    for (let k = 0; k < n; k++) {
      const s0 = (k / n) * L, s1 = ((k + 1) / n) * L, c = (s0 + s1) / 2, r = (s1 - s0) / 2;
      for (let j = 0; j <= 6; j++) {
        if (k + i > 0 && j === 0) continue;
        const t = Math.PI - (j / 6) * Math.PI, along = c + r * Math.cos(t), out2 = r * Math.sin(t) * 0.8;
        out.push([a[0] + u[0] * along + o[0] * out2, a[1] + u[1] * along + o[1] * out2]);
      }
    }
  }
  if (out.length) out.push(out[0]);
  return { path: out, chord };
}

function writeShape(w, id, n) {
  const items = [];
  const curves = [];
  if (n.kind === 'leader') curves.push(w.polyline2(n.pts, false));
  if (n.kind === 'cloud') curves.push(w.polyline2(cloudPath(n.pts).path, false));
  if (n.kind === 'dim') { const [A, B] = dimLine(n); curves.push(w.polyline2([n.pts[0], A], false), w.polyline2([A, B], false), w.polyline2([B, n.pts[1]], false)); }
  if (curves.length) items.push(w.make('IFCGEOMETRICCURVESET', curves.map((c) => w.H(c))));
  const at = n.kind === 'cloud' ? n.pts.reduce((m, p) => (p[1] > m[1] || (p[1] === m[1] && p[0] < m[0]) ? p : m), n.pts[0]) : n.kind === 'dim' ? (() => { const [A, B] = dimLine(n); return [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]; })() : n.pts[n.pts.length - 1];
  const s = n.kind === 'dim' && !n.text ? String(Math.round(len(n.pts[0], n.pts[1]))) : n.text;
  if (s) {
    const r = (n.rot || 0) * Math.PI / 180;
    const pl = w.make('IFCAXIS2PLACEMENT2D', w.H(w.point2(round(w.u(at[0])), round(w.u(at[1])))), w.H(w.dir(round(Math.cos(r), 9), round(Math.sin(r), 9))));
    items.push(w.make('IFCTEXTLITERAL', w.T('IFCPRESENTABLETEXT', s), w.H(pl), 'RIGHT'));
  }
  w.setShape(id, [w.rep('foot', 'Annotation', 'Annotation2D', items)]);
}

const psetRows = (n) => [['View', 'IFCLABEL', n.view], ['Kind', 'IFCLABEL', n.kind], ['Text', 'IFCTEXT', n.text], ['Height', 'IFCREAL', round(n.height, 3)],
  ['Rotation', 'IFCREAL', round(n.rot || 0, 6)], ['Offset', 'IFCREAL', round(n.offset || 0, 3)], ['Points', 'IFCTEXT', JSON.stringify(n.pts.map((p) => p.map((v) => round(v, 3))))]];

export function addNote(spec) {
  const n = {
    kind: NOTE_KINDS.includes(spec.kind) ? spec.kind : 'text', pts: clean(spec.pts), text: String(spec.text ?? '').slice(0, 2000),
    height: heightOf(spec.height), rot: Number(spec.rot) || 0, offset: Number(spec.offset) || 0, view: String(spec.view || ''),
  };
  let guid = spec.guid || null;
  return op((w) => {
    if (!isViewKey(n.view)) refuse('model.err.dr.view');
    const st = w.byGuid(spec.level);
    if (!st) refuse('model.err.nolevel');
    check(n);
    if (!guid) guid = val(w.guid());
    const sl = w.api.GetLine(w.mid, st, false);
    const id = w.make('IFCANNOTATION', guid, w.ownerHistory(), w.L(n.kind === 'dim' ? 'Dimension' : n.kind === 'leader' ? 'Leader' : 'Text'), null, w.L(OBJECT_TYPE), w.H(w.placeAt(sl.ObjectPlacement.value, 0, 0, 0, 0)), null, ...(/^IFC4X3/i.test(w.schema || '') ? ['USERDEFINED'] : []));   // i18n-ignore: IFC Name / ObjectType
    w.noteGuid(guid, id);
    writeShape(w, id, n);
    w.contain(id, st);
    w.upsertPset(id, NOTE_PSET, psetRows(n));
    return { id, ids: [id], made: new Map([[guid, id]]), guid };
  });
}

const findAll = (w, guids) => { const set = new Set(guids); const list = readNotes(w).filter((n) => set.has(n.guid)); if (!list.length) refuse('model.err.gone'); return list; };
function rewrite(w, list, f) {
  for (const n0 of list) { const n = f(n0); check(n); writeShape(w, n.id, n); w.upsertPset(n.id, NOTE_PSET, psetRows(n)); }
  return { id: list[0].id, ids: list.map((n) => n.id) };
}
export function changeNotes(guids, ch) {
  const C = { ...ch };
  return op((w) => rewrite(w, findAll(w, guids), (n) => ({
    ...n, text: C.text !== undefined ? String(C.text).slice(0, 2000) : n.text, height: C.height !== undefined ? heightOf(C.height) : n.height,
    rot: C.rot !== undefined ? Number(C.rot) || 0 : n.rot, offset: C.offset !== undefined ? Number(C.offset) || 0 : n.offset,
  })));
}
export function moveNotes(guids, dx, dy) {
  return op((w) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) refuse('model.err.length');
    return rewrite(w, findAll(w, guids), (n) => ({ ...n, pts: n.pts.map(([x, y]) => [x + dx, y + dy]) }));
  });
}
export function removeNotes(guids) {
  return op((w) => {
    const set = new Set(guids), list = readNotes(w).filter((n) => set.has(n.guid)).map((n) => n.id);
    if (list.length) w.dropProduct(list);
    return { id: null, ids: [] };
  });
}

/** Where a note's text line sits from its anchor, in paper mm along the text (dx) and across it (dy, up): left- or
 *  right-aligned after a leader's gap, each further line 1.5 heights lower, a leader's text centred on its end. */
export function textOffset(t) {
  return { dx: (t.align === 'right' ? -1 : 1) * (t.gap || 0), dy: -(t.line || 0) * t.h * 1.5 - (t.gap ? t.h * 0.4 : 0) };
}
/** An arrowhead at p pointing away from `from`: a triangle, `len` long and `len` × 0.6 wide (units of p). */
export function arrowHead(p, from, len) {
  const L = Math.hypot(p[0] - from[0], p[1] - from[1]) || 1, u = [(p[0] - from[0]) / L, (p[1] - from[1]) / L], n = [-u[1], u[0]], w = len * 0.3;
  const b = [p[0] - u[0] * len, p[1] - u[1] * len];
  return [p, [b[0] + n[0] * w, b[1] + n[1] * w], [b[0] - n[0] * w, b[1] - n[1] * w]];
}

/** What a view draws for its notes: texts and leaders as scene.notes, dimensions as scene.dims (the way walls' are drawn). */
export function noteScene(notes, fmt = (mm) => String(Math.round(mm))) {
  const out = { notes: [], dims: [] };
  for (const n of notes) {
    if (n.kind === 'cloud') {
      if (n.pts.length < 3) continue;
      const { path, chord } = cloudPath(n.pts);
      // the tag: a triangle with the revision's number, on the cloud's top-left corner
      const c = n.pts.reduce((m, p) => (p[1] > m[1] || (p[1] === m[1] && p[0] < m[0]) ? p : m), n.pts[0]), s = chord * 1.6, h = s * Math.sqrt(3) / 2;
      const tri = [[c[0] - s / 2, c[1] + chord * 0.4], [c[0] + s / 2, c[1] + chord * 0.4], [c[0], c[1] + chord * 0.4 + h], [c[0] - s / 2, c[1] + chord * 0.4]];
      out.notes.push({ guid: n.guid, kind: 'cloud', lines: [path, tri], arrows: [], texts: [{ s: n.text, at: [c[0], c[1] + chord * 0.4 + h * 0.25], line: 0, h: n.height, rot: 0, align: 'center', gap: 0 }] });
      continue;
    }
    if (n.kind === 'dim') {
      if (n.pts.length < 2) continue;
      out.dims.push({ guid: n.guid, note: true, a: n.pts[0], b: n.pts[1], off: n.offset, text: n.text || fmt(len(n.pts[0], n.pts[1])) });
      continue;
    }
    const lines = [], arrows = [], texts = [];
    const lines0 = n.text.split('\n');
    if (n.kind === 'leader' && n.pts.length >= 2) {
      lines.push(n.pts);
      arrows.push({ p: n.pts[0], from: n.pts[1] });
      const end = n.pts[n.pts.length - 1], prev = n.pts[n.pts.length - 2];
      const right = end[0] >= prev[0];
      lines0.forEach((s, i) => texts.push({ s, at: end, line: i, h: n.height, rot: 0, align: right ? 'left' : 'right', gap: 1 }));
    } else if (n.pts.length) {
      lines0.forEach((s, i) => texts.push({ s, at: n.pts[0], line: i, h: n.height, rot: (n.rot || 0) * Math.PI / 180, align: 'left', gap: 0 }));
    }
    out.notes.push({ guid: n.guid, kind: n.kind, lines, arrows, texts });
  }
  return out;
}
