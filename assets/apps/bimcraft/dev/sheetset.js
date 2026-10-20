/* SPDX-License-Identifier: Apache-2.0 */
/**
 * sheetset.js — the drawing set as a Thai office issues it (KHADRAW P1.5 round 3): the title block's facts (office, project,
 * owner, site, architect and engineer with their licence numbers, who designed, drew and checked), the revisions, which
 * revisions each sheet carries (from the revision clouds on its views), the title block itself and the drawing index sheet.
 * No DOM: tests/sheetset-test.mjs runs it in Node.
 *
 * Kept on the project as property sets other programs ignore (one undo step per change):
 *   CadCraft_TitleBlock   Info: JSON { style: 'thai' | 'standard', office, officeAddress, project, owner, location, architect,
 *                         architectLicense, engineer, engineerLicense, designedBy, drawnBy, checkedBy }
 *   CadCraft_Revisions    List: JSON [{ n (the revision's number, 1…), date ('2026-10-19'), text }]
 *
 *   TB_FIELDS · readTitleBlock(w) · saveTitleBlock(info) → op · setTitleBlock(info) / getTitleBlock()   (the one sheets draw)
 *   readRevisions(w) · saveRevisions(list) → op
 *   viewKeyOf(kind, ref) → the view key a sheet's view shows ('plan:<ref>', 'elev:<side>', …) — what notes are drawn in
 *   sheetRevisions(viewKeys, clouds: [{ view, rev }], revisions) → the revisions on those views, newest first
 *   titleFrame(PW, PH, { number, title, project, date, scale, index, revisions }) → { items, room: [x0, y0, x1, y1] }
 *       the frame and the title block (the Thai one, a strip down the right, when the style is 'thai'; else the program's own
 *       along the bottom, drawn by res-sheets.js) and the room left for the drawings
 *   indexRows(sheets, clouds, revisions) → [{ number, title, rev (the latest on it) }]   for res-sheets.js indexSheet
 */
import { op } from './model-ops.js';
import { ids } from './ifc-util.js';
import { t as tr } from './i18n.js';

export const TB_PSET = 'CadCraft_TitleBlock', REV_PSET = 'CadCraft_Revisions';
export const TB_FIELDS = ['office', 'officeAddress', 'project', 'owner', 'location', 'architect', 'architectLicense', 'engineer', 'engineerLicense', 'designedBy', 'drawnBy', 'checkedBy'];
const project = (w) => ids(w.api, w.mid, 'IFCPROJECT')[0];
const text = (s, n = 160) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const json = (s) => { try { return JSON.parse(s || 'null'); } catch (e) { return null; } };
const cleanTB = (j) => { const o = { style: j?.style === 'thai' ? 'thai' : 'standard' }; for (const k of TB_FIELDS) o[k] = text(j?.[k]); return o; };
const cleanRevs = (list) => (Array.isArray(list) ? list : []).map((r) => ({ n: Math.max(1, Math.round(Number(r?.n)) || 0), date: text(r?.date, 20), text: text(r?.text, 200) }))
  .filter((r) => r.n >= 1).sort((a, b) => a.n - b.n).filter((r, i, a) => !i || a[i - 1].n !== r.n).slice(0, 99);

let TB = cleanTB(null);
export const setTitleBlock = (info) => { TB = cleanTB(info); return TB; };
export const getTitleBlock = () => ({ ...TB });

export function readTitleBlock(w) {
  const pj = project(w);
  return cleanTB(json((pj === undefined ? null : w.readPset(pj, TB_PSET))?.Info));
}
export function saveTitleBlock(info) {
  const I = cleanTB(info);
  return op((w) => { const pj = project(w); w.upsertPset(pj, TB_PSET, [['Info', 'IFCTEXT', JSON.stringify(I)]]); return { id: pj, ids: [], info: I }; });
}
export function readRevisions(w) {
  const pj = project(w);
  return cleanRevs(json((pj === undefined ? null : w.readPset(pj, REV_PSET))?.List));
}
export function saveRevisions(list) {
  const L = cleanRevs(list);
  return op((w) => { const pj = project(w); w.upsertPset(pj, REV_PSET, [['List', 'IFCTEXT', JSON.stringify(L)]]); return { id: pj, ids: [], revisions: L }; });
}

export function viewKeyOf(kind, ref) {
  if (kind === 'plan' || kind === 'rcp') return kind + ':' + ref;
  if (kind === 'callout') return 'callout:' + ref;
  if (kind === 'elevation') return 'elev:' + ref;
  if (kind === 'section') return 'section:' + ref;
  if (kind === 'detail') return 'detail:' + ref;
  return null;
}
export function sheetRevisions(viewKeys, clouds, revisions) {
  const keys = new Set(viewKeys.filter(Boolean)), ns = new Set();
  for (const c of clouds || []) if (keys.has(c.view)) { const n = Math.round(Number(c.rev)); if (n >= 1) ns.add(n); }
  return [...ns].sort((a, b) => b - a).map((n) => revisions.find((r) => r.n === n) || { n, date: '', text: '' });
}

// ---------------------------------------------------------------------------------------------------- the title block
const L = (key, vars) => tr(key, vars);
/** Text that fits a width (mm) at a size (pt): cut with an ellipsis (a rough measure: 0.5 em a character). */
const fit = (s, w, size) => { const max = Math.max(3, Math.floor(w / (size * 25.4 / 72 * 0.5))); const str = String(s || ''); return str.length > max ? str.slice(0, max - 1) + '…' : str; };

export function titleFrame(PW, PH, { number = '', title = '', project = '', date = '', scale = '', index = '', revisions = [] } = {}) {
  const m = 10, items = [];
  items.push({ t: 'line', pts: [[m, m], [PW - m, m], [PW - m, PH - m], [m, PH - m], [m, m]], w: 0.5, g: 0 });
  if (TB.style !== 'thai') return { items, room: null };
  const W = Math.max(52, Math.min(90, PW * 0.14)), x0 = PW - m - W, x1 = PW - m, pad = 2;
  items.push({ t: 'line', pts: [[x0, m], [x0, PH - m]], w: 0.5, g: 0 });
  let y = PH - m;
  const rule = (yy, w = 0.25) => items.push({ t: 'line', pts: [[x0, yy], [x1, yy]], w, g: 0 });
  const label = (s, yy) => items.push({ t: 'text', s, x: x0 + pad, y: yy, size: 5.5, align: 'left', g: 0.35 });
  const value = (s, yy, size = 7.5, bold = false) => items.push({ t: 'text', s: fit(s, W - 2 * pad, size), x: x0 + pad, y: yy, size, align: 'left', bold });
  /** A box: its label and up to two lines of value. */
  const box = (lab, lines, h, size = 7.5, bold = false) => {
    label(lab, y - 3.2);
    lines.filter(Boolean).slice(0, 2).forEach((s, i) => value(s, y - 7.5 - i * 4, size, bold));
    y -= h; rule(y);
  };
  // the office
  value(TB.office || L('tb.office.none'), y - 7, 9, true);
  if (TB.officeAddress) items.push({ t: 'text', s: fit(TB.officeAddress, W - 2 * pad, 5.5), x: x0 + pad, y: y - 11.5, size: 5.5, align: 'left', g: 0.25 });
  y -= 15; rule(y, 0.35);
  box(L('tb.project'), [TB.project || project], 12, 8, true);
  box(L('tb.owner'), [TB.owner], 9);
  box(L('tb.location'), [TB.location], 9);
  box(L('tb.architect'), [TB.architect, TB.architectLicense && L('tb.license', { no: TB.architectLicense })], 18);
  box(L('tb.engineer'), [TB.engineer, TB.engineerLicense && L('tb.license', { no: TB.engineerLicense })], 18);
  // designed / drawn / checked: three columns
  const c3 = W / 3;
  [[L('tb.designed'), TB.designedBy], [L('tb.drawn'), TB.drawnBy], [L('tb.checked'), TB.checkedBy]].forEach(([lab, v], i) => {
    items.push({ t: 'text', s: lab, x: x0 + i * c3 + pad, y: y - 3.2, size: 5.5, align: 'left', g: 0.35 });
    items.push({ t: 'text', s: fit(v, c3 - 2 * pad, 6.5), x: x0 + i * c3 + pad, y: y - 7.5, size: 6.5, align: 'left' });
    if (i) items.push({ t: 'line', pts: [[x0 + i * c3, y], [x0 + i * c3, y - 10]], w: 0.18, g: 0 });
  });
  y -= 10; rule(y);
  // the revisions this sheet carries (newest first), with room for four
  label(L('tb.revisions'), y - 3.2);
  const rh = 4, cols = [x0 + pad, x0 + 9, x0 + 25];
  [L('tb.rev.n'), L('tb.rev.date'), L('tb.rev.text')].forEach((s, i) => items.push({ t: 'text', s, x: cols[i], y: y - 7.5, size: 5.5, align: 'left', g: 0.35 }));
  revisions.slice(0, 4).forEach((r, i) => {
    const yy = y - 11.5 - i * rh;
    items.push({ t: 'text', s: String(r.n), x: cols[0], y: yy, size: 6, align: 'left' }, { t: 'text', s: r.date, x: cols[1], y: yy, size: 6, align: 'left' }, { t: 'text', s: fit(r.text, x1 - cols[2] - pad, 6), x: cols[2], y: yy, size: 6, align: 'left' });
  });
  y -= 9 + 4 * rh; rule(y, 0.35);
  // what the sheet is: its title, scale, date; its number large, and where it sits in the set
  const bottom = m;
  const titleTop = y;
  label(L('tb.title'), titleTop - 3.2);
  value(title, titleTop - 8.5, 9, true);
  label(L('tb.scale') + '  ' + (scale || L('tb.scale.shown')), titleTop - 13.5);
  label(L('tb.date') + '  ' + (date || ''), titleTop - 17.5);
  rule(titleTop - 20);
  label(L('tb.sheet'), titleTop - 23.2);
  items.push({ t: 'text', s: number, x: (x0 + x1) / 2, y: bottom + 8, size: 22, bold: true });
  if (index) items.push({ t: 'text', s: L('tb.index', { i: index }), x: x1 - pad, y: titleTop - 23.2, size: 6, align: 'right', g: 0.25 });
  return { items, room: [m, m, x0, PH - m] };
}

/** The drawing index: a sheet with the set's sheets as a table. */
export function indexRows(sheets, clouds, revisions) {
  return sheets.map((s) => {
    const revs = sheetRevisions((s.views || []).map((v) => viewKeyOf(v.kind, v.ref)), clouds, revisions);
    return { number: s.number || '', title: s.title || '', rev: revs.length ? String(revs[0].n) : '' };
  });
}
