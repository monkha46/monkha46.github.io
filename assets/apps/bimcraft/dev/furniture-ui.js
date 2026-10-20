/* SPDX-License-Identifier: Apache-2.0 */
/**
 * furniture-ui.js — built-in furniture to the shop floor in BimCraft (KHADRAW F), through model-ui.js extend(); mounted by
 * views-ui.js. Project browser › "CNC" › Cut list & CNC… [data-fu-open] (also Properties › Cut list & CNC… on a free-form
 * element of class furniture) → dialog [data-fu-dialog]: which furniture [data-fu-which], the sheet (mm), kerf, trim, cutter
 * Ø, depth per pass; Work out [data-fu-run] → the cut list [data-fu-row], the sheets per material and thickness with their
 * waste, warnings (faces that are not boards, thicknesses not sold, boards bigger than the sheet); Cut list (CSV)
 * [data-fu-csv]; Shop files (ZIP) [data-fu-zip]: cutlist.csv, a DXF per part and per sheet (layers OUTLINE,
 * DRILL_D<d>_Z<depth>, EDGE_…), a G-code program per sheet, README.txt.
 * Reads the boards with furniture.js, nests and writes with cnc.js. IFC: none written (the cut list is worked out each time).
 * Test hook: window.bimcraftFurniture = { state, work(opts), files(), openDialog(guids) }.
 */
import { readFreeforms } from './freeform-model.js';
import { ModelWriter } from './model-write.js';
import { panelsOf, drill, cutList, thicknessOk } from './furniture.js';
import { nest, partDxf, sheetDxf, gcode, csv, zip } from './cnc.js';
import { viewExtra } from './view-extra.js';
import { el } from './ui-util.js';

const ID_SPAN = 10000;   // each element's boards numbered apart: element i's board n is i · ID_SPAN + n
const safe = (s) => String(s).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60) || 'part';

export function mountFurniture(modelUi) {
  const F = { opts: { sheetW: 2440, sheetH: 1220, kerf: 4, margin: 10, tool: 6, step: 6 }, which: null, result: null };
  let A = null;
  const t = (...a) => A.t(...a);
  const writer = () => { const e = A.ed(); return new ModelWriter(e.W, e.api, e.mid); };
  const furniture = () => { try { return A.ed() ? readFreeforms(writer()).filter((f) => f.cls === 'furniture') : []; } catch (e) { return []; } };

  /** The chosen furniture's boards, holes, cut list and sheets. */
  function work(opts = F.opts, guids = F.which) {
    F.opts = { ...F.opts, ...opts };
    const els = furniture().filter((f) => !guids || guids.includes(f.guid));
    const panels = [], holes = new Map();
    let loose = 0;
    els.forEach((f, i) => {
      let r; try { r = panelsOf(f.json); } catch (e) { return; }
      loose += r.loose;
      const tag = f.name || t('fu.unnamed', { n: i + 1 }), H = drill(r.panels);
      for (const p of r.panels) {
        const id = (i + 1) * ID_SPAN + p.id;
        panels.push({ ...p, id, name: els.length > 1 ? tag + ' · ' + p.name : p.name });
        holes.set(id, H.get(p.id));
      }
    });
    const o = F.opts;
    const sheets = nest(panels.map((p) => ({ id: p.id, name: p.name, L: p.L, W: p.W, T: p.T, material: p.material })), { sheet: [o.sheetW, o.sheetH], kerf: o.kerf, margin: o.margin });
    F.result = { els, panels, holes, list: cutList(panels), sheets, loose, odd: panels.filter((p) => !thicknessOk(p.T)) };
    return F.result;
  }
  const csvRows = (r) => [[t('fu.col.name'), t('fu.col.qty'), t('fu.col.l'), t('fu.col.w'), t('fu.col.t'), t('fu.col.material'), t('fu.col.band'), t('fu.col.grain'), t('fu.col.holes')],
    ...r.list.map((x) => [x.name, x.qty, x.L, x.W, x.T, x.material, x.banding, x.grain, x.ids.reduce((a, id) => a + (r.holes.get(id)?.length || 0), 0) / x.qty])];
  /** The shop's files: [{ name, data }]. */
  function files(r = F.result) {
    if (!r) return [];
    const byId = new Map(r.panels.map((p) => [p.id, p])), out = [{ name: 'cutlist.csv', data: csv(csvRows(r)) }];
    for (const p of r.panels) out.push({ name: 'parts/' + safe(p.name) + '-' + p.id + '.dxf', data: partDxf(p, r.holes.get(p.id)) });
    for (const g of r.sheets) g.sheets.forEach((s, i) => {
      const base = safe(g.material) + '-' + g.T + 'mm-' + (i + 1);
      out.push({ name: 'sheets/' + base + '.dxf', data: sheetDxf(s, byId, r.holes) });
      out.push({ name: 'gcode/' + base + '.nc', data: gcode(s, byId, r.holes, { T: g.T, tool: F.opts.tool, step: F.opts.step, name: base }) });
    });
    out.push({ name: 'README.txt', data: [
      'KHADRAW — cut list and CNC files',
      'cutlist.csv: one line per board size (mm); banding l1 = the long edge at the front or bottom, l2 the other; w1, w2 the short edges.',
      'parts/*.dxf: each board from its own corner — OUTLINE, DRILL_D<diameter>_Z<depth> (face holes), EDGE_D<d>_Z<depth> (holes into an edge), LABEL.',
      'sheets/*.dxf: the boards nested on the sheet (SHEET) — sheet ' + F.opts.sheetW + ' x ' + F.opts.sheetH + ', kerf ' + F.opts.kerf + ', trim ' + F.opts.margin + '.',
      'gcode/*.nc: G-code (GRBL / Mach3), millimetres, Z0 = the top of the board; drills first (M0 to change each), then the outlines with a D' + F.opts.tool + ' cutter in passes of ' + F.opts.step + '. Check it in a simulator before cutting.',
      'Holes follow System 32: shelf pins D5 x 12 every 32 mm, 37 mm in; hinge cups D35 x 13; cam connectors D15 + D8.',
    ].join('\r\n') + '\r\n' });
    return out;
  }
  const baseName = () => String(A.host.fileName?.() || 'model').replace(/\.ifc$/i, '');

  function openDialog(guids = null) {
    const all = furniture();
    if (!all.length) { A.host.status(t('fu.none'), true); return; }
    F.which = guids;
    const which = el('select', { className: 'bc-input', 'data-fu-which': '' }, el('option', { value: '' }, t('fu.all', { n: all.length })), ...all.map((f, i) => el('option', { value: f.guid }, f.name || t('fu.unnamed', { n: i + 1 }))));
    if (guids?.length === 1) which.value = guids[0];
    const num = (k, min, max, step = 1) => el('input', { type: 'number', min, max, step, className: 'bc-input bc-num', ['data-fu-' + k]: '', value: String(F.opts[k]), style: 'width:5.5em' });
    const inp = { sheetW: num('sheetW', 300, 5000), sheetH: num('sheetH', 300, 3000), kerf: num('kerf', 0, 20, 0.5), margin: num('margin', 0, 100), tool: num('tool', 1, 25, 0.5), step: num('step', 0.5, 25, 0.5) };
    const out = el('div', { 'data-fu-out': '', style: 'max-height:48vh;overflow:auto' });
    const go = el('button', { type: 'button', className: 'btn-cc btn-sm-cc', 'data-fu-run': '' }, t('fu.run'));
    const bCsv = el('button', { type: 'button', className: 'btn-line btn-sm-cc', 'data-fu-csv': '', disabled: true }, t('fu.csv'));
    const bZip = el('button', { type: 'button', className: 'btn-line btn-sm-cc', 'data-fu-zip': '', disabled: true }, t('fu.zip'));
    const close = el('button', { type: 'button', className: 'btn-line btn-sm-cc' }, t('dv.close'));
    const th = (k) => el('th', { style: 'text-align:left;padding:2px 6px' }, t(k));
    const td = (v) => el('td', { style: 'padding:2px 6px' }, String(v));
    const show = (r) => {
      const warn = [];
      if (r.loose) warn.push(t('fu.warn.loose', { n: r.loose }));
      if (r.odd.length) warn.push(t('fu.warn.thick', { list: [...new Set(r.odd.map((p) => p.T))].join(', ') }));
      const skipped = r.sheets.flatMap((g) => g.skipped);
      if (skipped.length) warn.push(t('fu.warn.big', { n: skipped.length }));
      if (!r.panels.length) warn.push(t('fu.warn.none'));
      const cut = el('table', { style: 'border-collapse:collapse;font-size:13px;width:100%' },
        el('thead', {}, el('tr', {}, ...['fu.col.name', 'fu.col.qty', 'fu.col.l', 'fu.col.w', 'fu.col.t', 'fu.col.material', 'fu.col.band'].map(th))),
        el('tbody', {}, ...r.list.map((x) => el('tr', { 'data-fu-row': '' }, td(x.name), td(x.qty), td(x.L), td(x.W), td(x.T), td(x.material), td(x.banding || '—')))));
      const sh = el('table', { style: 'border-collapse:collapse;font-size:13px;width:100%;margin-top:8px' },
        el('thead', {}, el('tr', {}, ...['fu.col.material', 'fu.col.t', 'fu.col.sheets', 'fu.col.parts', 'fu.col.waste'].map(th))),
        el('tbody', {}, ...r.sheets.map((g) => el('tr', { 'data-fu-sheet': '' }, td(g.material), td(g.T), td(g.sheets.length), td(g.sheets.reduce((a, s) => a + s.placed.length, 0)), td(Math.round(g.waste * 100) + '%')))));
      const holes = [...r.holes.values()].reduce((a, h) => a + h.length, 0);
      out.replaceChildren(
        el('p', { style: 'margin:0 0 6px' }, t('fu.summary', { boards: r.panels.length, holes, sheets: r.sheets.reduce((a, g) => a + g.sheets.length, 0) })),
        ...warn.map((w) => el('p', { style: 'margin:0 0 4px;color:#d63031' }, '⚠ ' + w)), cut, sh);
      bCsv.disabled = bZip.disabled = !r.panels.length;
    };
    go.addEventListener('click', () => {
      const o = {};
      for (const [k, i] of Object.entries(inp)) o[k] = Math.max(Number(i.min), Number(i.value) || F.opts[k]);
      show(work(o, which.value ? [which.value] : null));
    });
    bCsv.addEventListener('click', () => { if (F.result) A.host.download(baseName() + ' — ' + t('fu.csvfile') + '.csv', new TextEncoder().encode(csv(csvRows(F.result))), 'text/csv'); });   // i18n-ignore: a file name
    bZip.addEventListener('click', () => { if (F.result) A.host.download(baseName() + ' — CNC.zip', zip(files()), 'application/zip'); });   // i18n-ignore: a file name
    const field = (k, input) => el('label', { style: 'white-space:nowrap' }, t(k) + ' ', input);
    const form = el('div', { style: 'display:flex;flex-direction:column;gap:10px;min-width:440px;max-width:820px' },
      el('h2', { style: 'font-size:16px;margin:0' }, t('fu.title')), el('p', { style: 'margin:0;font-size:13px;opacity:.8' }, t('fu.lead')),
      el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:center' }, which),
      el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:13px' },
        field('fu.sheet', inp.sheetW), '×', inp.sheetH, field('fu.kerf', inp.kerf), field('fu.margin', inp.margin), field('fu.tool', inp.tool), field('fu.step', inp.step), go),
      out, el('div', { style: 'display:flex;gap:8px;justify-content:flex-end' }, bCsv, bZip, close));
    const dlg = el('dialog', { className: 'bc-dialog', 'data-fu-dialog': '' }, form);
    close.addEventListener('click', () => { dlg.close(); dlg.remove(); });
    A.root.append(dlg);
    dlg.showModal();
    go.click();
  }

  const prevGroups = viewExtra.groups;
  viewExtra.groups = (kit) => {
    const mine = A?.ed() ? [kit.group('cnc', t('fu.group'), 0, [], [kit.small({ 'data-fu-open': '' }, t('fu.open'), () => openDialog(), 'bi-scissors')])] : [];
    return [...(prevGroups?.(kit) || []), ...mine];
  };
  A = modelUi.extend({ tools: [] });
  const api = { state: F, work, files, openDialog };
  if (typeof window !== 'undefined') window.bimcraftFurniture = api;   // for tests, and freeform-ui.js's Properties button
  return api;
}
