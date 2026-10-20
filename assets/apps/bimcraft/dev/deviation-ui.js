/* SPDX-License-Identifier: Apache-2.0 */
/**
 * deviation-ui.js — a scan against the design in BimCraft (KHADRAW P2), through model-ui.js extend(); mounted by views-ui.js.
 * Project browser › "As-built" [data-pb-asbuilt]: Compare the scan… [data-dv-open] (with a point cloud open: a file, or a
 * room scanned in the headset — scan-cloud.js) → dialog [data-dv-dialog]: tolerance (mm), how far a point may be from the
 * model and still belong to it (mm); Compare → the cloud coloured by deviation (green within, amber up to twice, red beyond,
 * slate-blue: no element near), the totals and the elements worst first [data-dv-row] (a row picks the element); Make issues
 * [data-dv-issues] → one issue per element out of tolerance and per cluster the model lacks (the Issues tab; BCF from there);
 * Plain colours [data-dv-clear]. IFC: none (the comparison is not kept in the model; the issues are, as BCF in the Issues tab).
 * Test hook: window.bimcraftDeviation = { state, run(opts), makeIssues() }.
 */
import { compareScan, issuesFrom, heatColors } from './deviation.js';
import { modelTriangles } from './res-views.js';
import { viewExtra } from './view-extra.js';
import { el } from './ui-util.js';

const KEY_SPAN = 2 ** 26;
const apply = (M, x, y, z) => [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]];

export function mountDeviation(modelUi, views) {
  const D = { result: null, opts: { tolerance: 20, reach: 300 }, centers: new Map() };
  let A = null;
  const t = (...a) => A.t(...a);
  const cloud = () => (typeof window !== 'undefined' ? window.bimcraftCloud : null);

  /** The model's elements as triangles in the viewer's space, and their middles. */
  function elements() {
    const model = A.host.model(), v = A.host.viewer();
    if (!model) return [];
    const mi = Math.floor((model.keyBase || 0) / KEY_SPAN), P = v?.modelMatrix ? [...v.modelMatrix(mi)] : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const els = modelTriangles(model, P);
    D.centers.clear();
    for (const e of els) { const T = e.tris, c = [0, 0, 0]; for (let i = 0; i < T.length; i += 3) { c[0] += T[i]; c[1] += T[i + 1]; c[2] += T[i + 2]; } const n = T.length / 3 || 1; D.centers.set(e.key, c.map((x) => x / n)); }
    return els;
  }
  /** The cloud's points in the viewer's space (doubles). */
  function scanPoints() {
    const c = cloud()?.points?.();
    if (!c) return null;
    const out = new Float64Array(c.n * 3), M = c.matrix;
    for (let i = 0; i < c.n; i++) { const p = apply(M, c.pos[i * 3], c.pos[i * 3 + 1], c.pos[i * 3 + 2]); out[i * 3] = p[0]; out[i * 3 + 1] = p[1]; out[i * 3 + 2] = p[2]; }
    return out;
  }
  const nameOf = (key) => {
    const model = A.host.model(), ifc = A.host.ifc?.(), id = key - (model?.keyBase || 0);
    let nm = '', cls = model?.classOf?.get(id) || '';
    try { const l = ifc.api.GetLine(model.modelID, id, false); nm = l?.Name?.value || ''; } catch (e) { /* no line */ }
    return [cls.replace(/^Ifc/, ''), nm].filter(Boolean).join(' ') + ' #' + id;
  };
  const guidOf = (key) => { const model = A.host.model(), ifc = A.host.ifc?.(); try { return ifc.api.GetLine(model.modelID, key - (model.keyBase || 0), false)?.GlobalId?.value || null; } catch (e) { return null; } };

  function run(opts = D.opts) {
    const pts = scanPoints();
    if (!pts) { A.host.status(t('dv.nocloud'), true); return null; }
    const els = elements();
    if (!els.length) { A.host.status(t('dv.nomodel'), true); return null; }
    D.opts = { ...D.opts, ...opts };
    D.result = compareScan(pts, els, { tolerance: D.opts.tolerance / 1000, reach: D.opts.reach / 1000 });
    cloud().paint(heatColors(D.result, pts.length / 3));
    return D.result;
  }
  function makeIssues() {
    if (!D.result || !viewExtra.issues) return 0;
    const words = { element: t('dv.issue.element'), elementText: t('dv.issue.elementText'), extra: t('dv.issue.extra'), extraText: t('dv.issue.extraText') };
    const list = issuesFrom(D.result, { name: nameOf, centerOf: (k) => D.centers.get(k) || null, words });
    for (const x of list) if (x.at) viewExtra.issues.add({ title: x.title, description: x.description, at: x.at, guids: x.key != null ? [guidOf(x.key)].filter(Boolean) : [] });
    A.host.status(t('dv.issues.made', { n: list.length }));
    return list.length;
  }

  function openDialog() {
    if (!cloud()?.has?.()) { A.host.status(t('dv.nocloud'), true); return; }
    const tol = el('input', { type: 'number', min: 1, max: 500, step: 1, className: 'bc-input bc-num', 'data-dv-tol': '', value: String(D.opts.tolerance) });
    const reach = el('input', { type: 'number', min: 20, max: 5000, step: 10, className: 'bc-input bc-num', 'data-dv-reach': '', value: String(D.opts.reach) });
    const out = el('div', { 'data-dv-out': '', style: 'max-height:46vh;overflow:auto' });
    const go = el('button', { type: 'button', className: 'btn-cc btn-sm-cc', 'data-dv-run': '' }, t('dv.run'));
    const mk = el('button', { type: 'button', className: 'btn-line btn-sm-cc', 'data-dv-issues': '', disabled: true }, t('dv.issues'));
    const clear = el('button', { type: 'button', className: 'btn-line btn-sm-cc', 'data-dv-clear': '' }, t('dv.clear'));
    const close = el('button', { type: 'button', className: 'btn-line btn-sm-cc' }, t('dv.close'));
    const pct = (a, b) => (b ? Math.round(a / b * 100) : 0) + '%';
    const mmS = (m) => Math.round(m * 1000) + ' mm';
    const show = (r) => {
      const s = r.stats;
      const legend = el('p', { style: 'margin:0 0 6px' },
        el('span', { style: 'color:#2ea043' }, '■ ' + t('dv.within', { tol: D.opts.tolerance }) + ' ' + pct(s.within, s.n)), '   ',
        el('span', { style: 'color:#f5a623' }, '■ ' + t('dv.near', { tol: D.opts.tolerance * 2 }) + ' ' + pct(s.near, s.n)), '   ',
        el('span', { style: 'color:#d63031' }, '■ ' + t('dv.beyond') + ' ' + pct(s.beyond, s.n)), '   ',
        el('span', { style: 'color:#5c6bc0' }, '■ ' + t('dv.outside') + ' ' + pct(s.outside, s.n)));
      const head = el('tr', {}, ...['dv.col.el', 'dv.col.n', 'dv.col.mean', 'dv.col.p95', 'dv.col.max', 'dv.col.over'].map((k) => el('th', { style: 'text-align:left;padding:2px 6px' }, t(k))));
      const rows = r.elements.slice(0, 200).map((e) => {
        const tr = el('tr', { 'data-dv-row': String(e.key), style: 'cursor:pointer' + (e.share > 0.1 ? ';color:#d63031' : '') },
          el('td', { style: 'padding:2px 6px' }, nameOf(e.key)), el('td', {}, String(e.n)), el('td', {}, mmS(e.mean)), el('td', {}, mmS(e.p95)), el('td', {}, mmS(e.max)), el('td', {}, pct(e.over, e.n)));
        tr.addEventListener('click', () => A.host.select([e.key]));
        return tr;
      });
      const extra = r.outside.clusters.length ? el('p', { style: 'margin:6px 0 0' }, t('dv.clusters', { n: r.outside.clusters.length })) : null;
      out.replaceChildren(legend, el('table', { style: 'border-collapse:collapse;font-size:13px;width:100%' }, el('thead', {}, head), el('tbody', {}, ...rows)), ...(extra ? [extra] : []));
      mk.disabled = !issuesFrom(r, {}).length;
    };
    go.addEventListener('click', () => {
      const r = run({ tolerance: Math.max(1, Number(tol.value) || 20), reach: Math.max(20, Number(reach.value) || 300) });
      if (r) show(r);
    });
    mk.addEventListener('click', () => { makeIssues(); mk.disabled = true; });
    clear.addEventListener('click', () => { cloud()?.paint(null); D.result = null; out.replaceChildren(); mk.disabled = true; });
    const form = el('div', { style: 'display:flex;flex-direction:column;gap:10px;min-width:420px;max-width:760px' },
      el('h2', { style: 'font-size:16px;margin:0' }, t('dv.title')), el('p', { style: 'margin:0;font-size:13px;opacity:.8' }, t('dv.lead')),
      el('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;align-items:center' },
        el('label', {}, t('dv.tol') + ' ', tol, ' mm'), el('label', {}, t('dv.reach') + ' ', reach, ' mm'), go),
      out, el('div', { style: 'display:flex;gap:8px;justify-content:flex-end' }, clear, mk, close));
    const dlg = el('dialog', { className: 'bc-dialog', 'data-dv-dialog': '' }, form);
    close.addEventListener('click', () => { dlg.close(); dlg.remove(); });
    A.root.append(dlg);
    dlg.showModal();
    if (D.result) show(D.result);
  }

  const prevGroups = viewExtra.groups;
  viewExtra.groups = (kit) => {
    const mine = A?.ed() ? [kit.group('asbuilt', t('dv.group'), 0, [], [kit.small({ 'data-dv-open': '' }, t('dv.open'), openDialog, 'bi-bullseye')])] : [];
    return [...(prevGroups?.(kit) || []), ...mine];
  };
  A = modelUi.extend({ tools: [] });
  if (typeof window !== 'undefined') window.bimcraftDeviation = { state: D, run, makeIssues, openDialog };   // for tests
  return { state: D, run, makeIssues };
}
