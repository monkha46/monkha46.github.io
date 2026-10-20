/* SPDX-License-Identifier: Apache-2.0 */
/**
 * sheet-cad.js — a sheet as a CAD drawing (KHADRAW P1.5 round 3): what res-sheets.js draws on a sheet (its items, sheet
 * millimetres, y up) written 1:1 in millimetres, so an office opens it in AutoCAD / BricsCAD / CadCraft and finishes it there.
 * No DOM: tests/sheetcad-test.mjs runs it in Node (and checks the DXF with ezdxf when Python has it).
 *
 *   sheetEntities(sheet) → { ents, layers, linetypes, styles }   the neutral drawing (what both writers take):
 *       lines → LWPOLYLINE on a layer per pen ("PEN-018" = 0.18 mm, with that lineweight), dashed ones with a linetype of their
 *       dash pattern; grey from the item (true colour; the nearest grey of the 255 colours in DXF R12); fills → solid HATCH
 *       (holes kept) on "FILL"; text → TEXT on "TEXT" in style KHADRAW (bold: KHADRAW-B; a TrueType font that has Thai);
 *       a view's crop region (clip … unclip) clips lines and drops what lies outside.
 *   sheetDwg(sheet, { version }) → { bytes, report }   DWG through cc-dwg (dwg/write.js); AC1027 (R2013) by default — text is
 *       UTF-16 from R2007 on, so Thai stays Thai; lineweights and true colours kept
 *   sheetDxf(sheet) → string                         DXF R12 (AC1009): the most widely read; lineweights as layer names only,
 *       Thai written as \U+XXXX (AutoCAD and its kin read it), fills as SOLID triangles
 *   TEXT_FONT, TEXT_FONT_BOLD                         the styles' fonts (Tahoma: on every Windows, Thai included)
 */
import { writeDwg } from './dwg/write.js';
import { earcut } from './mc/earcut.js';

export const TEXT_FONT = 'tahoma.ttf', TEXT_FONT_BOLD = 'tahomabd.ttf';
const PT = 25.4 / 72;   // mm per point
const CAP = 0.7;        // a CAD text's height is its capitals': about 0.7 of the font size the PDF uses
const LW = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];
const lwOf = (mm) => LW.reduce((b, x) => (Math.abs(x - mm * 100) < Math.abs(b - mm * 100) ? x : b), 25);
const grey = (g) => { const v = Math.round(Math.max(0, Math.min(1, g || 0)) * 255); return (v << 16) | (v << 8) | v; };
const aciGrey = (g) => (!g || g < 0.15 ? 7 : g < 0.4 ? 250 : g < 0.55 ? 251 : g < 0.7 ? 252 : g < 0.85 ? 253 : 254);

/** Liang–Barsky: the part of a → b inside rect [x0, y0, x1, y1], or null. */
function clipSeg(a, b, r) {
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - r[0]], [dx, r[2] - a[0]], [-dy, a[1] - r[1]], [dy, r[3] - a[1]]]) {
    if (p === 0) { if (q < 0) return null; continue; }
    const t = q / p;
    if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  return [[a[0] + dx * t0, a[1] + dy * t0], [a[0] + dx * t1, a[1] + dy * t1]];
}
/** A polyline clipped to a rectangle: the runs of it inside, each a polyline of its own. */
function clipPolyline(pts, r) {
  const runs = [];
  let cur = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const s = clipSeg(pts[i], pts[i + 1], r);
    if (!s) { cur = null; continue; }
    if (cur && Math.hypot(cur[cur.length - 1][0] - s[0][0], cur[cur.length - 1][1] - s[0][1]) < 1e-9) cur.push(s[1]);
    else { cur = [s[0], s[1]]; runs.push(cur); }
    if (Math.hypot(s[1][0] - pts[i + 1][0], s[1][1] - pts[i + 1][1]) > 1e-9) cur = null;
  }
  return runs;
}
const inside = (p, r) => p[0] >= r[0] && p[0] <= r[2] && p[1] >= r[1] && p[1] <= r[3];

export function sheetEntities(sheet) {
  const ents = [], layers = new Map(), linetypes = new Map();
  const layer = (name, lw) => { if (!layers.has(name)) layers.set(name, { name, color: { index: 7 }, lineweight: lw ?? -3, plot: true }); return name; };
  const ltype = (dash) => {
    if (!dash?.length) return undefined;
    const els = (dash.length % 2 ? [...dash, ...dash] : dash).map((v, i) => (i % 2 ? -Math.abs(v) : Math.abs(v)));
    const key = els.map((v) => v.toFixed(2)).join(',');
    if (!linetypes.has(key)) linetypes.set(key, { name: 'KH-DASH-' + (linetypes.size + 1), description: 'KHADRAW ' + key, patternLength: els.reduce((s, v) => s + Math.abs(v), 0), elements: els.map((length) => ({ length })) });
    return linetypes.get(key).name;
  };
  const clips = [];
  const clip = () => clips[clips.length - 1] || null;
  for (const it of sheet.items || []) {
    if (it.t === 'clip') { clips.push(it.rect); continue; }
    if (it.t === 'unclip') { clips.pop(); continue; }
    if (it.t === 'line') {
      const pts = it.pts || [];
      if (pts.length < 2) continue;
      const lw = lwOf(it.w || 0.18), name = layer('PEN-' + String(lw).padStart(3, '0'), lw);
      const runs = clip() ? clipPolyline(pts, clip()) : [pts];
      const lt = ltype(it.dash);
      for (const run of runs) if (run.length >= 2) ents.push({ type: 'LWPOLYLINE', layer: name, linetype: lt, grey: it.g || 0, vertices: run.map(([x, y]) => ({ x, y })), closed: false });
    } else if (it.t === 'fill') {
      const rings = (it.polys || []).filter((p) => p.length >= 3);
      if (!rings.length) continue;
      if (clip()) { const c = rings[0].reduce((s, p) => [s[0] + p[0] / rings[0].length, s[1] + p[1] / rings[0].length], [0, 0]); if (!inside(c, clip())) continue; }
      ents.push({ type: 'HATCH', layer: layer('FILL'), grey: it.g || 0, rings });
    } else if (it.t === 'text') {
      if (!String(it.s || '').trim()) continue;
      if (clip() && !inside([it.x, it.y], clip())) continue;
      ents.push({ type: 'TEXT', layer: layer('TEXT'), grey: it.g || 0, at: [it.x, it.y], height: (it.size || 8) * PT * CAP, value: String(it.s), rotation: it.rot || 0, align: it.align === 'left' ? 0 : it.align === 'right' ? 2 : 1, bold: !!it.bold });
    }
  }
  return {
    ents, layers: [...layers.values()], linetypes: [...linetypes.values()],
    styles: [{ name: 'KHADRAW', font: TEXT_FONT }, { name: 'KHADRAW-B', font: TEXT_FONT_BOLD }],
  };
}

// ------------------------------------------------------------------------------------------------------------- DWG
export function sheetDwg(sheet, { version = 'AC1027', created = null } = {}) {
  const E = sheetEntities(sheet);
  const P = (p) => ({ x: p[0], y: p[1], z: 0 });
  const col = (g) => ({ rgb: grey(g), index: aciGrey(g) });
  const conv = (e) => {
    if (e.type === 'LWPOLYLINE') return { type: 'LWPOLYLINE', layer: e.layer, linetype: e.linetype, color: col(e.grey), vertices: e.vertices.map((v) => ({ x: v.x, y: v.y, z: 0 })), closed: false };
    if (e.type === 'HATCH') return { type: 'HATCH', layer: e.layer, color: col(e.grey), solid: true, pattern: 'SOLID', style: 0, patternType: 1, loops: e.rings.map((r, i) => ({ flags: i ? 0 : 1, polyline: { vertices: r.map(P), closed: true } })) };
    return { type: 'TEXT', layer: e.layer, color: col(e.grey), insert: P(e.at), align: e.align ? P(e.at) : null, height: e.height, value: e.value, rotation: e.rotation, hAlign: e.align, vAlign: 0, style: e.bold ? 'KHADRAW-B' : 'KHADRAW' };
  };
  const dwg = {
    version, header: { INSUNITS: 4, MEASUREMENT: 1, LUNITS: 2, LUPREC: 2, LWDISPLAY: 1 },
    tables: { layers: [{ name: '0', color: { index: 7 }, plot: true }, ...E.layers], linetypes: E.linetypes, styles: E.styles.map((s) => ({ ...s, height: 0, widthFactor: 1 })) },
    blocks: [{ name: '*Model_Space', entities: E.ents.map(conv) }, { name: '*Paper_Space', entities: [] }],
    layouts: [], objects: [],
  };
  if (created instanceof Date) dwg.created = created;
  return writeDwg(dwg, { version });
}

// ------------------------------------------------------------------------------------------------------------- DXF R12
/** Text for DXF R12: ASCII as it is, anything else as \U+XXXX (what AutoCAD reads in R12 files). */
const dxfText = (s) => [...String(s)].map((c) => { const cp = c.codePointAt(0); return cp < 0x20 ? ' ' : cp < 0x7f ? c : '\\U+' + cp.toString(16).toUpperCase().padStart(4, '0'); }).join('');
const f = (v) => { const r = Math.round(v * 1e4) / 1e4; return String(Object.is(r, -0) ? 0 : r); };
export function sheetDxf(sheet) {
  const E = sheetEntities(sheet);
  const o = [];
  const g = (code, v) => o.push(String(code), String(v));
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$DWGCODEPAGE'); g(3, 'ANSI_1252'); g(9, '$INSUNITS'); g(70, 4); g(9, '$MEASUREMENT'); g(70, 1);
  const xs = [], ys = [];
  for (const e of E.ents) for (const p of e.vertices ? e.vertices.map((v) => [v.x, v.y]) : e.rings ? e.rings.flat() : [e.at]) { xs.push(p[0]); ys.push(p[1]); }
  g(9, '$EXTMIN'); g(10, f(Math.min(0, ...xs))); g(20, f(Math.min(0, ...ys))); g(30, 0);
  g(9, '$EXTMAX'); g(10, f(Math.max(...xs, 1))); g(20, f(Math.max(...ys, 1))); g(30, 0);
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 1 + E.linetypes.length);
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0);
  for (const lt of E.linetypes) { g(0, 'LTYPE'); g(2, lt.name); g(70, 0); g(3, lt.description); g(72, 65); g(73, lt.elements.length); g(40, f(lt.patternLength)); for (const el of lt.elements) g(49, f(el.length)); }
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, 1 + E.layers.length);
  for (const l of [{ name: '0' }, ...E.layers]) { g(0, 'LAYER'); g(2, l.name); g(70, 0); g(62, 7); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB');
  g(0, 'TABLE'); g(2, 'STYLE'); g(70, 1 + E.styles.length);
  for (const s of [{ name: 'STANDARD', font: 'txt' }, ...E.styles]) { g(0, 'STYLE'); g(2, s.name); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 2.5); g(3, s.font); g(4, ''); }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  for (const e of E.ents) {
    const c = aciGrey(e.grey);
    if (e.type === 'LWPOLYLINE') {
      // R12 has no LWPOLYLINE: a POLYLINE with its VERTEXes (two points: a LINE)
      if (e.vertices.length === 2) { g(0, 'LINE'); g(8, e.layer); if (e.linetype) g(6, e.linetype); g(62, c); g(10, f(e.vertices[0].x)); g(20, f(e.vertices[0].y)); g(30, 0); g(11, f(e.vertices[1].x)); g(21, f(e.vertices[1].y)); g(31, 0); continue; }
      g(0, 'POLYLINE'); g(8, e.layer); if (e.linetype) g(6, e.linetype); g(62, c); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, 0);
      for (const v of e.vertices) { g(0, 'VERTEX'); g(8, e.layer); g(10, f(v.x)); g(20, f(v.y)); g(30, 0); }
      g(0, 'SEQEND'); g(8, e.layer);
    } else if (e.type === 'HATCH') {
      // R12 has no HATCH: the fill as SOLID triangles (earcut, holes kept)
      const flat = [], holes = [];
      e.rings.forEach((r, i) => { if (i) holes.push(flat.length / 2); for (const p of r) flat.push(p[0], p[1]); });
      const tri = earcut(flat, holes);
      for (let i = 0; i < tri.length; i += 3) {
        const [a, b, d] = [tri[i], tri[i + 1], tri[i + 2]].map((k) => [flat[k * 2], flat[k * 2 + 1]]);
        g(0, 'SOLID'); g(8, e.layer); g(62, c);
        g(10, f(a[0])); g(20, f(a[1])); g(30, 0); g(11, f(b[0])); g(21, f(b[1])); g(31, 0); g(12, f(d[0])); g(22, f(d[1])); g(32, 0); g(13, f(d[0])); g(23, f(d[1])); g(33, 0);
      }
    } else {
      g(0, 'TEXT'); g(8, e.layer); g(62, c); g(10, f(e.at[0])); g(20, f(e.at[1])); g(30, 0); g(40, f(e.height)); g(1, dxfText(e.value));
      if (e.rotation) g(50, f(e.rotation * 180 / Math.PI));
      g(7, e.bold ? 'KHADRAW-B' : 'KHADRAW');
      if (e.align) { g(72, e.align); g(11, f(e.at[0])); g(21, f(e.at[1])); g(31, 0); }
    }
  }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}
