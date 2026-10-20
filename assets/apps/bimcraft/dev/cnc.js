/* SPDX-License-Identifier: Apache-2.0 */
/**
 * cnc.js — from boards to the shop floor (KHADRAW F): sheets nested, each part and each sheet as DXF for CAM, G-code for a
 * router, the cut list as CSV, all of it in one ZIP. No DOM: tests/furniture-test.mjs runs it. Millimetres.
 *
 *   nest(parts, { sheet: [2440, 1220], kerf = 4, margin = 10, rotate = true }) → [{ material, T, sheets: [{ w, h, placed:
 *       [{ id, name, x, y, w, h, rotated }], used (mm²) }], waste (0…1) }]   per material and thickness: shelves (guillotine
 *       strips) of the biggest parts first; a part turned a quarter only when `rotate` (no grain to keep) and it fits better
 *   partDxf(panel, holes) → DXF R12 text: the outline (layer OUTLINE), each hole a CIRCLE on DRILL_D<d>_Z<depth> (edge bores
 *       on EDGE_D<d>_Z<depth>, drawn where they enter the edge), the name as TEXT on LABEL. Origin = the part's corner.
 *   sheetDxf(sheet, panelsById, holesById) → DXF R12: the sheet (SHEET), every part placed (as partDxf, moved and turned)
 *   gcode(sheet, panelsById, holesById, { T, tool = 6, feed = 3000, plunge = 600, safe = 15, step = 6, through = 0.5,
 *       drillFeed = 300, flavor = 'grbl' }) → text   Z0 = the top of the board; face holes drilled first (pecked, one tool
 *       per diameter, M0 to change it), then each part's outline cut outside it (offset by the tool's radius) in passes of
 *       `step` down to T + through; edge bores are listed as comments (a boring machine's, not the router's)
 *   csv(rows) → text (UTF-8 with BOM, for Excel)   zip(files: [{ name, data: string | Uint8Array }]) → Uint8Array (stored)
 */

// ------------------------------------------------------------------------------------------------------------ nesting
export function nest(parts, { sheet = [2440, 1220], kerf = 4, margin = 10, rotate = true } = {}) {
  const groups = new Map();
  for (const p of parts) { const k = p.material + '|' + p.T; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); }
  const out = [];
  for (const [k, list] of groups) {
    const [material, T] = [k.slice(0, k.lastIndexOf('|')), Number(k.slice(k.lastIndexOf('|') + 1))];
    const SW = sheet[0] - 2 * margin, SH = sheet[1] - 2 * margin;
    // each part: its length along the sheet's length when it fits so; turned when it only fits turned (or rotation is free and it is better)
    const items = list.map((p) => {
      let w = p.L, h = p.W, rotated = false;
      if ((w > SW || h > SH) && rotate && h <= SW && w <= SH) { [w, h] = [h, w]; rotated = true; }
      return { id: p.id, name: p.name, w, h, rotated, too: w > SW || h > SH };
    }).sort((a, b) => b.h - a.h || b.w - a.w);
    const sheets = [];
    const newSheet = () => { const s = { w: sheet[0], h: sheet[1], placed: [], shelves: [], used: 0 }; sheets.push(s); return s; };
    const skipped = [];
    for (const it of items) {
      if (it.too) { skipped.push(it); continue; }
      let done = false;
      for (const s of sheets) {
        for (const sh of s.shelves) if (it.h <= sh.h && sh.x + it.w <= SW) { s.placed.push({ ...it, x: margin + sh.x, y: margin + sh.y }); sh.x += it.w + kerf; done = true; break; }
        if (done) break;
        const top = s.shelves.reduce((m, sh) => Math.max(m, sh.y + sh.h + kerf), 0);
        if (top + it.h <= SH) { s.shelves.push({ y: top, h: it.h, x: it.w + kerf }); s.placed.push({ ...it, x: margin, y: margin + top }); done = true; break; }
      }
      if (!done) { const s = newSheet(); s.shelves.push({ y: 0, h: it.h, x: it.w + kerf }); s.placed.push({ ...it, x: margin, y: margin }); }
    }
    for (const s of sheets) { s.used = s.placed.reduce((a, p) => a + p.w * p.h, 0); delete s.shelves; }
    const area = sheets.length * sheet[0] * sheet[1], used = sheets.reduce((a, s) => a + s.used, 0);
    out.push({ material, T, sheets, skipped: skipped.map((x) => x.id), waste: area ? 1 - used / area : 0 });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------ DXF R12
const f = (v) => { const r = Math.round(v * 1000) / 1000; return String(Object.is(r, -0) ? 0 : r); };
const dxfText = (s) => [...String(s)].map((c) => { const cp = c.codePointAt(0); return cp < 0x20 ? ' ' : cp < 0x7f ? c : '\\U+' + cp.toString(16).toUpperCase().padStart(4, '0'); }).join('');
const layerOf = (h) => (h.face === 'top' ? 'DRILL' : 'EDGE') + '_D' + f(h.d) + '_Z' + f(h.depth);
function dxfDoc(ents, layers) {
  const o = [], g = (c, v) => o.push(String(c), String(v));
  g(0, 'SECTION'); g(2, 'HEADER'); g(9, '$ACADVER'); g(1, 'AC1009'); g(9, '$INSUNITS'); g(70, 4); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES'); g(0, 'TABLE'); g(2, 'LAYER'); g(70, layers.size + 1);
  for (const [name, color] of [['0', 7], ...layers]) { g(0, 'LAYER'); g(2, name); g(70, 0); g(62, color); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB'); g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  for (const e of ents) {
    if (e.t === 'poly') { g(0, 'POLYLINE'); g(8, e.layer); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, 1); for (const p of e.pts) { g(0, 'VERTEX'); g(8, e.layer); g(10, f(p[0])); g(20, f(p[1])); g(30, 0); } g(0, 'SEQEND'); g(8, e.layer); }
    else if (e.t === 'circle') { g(0, 'CIRCLE'); g(8, e.layer); g(10, f(e.c[0])); g(20, f(e.c[1])); g(30, 0); g(40, f(e.r)); }
    else if (e.t === 'line') { g(0, 'LINE'); g(8, e.layer); g(10, f(e.a[0])); g(20, f(e.a[1])); g(30, 0); g(11, f(e.b[0])); g(21, f(e.b[1])); g(31, 0); }
    else if (e.t === 'text') { g(0, 'TEXT'); g(8, e.layer); g(10, f(e.at[0])); g(20, f(e.at[1])); g(30, 0); g(40, f(e.h)); g(1, dxfText(e.s)); }
  }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}
const COLORS = { OUTLINE: 7, LABEL: 8, SHEET: 9 };
/** A part's entities at (ox, oy), turned a quarter when `rot` (its L then runs along y). */
function partEnts(p, holes, ox = 0, oy = 0, rot = false, layers) {
  const P = (x, y) => (rot ? [ox + y, oy + x] : [ox + x, oy + y]);
  const ents = [{ t: 'poly', layer: 'OUTLINE', pts: [P(0, 0), P(p.L, 0), P(p.L, p.W), P(0, p.W)] }];
  layers.set('OUTLINE', COLORS.OUTLINE);
  for (const h of holes || []) {
    const L = layerOf(h);
    if (!layers.has(L)) layers.set(L, h.face === 'top' ? 1 + (Math.round(h.d) % 6) : 30);
    if (h.face === 'top') ents.push({ t: 'circle', layer: L, c: P(h.x, h.y), r: h.d / 2 });
    else { const x = h.face === 'edge-start' ? 0 : p.L; ents.push({ t: 'line', layer: L, a: P(x, h.y - h.d / 2), b: P(x, h.y + h.d / 2) }, { t: 'line', layer: L, a: P(x, h.y), b: P(x + (x ? -h.depth : h.depth), h.y) }); }
  }
  layers.set('LABEL', COLORS.LABEL);
  ents.push({ t: 'text', layer: 'LABEL', at: P(10, 10), h: Math.min(25, p.W / 6), s: p.name + ' ' + p.L + 'x' + p.W + 'x' + p.T });
  return ents;
}
export function partDxf(panel, holes) { const layers = new Map(); return dxfDoc(partEnts(panel, holes, 0, 0, false, layers), layers); }
export function sheetDxf(sheet, panelsById, holesById) {
  const layers = new Map([['SHEET', COLORS.SHEET]]);
  const ents = [{ t: 'poly', layer: 'SHEET', pts: [[0, 0], [sheet.w, 0], [sheet.w, sheet.h], [0, sheet.h]] }];
  for (const pl of sheet.placed) ents.push(...partEnts(panelsById.get(pl.id), holesById.get(pl.id), pl.x, pl.y, pl.rotated, layers));
  return dxfDoc(ents, layers);
}

// ------------------------------------------------------------------------------------------------------------ G-code
export function gcode(sheet, panelsById, holesById, { T, tool = 6, feed = 3000, plunge = 600, safe = 15, step = 6, through = 0.5, drillFeed = 300, flavor = 'grbl', name = 'sheet' } = {}) {
  const o = [], n = (v) => f(v), R = tool / 2, depth = T + through;
  o.push(`(KHADRAW ${name} ${sheet.w}x${sheet.h} T${T} — Z0 = the top of the board; ${flavor})`, 'G21 G90 G17', `G0 Z${n(safe)}`);
  // face holes by diameter (one tool each), pecked
  const byD = new Map();
  for (const pl of sheet.placed) {
    const p = panelsById.get(pl.id), at = (x, y) => (pl.rotated ? [pl.x + y, pl.y + x] : [pl.x + x, pl.y + y]);
    for (const h of holesById.get(pl.id) || []) {
      if (h.face !== 'top') { o.push(`(edge bore D${n(h.d)} depth ${n(h.depth)} in ${p.name} at ${n(h.y)} from its edge: boring machine)`); continue; }
      const k = h.d; if (!byD.has(k)) byD.set(k, []); byD.get(k).push({ p: at(h.x, h.y), depth: Math.min(h.depth, T + through) });
    }
  }
  let toolNo = 1;
  for (const [d, list] of [...byD].sort((a, b) => a[0] - b[0])) {
    toolNo++;
    o.push(`(tool ${toolNo}: drill D${n(d)} — ${list.length} holes)`, 'M5', `M0 (fit the D${n(d)} drill, set Z0 on the board, resume)`, 'M3 S18000');
    for (const h of list) {
      o.push(`G0 X${n(h.p[0])} Y${n(h.p[1])}`, 'G0 Z2');
      for (let z = -3; z > -h.depth; z -= 3) o.push(`G1 Z${n(z)} F${drillFeed}`, 'G0 Z1');
      o.push(`G1 Z${n(-h.depth)} F${drillFeed}`, `G0 Z${n(safe)}`);
    }
  }
  o.push('(profiles: cut outside each part)', 'M5', `M0 (fit the D${n(tool)} cutter, set Z0 on the board, resume)`, 'M3 S18000');
  for (const pl of sheet.placed) {
    const w = pl.rotated ? panelsById.get(pl.id).W : panelsById.get(pl.id).L, h = pl.rotated ? panelsById.get(pl.id).L : panelsById.get(pl.id).W;
    const x0 = pl.x - R, y0 = pl.y - R, x1 = pl.x + w + R, y1 = pl.y + h + R;
    o.push(`(${panelsById.get(pl.id).name})`, `G0 X${n(x0)} Y${n(y0)}`, 'G0 Z2');
    for (let z = Math.min(step, depth); ; z = Math.min(z + step, depth)) {
      o.push(`G1 Z${n(-z)} F${plunge}`, `G1 X${n(x1)} Y${n(y0)} F${feed}`, `G1 X${n(x1)} Y${n(y1)}`, `G1 X${n(x0)} Y${n(y1)}`, `G1 X${n(x0)} Y${n(y0)}`);
      if (z >= depth) break;
    }
    o.push(`G0 Z${n(safe)}`);
  }
  o.push('M5', 'G0 X0 Y0', 'M30');
  return o.join('\n') + '\n';
}

// ------------------------------------------------------------------------------------------------------------ files
export const csv = (rows) => '﻿' + rows.map((r) => r.map((c) => { const s = String(c ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n') + '\r\n';
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zip(files) {
  const enc = new TextEncoder(), chunks = [], central = [];
  let off = 0;
  const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  for (const fl of files) {
    const name = enc.encode(fl.name), data = typeof fl.data === 'string' ? enc.encode(fl.data) : fl.data, crc = crc32(data);
    const head = Uint8Array.from([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    chunks.push(head, name, data);
    central.push(Uint8Array.from([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name);
    off += head.length + name.length + data.length;
  }
  const cdSize = central.reduce((a, c) => a + c.length, 0);
  const end = Uint8Array.from([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(off), ...u16(0)]);
  const all = [...chunks, ...central, end], out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}
