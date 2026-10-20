/* SPDX-License-Identifier: Apache-2.0 */
/**
 * pdf-font.js — a TrueType font embedded in the PDFs BimCraft writes (KHADRAW P1.5), so text in any script the font has —
 * Thai first — prints, copies and searches. No DOM, no library: tests/pdf-font-test.mjs runs it in Node.
 *
 * The page registers its font once (fonts/ beside the app; registerPdfFont), and every PDF writer (res-sheets.js setPdf,
 * model-pdf.js planPdf) asks a PdfText for its text: with a font registered, text is drawn in it — a Type0 font, Identity-H,
 * CIDFontType2 with the whole TrueType program as FontFile2, widths of the glyphs used, and a ToUnicode CMap; without one, the
 * writer keeps its own Helvetica (the font registered is optional, never required).
 *
 *   registerPdfFont(bytes, { bold }) → the parsed font (throws on a file that is not TrueType)   pdfFontRegistered(bold?) → bool
 *   parseTtf(bytes) → { name, unitsPerEm, ascent, descent, capHeight, bbox, glyphOf(cp), advance(gid), bytes }
 *   const T = new PdfText();          one per PDF
 *   T.on                              a font is registered (else the writer uses its own Helvetica)
 *   T.width(s, sizePt, bold) → pt     the advance of the text as it will be drawn
 *   T.show(s, sizePt, bold) → ops     what goes between "BT … Tf … Tm" and "ET": TJ runs (and Ts for raised marks)
 *   T.fontObjects(first) → { F1: [obj…], F2: [obj…] }   the font's objects, numbered from `first` on (see setPdf)
 *
 * Thai without a shaping engine: marks above and below take no advance in the font and sit over the consonant before them;
 * a tone mark after an upper vowel (ั ิ ี ึ ื ็ ํ) is raised (TONE_RISE em) so the two do not collide, and marks over the
 * tall consonants (ป ฝ ฟ ฬ) move left (TALL_SHIFT em) off their stems — the two rules a Thai drafter notices first.
 */

const TONE_RISE = 0.22, TALL_SHIFT = 0.16;
const UPPER = new Set([0x0e31, 0x0e34, 0x0e35, 0x0e36, 0x0e37, 0x0e47, 0x0e4d]);
const TONE = new Set([0x0e48, 0x0e49, 0x0e4a, 0x0e4b, 0x0e4c]);
const LOWER = new Set([0x0e38, 0x0e39, 0x0e3a]);
const TALL = new Set([0x0e1b, 0x0e1d, 0x0e1f, 0x0e2c]);
const isMark = (cp) => UPPER.has(cp) || TONE.has(cp) || LOWER.has(cp);

/** A TrueType (or OpenType with TrueType outlines) font: what a PDF needs of it. */
export function parseTtf(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = (o) => dv.getUint16(o), i16 = (o) => dv.getInt16(o), u32 = (o) => dv.getUint32(o);
  const ver = u32(0);
  if (ver !== 0x00010000 && ver !== 0x74727565) throw new Error('pdf-font: not a TrueType font');   // i18n-ignore: developer error
  const tables = {};
  for (let i = 0, n = u16(4); i < n; i++) {
    const o = 12 + i * 16, tag = String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
    tables[tag] = { off: u32(o + 8), len: u32(o + 12) };
  }
  for (const t of ['head', 'hhea', 'hmtx', 'maxp', 'cmap']) if (!tables[t]) throw new Error('pdf-font: no ' + t + ' table');   // i18n-ignore
  const head = tables.head.off, hhea = tables.hhea.off;
  const unitsPerEm = u16(head + 18);
  const bbox = [i16(head + 36), i16(head + 38), i16(head + 40), i16(head + 42)];
  const nHM = u16(hhea + 34), numGlyphs = u16(tables.maxp.off + 4);
  let ascent = i16(hhea + 4), descent = i16(hhea + 6), capHeight = Math.round(ascent * 0.7);
  if (tables['OS/2'] && tables['OS/2'].len >= 90) {
    const os = tables['OS/2'].off;
    ascent = i16(os + 68); descent = i16(os + 70);
    if (u16(os) >= 2) capHeight = i16(os + 88) || capHeight;
  }
  const hm = tables.hmtx.off;
  const advance = (gid) => (gid < nHM ? u16(hm + gid * 4) : u16(hm + (nHM - 1) * 4));
  // cmap: format 12 (full Unicode) if there is one, else format 4 (the BMP)
  const cm = tables.cmap.off, map = new Map();
  let f4 = null, f12 = null;
  for (let i = 0, n = u16(cm + 2); i < n; i++) {
    const pid = u16(cm + 4 + i * 8), eid = u16(cm + 6 + i * 8), off = cm + u32(cm + 8 + i * 8), fmt = u16(off);
    if (fmt === 12 && (pid === 3 && eid === 10 || pid === 0)) f12 = off;
    if (fmt === 4 && (pid === 3 && (eid === 1 || eid === 0) || pid === 0)) f4 = f4 ?? off;
  }
  if (f12 !== null) {
    for (let i = 0, n = u32(f12 + 12); i < n; i++) {
      const o = f12 + 16 + i * 12, s = u32(o), e = u32(o + 4), g = u32(o + 8);
      for (let c = s; c <= e && c - s < 65536; c++) map.set(c, g + c - s);
    }
  } else if (f4 !== null) {
    const seg = u16(f4 + 6) / 2, ends = f4 + 14, starts = ends + seg * 2 + 2, deltas = starts + seg * 2, ros = deltas + seg * 2;
    for (let i = 0; i < seg; i++) {
      const e = u16(ends + i * 2), s = u16(starts + i * 2), d = i16(deltas + i * 2), ro = u16(ros + i * 2);
      for (let c = s; c <= e && c !== 0xffff; c++) {
        let g;
        if (ro === 0) g = (c + d) & 0xffff;
        else { const gi = ros + i * 2 + ro + (c - s) * 2; g = gi + 1 < b.length ? u16(gi) : 0; if (g) g = (g + d) & 0xffff; }
        if (g && g < numGlyphs) map.set(c, g);
      }
    }
  } else throw new Error('pdf-font: no Unicode cmap');   // i18n-ignore
  // the PostScript name (name id 6), for /BaseFont
  let name = 'EmbeddedFont';
  if (tables.name) {
    const no = tables.name.off, count = u16(no + 2), strs = no + u16(no + 4);
    for (let i = 0; i < count; i++) {
      const r = no + 6 + i * 12, pid = u16(r), nid = u16(r + 6), len = u16(r + 8), off = strs + u16(r + 10);
      if (nid !== 6) continue;
      let s = '';
      if (pid === 3 || pid === 0) for (let k = 0; k + 1 < len; k += 2) s += String.fromCharCode(u16(off + k));
      else for (let k = 0; k < len; k++) s += String.fromCharCode(b[off + k]);
      s = s.replace(/[^A-Za-z0-9_-]/g, '');
      if (s) { name = s; break; }
    }
  }
  return { name, unitsPerEm, ascent, descent, capHeight, bbox, numGlyphs, glyphOf: (cp) => map.get(cp) || 0, advance, bytes: b };
}

const fonts = { regular: null, bold: null };
export function registerPdfFont(bytes, { bold = false } = {}) {
  const f = parseTtf(bytes);
  fonts[bold ? 'bold' : 'regular'] = f;
  return f;
}
/**
 * The page's fonts: fonts/fonts.local.json (a machine's own, not shipped) or fonts/fonts.json — { regular, bold? } file names
 * beside it — fetched and registered. → the regular font's name, or null (no font: the PDFs keep Helvetica). Never throws.
 */
export async function loadPdfFonts(base = new URL('./fonts/', import.meta.url)) {
  const get = async (u) => { try { const r = await fetch(u); return r.ok ? r : null; } catch (e) { return null; } };
  for (const list of ['fonts.local.json', 'fonts.json']) {
    try {
      const r = await get(new URL(list, base));
      if (!r) continue;
      const j = await r.json();
      const reg = j?.regular && await get(new URL(j.regular, base));
      if (!reg) continue;
      const f = registerPdfFont(new Uint8Array(await reg.arrayBuffer()));
      const bold = j.bold && await get(new URL(j.bold, base));
      if (bold) { try { registerPdfFont(new Uint8Array(await bold.arrayBuffer()), { bold: true }); } catch (e) { /* the regular one draws bold */ } }
      return f.name;
    } catch (e) { /* the next list, else Helvetica */ }
  }
  return null;
}
export const pdfFontRegistered = (bold = false) => !!(bold ? fonts.bold || fonts.regular : fonts.regular);
export function unregisterPdfFonts() { fonts.regular = null; fonts.bold = null; }

const hex4 = (n) => n.toString(16).padStart(4, '0').toUpperCase();
const num = (v) => { const s = (Math.abs(v) < 5e-5 ? 0 : v).toFixed(3); return s.replace(/\.?0+$/, '') || '0'; };

/** The text's glyphs with where each sits: [{ gid, cp, dx (em, before it), rise (em) }] and its advance (em). */
function layout(f, s) {
  const out = [];
  let w = 0, prevBase = 0, prevUpper = false;
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (cp < 0x20) continue;
    const gid = f.glyphOf(cp) || f.glyphOf(0x3f);
    const adv = f.advance(gid) / f.unitsPerEm;
    const g = { gid, cp, adv, dx: 0, rise: 0 };
    if (isMark(cp)) {
      if ((UPPER.has(cp) || TONE.has(cp)) && TALL.has(prevBase)) g.dx = -TALL_SHIFT;
      if (TONE.has(cp) && prevUpper) g.rise = TONE_RISE;
      prevUpper = UPPER.has(cp);
    } else { prevBase = cp; prevUpper = false; }
    out.push(g);
    w += adv;
  }
  return { glyphs: out, width: w };
}

/** The text of one PDF: widths and drawing operators in the registered font, and the font's objects once the pages are done. */
export class PdfText {
  constructor() { this.used = [new Map(), new Map()]; }   // regular, bold: gid → the text it stands for
  get on() { return !!fonts.regular; }
  font(bold) { return bold ? fonts.bold || fonts.regular : fonts.regular; }
  /** Bold drawn with the regular font: outlined a little (2 Tr) — when no bold font is registered. */
  fakeBold(bold) { return bold && !fonts.bold; }
  width(s, size, bold = false) { const f = this.font(bold); return f ? layout(f, s).width * size : 0; }
  /** TJ runs for the text (glyph ids in hex; a raised mark in its own run with Ts; a shifted one with TJ offsets). */
  show(s, size, bold = false) {
    const f = this.font(bold);
    if (!f) return '';
    const used = this.used[bold && fonts.bold ? 1 : 0];
    const { glyphs } = layout(f, s);
    const runs = [];
    let cur = null;
    for (const g of glyphs) {
      used.set(g.gid, used.get(g.gid) || String.fromCodePoint(g.cp));
      if (!cur || cur.rise !== g.rise) { cur = { rise: g.rise, parts: [] }; runs.push(cur); }
      if (g.dx) cur.parts.push(num(-g.dx * 1000));
      cur.parts.push('<' + hex4(g.gid) + '>');
      if (g.dx) cur.parts.push(num(g.dx * 1000));
    }
    // the text as written, for copy and search: marks taking no advance would otherwise come out in drawing order
    const actual = [...String(s)].map((c) => { const cp = c.codePointAt(0); return cp > 0xffff ? hex4(0xd800 + ((cp - 0x10000) >> 10)) + hex4(0xdc00 + ((cp - 0x10000) & 0x3ff)) : hex4(cp); }).join('');
    const ops = ['/Span << /ActualText <FEFF' + actual + '> >> BDC'];
    if (this.fakeBold(bold)) ops.push('2 Tr ' + num(size * 0.035) + ' w');
    for (const r of runs) {
      if (r.rise) ops.push(num(r.rise * size) + ' Ts');
      ops.push('[' + r.parts.join(' ') + '] TJ');
      if (r.rise) ops.push('0 Ts');
    }
    if (this.fakeBold(bold)) ops.push('0 Tr');
    ops.push('EMC');
    return ops.join(' ');
  }
  /**
   * The objects of the fonts, numbered from `first` (Type0 first: the page resources name it). → { F1: { ref, objs }, F2 } where
   * objs are [{ dict } | { dict, stream: Uint8Array }] in number order; F2 is the bold font, or F1's when there is none.
   */
  fontObjects(first) {
    const out = {};
    let no = first;
    const make = (f, used) => {
      const ids = [...used.keys()].sort((a, b) => a - b);
      const k = 1000 / f.unitsPerEm;
      const W = ids.length ? '[' + ids.map((g) => g + ' [' + num(f.advance(g) * k) + ']').join(' ') + ']' : '[]';
      const t0 = no, cid = no + 1, fd = no + 2, ff = no + 3, tu = no + 4;
      no += 5;
      const cmap = ['/CIDInit /ProcSet findresource begin', '12 dict begin', 'begincmap', '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
        '/CMapName /Adobe-Identity-UCS def', '/CMapType 2 def', '1 begincodespacerange', '<0000> <FFFF>', 'endcodespacerange'];
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        cmap.push(chunk.length + ' beginbfchar');
        for (const g of chunk) cmap.push('<' + hex4(g) + '> <' + [...used.get(g)].map((c) => { const cp = c.codePointAt(0); return cp > 0xffff ? hex4(0xd800 + ((cp - 0x10000) >> 10)) + hex4(0xdc00 + ((cp - 0x10000) & 0x3ff)) : hex4(cp); }).join('') + '>');
        cmap.push('endbfchar');
      }
      cmap.push('endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end');
      const name = '/' + f.name;
      return {
        ref: t0,
        objs: [
          { dict: `<< /Type /Font /Subtype /Type0 /BaseFont ${name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tu} 0 R >>` },
          { dict: `<< /Type /Font /Subtype /CIDFontType2 /BaseFont ${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${fd} 0 R /CIDToGIDMap /Identity /DW 1000 /W ${W} >>` },
          { dict: `<< /Type /FontDescriptor /FontName ${name} /Flags 32 /FontBBox [${f.bbox.map((v) => num(v * k)).join(' ')}] /ItalicAngle 0 /Ascent ${num(f.ascent * k)} /Descent ${num(f.descent * k)} /CapHeight ${num(f.capHeight * k)} /StemV 80 /FontFile2 ${ff} 0 R >>` },
          { dict: `/Length1 ${f.bytes.length}`, stream: f.bytes },
          { dict: '', stream: Uint8Array.from(cmap.join('\n'), (c) => c.charCodeAt(0)) },
        ],
      };
    };
    out.F1 = make(fonts.regular, this.used[0]);
    out.F2 = fonts.bold ? make(fonts.bold, this.used[1]) : out.F1;
    return out;
  }
}
