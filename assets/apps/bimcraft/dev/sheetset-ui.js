/* SPDX-License-Identifier: Apache-2.0 */
/**
 * sheetset-ui.js — the drawing set as a Thai office issues it (KHADRAW P1.5 round 3), through model-ui.js extend(); mounted
 * by views-ui.js. Project browser › "Drawing set" [data-pb-tbset]:
 *   Title block…   [data-ts-tb]     dialog [data-tb-dialog]: the style (Thai: a strip down the right of every sheet, or the
 *                                   program's own) and its facts — office, project, owner, site, architect and engineer with
 *                                   their licence numbers, designed / drawn / checked by
 *   Revisions…     [data-ts-rev]    dialog [data-rev-dialog]: the revisions (number, date, what changed); a sheet lists those
 *                                   whose clouds (Annotate › Cloud) are on its views, newest first
 *   Whole set PDF  [data-ts-pdf]    the drawing index, then every sheet ("sheet 3 / 12"), each at its own paper size
 *   Index PDF      [data-ts-index]  the drawing index alone
 * The drawing set's input (res-ui.js setInput) gets the clouds and the revisions (viewExtra.decorate). IFC: sheetset.js.
 * Test hook: window.bimcraftSheetSet = { api, printSet }.
 */
import { viewExtra } from './view-extra.js';
import { TB_FIELDS, readTitleBlock, saveTitleBlock, setTitleBlock, getTitleBlock, readRevisions, saveRevisions, indexRows } from './sheetset.js';
import { readNotes } from './notes.js';
import { readSheets } from './views-model.js';
import { composeSheet, indexSheet, setPdf } from './res-sheets.js';
import { ModelWriter } from './model-write.js';
import { el } from './ui-util.js';

export function mountSheetSet(modelUi, views) {
  let A = null;
  const t = (...a) => A.t(...a);
  const W = () => (A.ed() ? new ModelWriter(A.ed().W, A.ed().api, A.ed().mid) : null);
  const load = () => { const w = W(); if (!w) return; try { setTitleBlock(readTitleBlock(w)); } catch (e) { /* the program's own */ } };
  const done = () => { A.host.afterEdit?.(); load(); views.render?.(); };

  function dialog(attr, title, body, onSave, extra = []) {
    const err = el('p', { className: 'bc-input-err', role: 'alert' });
    const ok = el('button', { type: 'submit', className: 'btn-cc btn-sm-cc', 'data-ts-ok': '' }, t('model.v2.save'));
    const cancel = el('button', { type: 'button', className: 'btn-line btn-sm-cc' }, t('model.ff.cancel'));
    const form = el('form', { method: 'dialog', style: 'display:flex;flex-direction:column;gap:10px;min-width:360px;max-width:560px' },
      el('h2', { style: 'font-size:16px;margin:0' }, title), body, err, el('div', { style: 'display:flex;gap:8px;justify-content:flex-end' }, ...extra, cancel, ok));
    const dlg = el('dialog', { className: 'bc-dialog', [attr]: '' }, form);
    const end = () => { dlg.close(); dlg.remove(); };
    cancel.addEventListener('click', end);
    form.addEventListener('submit', (e) => { e.preventDefault(); const m = onSave(); if (m) { err.textContent = m; return; } end(); });
    A.root.append(dlg);
    dlg.showModal();
    return dlg;
  }

  function editTitleBlock() {
    const w = W(); if (!w) return;
    const I = readTitleBlock(w);
    const style = el('select', { className: 'bc-mb-select', 'data-tb-style': '' }, el('option', { value: 'thai' }, t('tb.style.thai')), el('option', { value: 'standard' }, t('tb.style.standard')));
    style.value = I.style;
    const inputs = Object.fromEntries(TB_FIELDS.map((k) => [k, el('input', { type: 'text', className: 'bc-input', 'data-tb': k, value: I[k] || '', maxLength: 160 })]));
    const grid = el('div', { style: 'display:grid;grid-template-columns:auto 1fr;gap:6px 10px;align-items:center' },
      el('label', {}, t('tb.style')), style, ...TB_FIELDS.flatMap((k) => [el('label', {}, t('tb.f.' + k)), inputs[k]]));
    dialog('data-tb-dialog', t('tb.dialog'), grid, () => {
      const info = { style: style.value };
      for (const k of TB_FIELDS) info[k] = inputs[k].value;
      try { A.ed().modelChange(saveTitleBlock(info), { label: t('tb.dialog'), verb: t('model.verb.changed') }); } catch (x) { return t(x.key || 'model.err.length'); }
      done();
      return null;
    });
  }

  function editRevisions() {
    const w = W(); if (!w) return;
    const list = readRevisions(w).map((r) => ({ ...r }));
    const body = el('div', { style: 'display:flex;flex-direction:column;gap:6px' });
    const rowsEl = el('div', { style: 'display:grid;grid-template-columns:3.5em 8.5em 1fr auto;gap:6px;align-items:center' });
    const draw = () => {
      rowsEl.replaceChildren(el('b', {}, t('tb.rev.n')), el('b', {}, t('tb.rev.date')), el('b', {}, t('tb.rev.text')), el('span'),
        ...list.flatMap((r, i) => {
          const n = el('input', { type: 'text', className: 'bc-input bc-num', 'data-rev-n': String(i), value: String(r.n), size: 3 });
          const d = el('input', { type: 'date', className: 'bc-input', 'data-rev-date': String(i), value: r.date });
          const x = el('input', { type: 'text', className: 'bc-input', 'data-rev-text': String(i), value: r.text, maxLength: 200 });
          n.addEventListener('change', () => { r.n = Number(n.value); });
          d.addEventListener('change', () => { r.date = d.value; });
          x.addEventListener('input', () => { r.text = x.value; });
          const del = el('button', { type: 'button', className: 'btn-line btn-sm-cc', 'aria-label': t('model.v2.delete'), onClick: () => { list.splice(i, 1); draw(); } }, '×');
          return [n, d, x, del];
        }));
    };
    const add = el('button', { type: 'button', className: 'btn-line btn-sm-cc', 'data-rev-add': '' }, t('tb.rev.add'));
    add.addEventListener('click', () => { list.push({ n: (list.reduce((m, r) => Math.max(m, Number(r.n) || 0), 0) + 1), date: new Date().toISOString().slice(0, 10), text: '' }); draw(); });
    draw();
    body.append(el('p', { style: 'margin:0;font-size:13px;opacity:.8' }, t('tb.rev.lead')), rowsEl, el('div', {}, add));
    dialog('data-rev-dialog', t('tb.revisions'), body, () => {
      try { A.ed().modelChange(saveRevisions(list), { label: t('tb.revisions'), verb: t('model.verb.changed') }); } catch (x) { return t(x.key || 'model.err.length'); }
      done();
      return null;
    });
  }

  /** The set: the index first, then every sheet numbered "i / n", each at its own paper. → { bytes, count } | null */
  function printSet({ index = true, download = true } = {}) {
    const w = W();
    const input = A.ask('sheetInput');
    if (!w || !input) { A.host.status(t('model.sh.nomodel'), true); return null; }
    if (views.calloutInput) input.callouts = views.calloutInput();
    load();
    const opts = A.ask('sheetOpts') || { paper: 'a3', units: A.units() };
    const specs = readSheets(w).sort((a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));
    if (!specs.length) { A.host.status(t('tb.nosheets'), true); return null; }
    const total = specs.length + (index ? 1 : 0), project = getTitleBlock().project || opts.project || '', date = new Date().toISOString().slice(0, 10);
    const sheets = [];
    if (index) {
      const rows = indexRows(specs, input.clouds || [], input.revisions || []);
      const ix = indexSheet(rows, { paper: specs[0].paper || opts.paper, project, date, number: t('tb.indexnumber') });
      ix.paper = specs[0].paper || opts.paper;
      sheets.push(ix);
    }
    specs.forEach((sp, i) => {
      const s = composeSheet({ ...sp, index: (i + 1 + (index ? 1 : 0)) + ' / ' + total }, input, { paper: sp.paper || opts.paper, units: opts.units || A.units(), project, date });
      s.paper = sp.paper || opts.paper;
      sheets.push(s);
    });
    const bytes = setPdf(sheets, { paper: sheets[0].paper, title: project || 'Drawing set' });   // i18n-ignore: a PDF title
    if (download) A.host.download(String(A.host.fileName?.() || 'model').replace(/\.ifc$/i, '') + ' — ' + t('tb.setfile') + '.pdf', bytes, 'application/pdf');   // i18n-ignore: a file name
    return { bytes, count: sheets.length };
  }
  function printIndex() {
    const w = W(), input = A.ask('sheetInput');
    if (!w || !input) return;
    const specs = readSheets(w);
    const s = indexSheet(indexRows(specs, input.clouds || [], input.revisions || []), { paper: specs[0]?.paper || 'a3', project: getTitleBlock().project, date: new Date().toISOString().slice(0, 10), number: t('tb.indexnumber') });
    A.host.download(t('tb.indextitle') + '.pdf', setPdf([s], { paper: specs[0]?.paper || 'a3', title: t('tb.indextitle') }), 'application/pdf');   // i18n-ignore: a file name
  }

  // the browser's group, after the 2D views'
  const prevGroups = viewExtra.groups;
  viewExtra.groups = (kit) => {
    const mine = A?.ed() ? [kit.group('tbset', t('tb.group'), 0, [], [
      kit.small({ 'data-ts-tb': '' }, t('tb.dialog'), editTitleBlock, 'bi-card-heading'),
      kit.small({ 'data-ts-rev': '' }, t('tb.revisions'), editRevisions, 'bi-cloud'),
      kit.small({ 'data-ts-pdf': '' }, t('tb.printset'), () => printSet(), 'bi-printer'),
      kit.small({ 'data-ts-index': '' }, t('tb.printindex'), printIndex, 'bi-list-ol'),
    ])] : [];
    return [...(prevGroups?.(kit) || []), ...mine];
  };
  // the drawing set's input: the clouds on each view and the revisions
  const prevDecorate = viewExtra.decorate;
  viewExtra.decorate = (input) => {
    prevDecorate?.(input);
    const w = W();
    if (!w) return;
    try { input.clouds = readNotes(w).filter((n) => n.kind === 'cloud').map((n) => ({ view: n.view, rev: n.text })); } catch (e) { input.clouds = []; }
    try { input.revisions = readRevisions(w); } catch (e) { input.revisions = []; }
  };

  A = modelUi.extend({ tools: [], refresh() { load(); } });
  const api = { printSet, editTitleBlock, editRevisions };
  if (typeof window !== 'undefined') window.bimcraftSheetSet = { api: A, printSet, editTitleBlock, editRevisions };   // for tests
  return api;
}
