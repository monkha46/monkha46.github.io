/* SPDX-License-Identifier: Apache-2.0 */
/**
 * sectionview-ui.js — sections, elevations and drafting views on the plan's canvas (KHADRAW P1.5 round 2), through model-ui.js
 * extend(); mounted by views-ui.js after drafting-ui.js and notes-ui.js, so their tools draw on these views as on a plan.
 *
 *   Project browser › "2D views to draw on" [data-pb-v2d]: the four elevations [data-v2-open="elev:<side>"], every section line
 *       [data-v2-open="section:<GlobalId>"], the drafting views [data-v2-open="detail:<id>"] (with Edit [data-v2-edit]) and
 *       New drafting view [data-v2-new]. Opening one shows it where the plan is: what the section cuts filled and outlined, what it
 *       sees in thin lines (res-views.js projectView, as the sheets draw it), the levels as dash-dot lines with their names; a
 *       drafting view is a blank sheet of paper. A chip on the model bar [data-v2-chip] names it, with Back to plan [data-v2-back].
 *   On such a view only Select, Annotate (drafting, notes) and Move work; the building tools are hidden. Clicks snap to the
 *   view's corners and lines. Going to a plan (the browser, the level list) closes it.
 *   Sheets: each elevation and section carries its drafting and notes (view.anno); drafting views go on sheets (kind 'detail').
 * View keys: 'elev:<side>', 'section:<GlobalId>', 'detail:<id>' (view-extra.js). IFC: detailviews.js, drafting.js, notes.js.
 * Test hook: window.bimcraftViews2d = { state, api, open, close }.
 */
import { viewExtra } from './view-extra.js';
import { readDetails, saveDetail, deleteDetail } from './detailviews.js';
import { readDrafting, draftingItem } from './drafting.js';
import { readNotes, noteScene } from './notes.js';
import { readSectionLines, sectionDir } from './res-sheets.js';
import { modelTriangles, projectView, elevationDirs } from './res-views.js';
import { viewerToPlan } from './model-plan.js';
import { readLevels } from './model-levels.js';
import { ModelWriter } from './model-write.js';
import { fmtLen } from './model-units.js';
import { el } from './ui-util.js';
import { PEN_KEYS, PEN_DEFAULTS, readPens, savePens, setPens, getPens } from './pens.js';
import { PlanView } from './model-planview.js';
const SHOW_PENS_KEY = 'bimcraft.showPens';
try { PlanView.showPens = localStorage.getItem(SHOW_PENS_KEY) === '1'; } catch (e) { PlanView.showPens = false; }

const SIDES = ['north', 'east', 'south', 'west'];
const TOOLS_OK = new Set(['select', 'dline', 'dpoly', 'drect', 'dhatch', 'dmove', 'ntext', 'nleader', 'ndim', 'ncloud', 'nmove']);
const MAX_SNAP = 4000;
const CSS = ['.khd-v2d [data-mtool]' + [...TOOLS_OK].map((x) => ':not([data-mtool="' + x + '"])').join('') + '{display:none!important}',
  '.khd-v2d [data-res-tools],.khd-v2d [data-modify-tools],.khd-v2d [data-model-viewkind]{display:none!important}',
  '.khd-v2-chip{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:4px 0;font-weight:600}'].join('\n');

export function mountViews2d(modelUi, views) {
  const V = { open: null, details: [], secs: [], cache: null };
  let A = null;
  const t = (...a) => A.t(...a);
  const W = () => (A.ed() ? new ModelWriter(A.ed().W, A.ed().api, A.ed().mid) : null);
  const L = (mm) => fmtLen(mm, A.units());
  const read = () => {
    const w = W();
    try { V.details = w ? readDetails(w) : []; } catch (e) { V.details = []; }
    try { V.secs = w ? readSectionLines(w) : []; } catch (e) { V.secs = []; }
    try { if (w) setPens(readPens(w)); } catch (e) { /* the defaults */ }
  };
  if (typeof document !== 'undefined' && !document.getElementById('khd-v2d-css')) document.head.append(el('style', { id: 'khd-v2d-css' }, CSS));

  // ---- names ----
  function nameOf(key) {
    const m = /^(elev|section|detail):(.+)$/.exec(String(key || ''));
    if (!m) return null;
    if (m[1] === 'elev') return t('res.sh.elev.' + m[2]);
    if (m[1] === 'section') { const s = V.secs.find((x) => x.guid === m[2]); return s ? t('res.sec.name', { name: s.name }) : t('model.co.gone'); }
    const d = V.details.find((x) => x.id === m[2]);
    return d ? d.name : t('model.co.gone');
  }
  viewExtra.name = nameOf;

  // ---- the view's drawing: what projectView makes of the model, as the sheets draw it ----
  const ground = (levels) => levels.find((l) => Math.abs(l.elevation) < 1) || levels[0];
  function project(key) {
    const model = A.host.model(), ifc = A.host.ifc?.(), w = W();
    if (!model || !ifc || !w) return null;
    const ver = (A.ed()?.changes?.length || 0) + ':' + (model.modelID ?? '');
    if (V.cache && V.cache.key === key && V.cache.ver === ver && V.cache.model === model) return V.cache.view;
    const levels = readLevels(w);
    const C = ifc.api.GetCoordinationMatrix(model.modelID);
    let view = null, base = 0;
    const m = /^(elev|section):(.+)$/.exec(key);
    if (m?.[1] === 'elev' && levels.length) {
      const g = ground(levels);
      view = projectView(modelTriangles(model, viewerToPlan(C, w.storeyWorld(g.id))), { dir: elevationDirs[m[2]] });
      base = g.elevation;
    } else if (m?.[1] === 'section') {
      const sl = V.secs.find((x) => x.guid === m[2]);
      if (sl) {
        const { o, dir } = sectionDir(sl);
        view = projectView(modelTriangles(model, viewerToPlan(C, w.storeyWorld(sl.storey))), { dir, cut: { o }, far: sl.depth });
        base = levels.find((l) => l.id === sl.storey)?.elevation || 0;
      }
    }
    if (view) view.levelMarks = levels.map((l) => ({ name: l.name, y: l.elevation - base, elevation: l.elevation }));
    V.cache = { key, ver, model, view };
    return view;
  }

  // ---- what the canvas shows while one of these is open ----
  function addScene(scene) {
    // what a plan cuts, by class: the sheets give the structure its heavier pen (pens.js cutPen)
    const cls = A.host.model?.()?.classOf, kb = A.kb();
    if (cls) for (const c of scene.cut || []) if (!c.cls && c.key != null) c.cls = cls.get(c.key - kb) || '';
    const key = viewExtra.key;
    if (!key) return;
    if (V.open && (A.S.level !== V.open.level || A.S.kind !== V.open.kind || (A.S.callout || null) !== V.open.callout)) { close(false); return; }   // a plan was chosen
    const keepDims = (scene.dims || []).filter((d) => d.note);
    Object.assign(scene, { walls: [], wallEdges: null, symbols: [], rooms: [], grids: [], above: [], below: [], cut: [], underlay: null, crop: null, cloud: null, dims: keepDims, v2d: key });
    const pv = A.pv(); if (pv) pv.markers = [];
    if (/^detail:/.test(key)) { scene.ratio = V.details.find((d) => 'detail:' + d.id === key)?.scale || 10; return; }
    const v = project(key);
    if (!v) return;
    scene.cut = (v.cuts || []).map((c) => {
      const loops = c.loops.map((l) => l.flatMap((p) => [p[0], p[1]]));
      const segs = [];
      for (const l of c.loops) for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; segs.push(a[0], a[1], b[0], b[1]); }
      return { key: c.key, cls: c.cls, loops, segs };
    });
    const segs = [];
    for (const l of v.lines || []) segs.push(l[0], l[1], l[2], l[3]);
    scene.below = [{ key: null, segs }];
    const b = v.bounds;
    if (b) {
      const notes = scene.notes || (scene.notes = []);
      for (const lv of v.levelMarks || []) {
        if (lv.y < b.y0 - 5000 || lv.y > b.y1 + 5000) continue;
        notes.push({ key: null, kind: 'level', lines: [[[b.x0 - 600, lv.y], [b.x1 + 1200, lv.y]]], arrows: [], texts: [{ s: lv.name + '  ' + (lv.elevation >= 0 ? '+' : '') + (lv.elevation / 1000).toFixed(2), at: [b.x1 + 1200, lv.y], line: 0, h: 2.5, rot: 0, align: 'left', gap: 1 }] });
      }
    }
    scene.ratio = 50;
  }
  /** Snapping on these views: their corners and lines, not the level's walls. */
  function snapCtx(ctx) {
    if (!viewExtra.key) return;
    ctx.walls = []; ctx.gridPoints = []; ctx.lines = []; ctx.points = ctx.points || [];
    const v = /^detail:/.test(viewExtra.key) ? null : project(viewExtra.key);
    if (!v) return;
    const pts = [], lines = [];
    for (const c of v.cuts || []) for (const l of c.loops) for (let i = 0; i < l.length && pts.length < MAX_SNAP; i++) { pts.push(l[i]); lines.push({ a: l[i], b: l[(i + 1) % l.length] }); }
    for (const l of v.lines || []) { if (pts.length >= MAX_SNAP) break; pts.push([l[0], l[1]], [l[2], l[3]]); lines.push({ a: [l[0], l[1]], b: [l[2], l[3]] }); }
    ctx.points = [...ctx.points, ...pts];
    ctx.lines = lines.slice(0, MAX_SNAP);
  }

  // ---- opening and closing ----
  function chip(on) {
    A.root.querySelector('[data-v2-chip]')?.remove();
    A.root.classList.toggle('khd-v2d', !!on);
    if (!on) return;
    const bar = A.root.querySelector('[data-modelbar]');
    if (!bar) return;
    bar.prepend(el('div', { className: 'khd-v2-chip', 'data-v2-chip': '' },
      el('span', {}, '📐 ' + nameOf(viewExtra.key)),
      el('button', { type: 'button', className: 'btn-line btn-sm-cc', 'data-v2-back': '', onClick: () => close() }, t('model.v2.back'))));
  }
  function open(key) {
    if (!/^(elev|section|detail):/.test(String(key))) return;
    if (!A.S.on) modelUi.show(true);
    read();
    viewExtra.key = key;
    V.open = { key, level: A.S.level, kind: A.S.kind, callout: A.S.callout || null };
    V.cache = null;
    if (!TOOLS_OK.has(A.S.tool)) A.setTool('select');
    chip(true);
    A.rangeChanged();
    requestAnimationFrame(() => A.fitPlan());
    views.render?.();
  }
  function close(refit = true) {
    if (!viewExtra.key) return;
    viewExtra.key = null; V.open = null;
    chip(false);
    A.rangeChanged();
    if (refit) requestAnimationFrame(() => A.fitPlan());
    views.render?.();
  }

  // ---- drafting views: new, rename / scale, delete ----
  function editDetail(id) {
    const d = id ? V.details.find((x) => x.id === id) : null;
    const name = el('input', { type: 'text', className: 'bc-input', 'data-v2-name': '', value: d ? d.name : t('model.v2.newname', { n: V.details.length + 1 }), maxLength: 80 });
    const scale = el('input', { type: 'text', className: 'bc-input bc-num', 'data-v2-scale': '', value: String(d ? d.scale || 10 : 10), size: 6 });
    const err = el('p', { className: 'bc-input-err', role: 'alert' });
    const ok = el('button', { type: 'submit', className: 'btn-cc btn-sm-cc', 'data-v2-ok': '' }, d ? t('model.v2.save') : t('model.v2.create'));
    const del = d ? el('button', { type: 'button', className: 'btn-line btn-sm-cc', 'data-v2-del': '' }, t('model.v2.delete')) : null;
    const cancel = el('button', { type: 'button', className: 'btn-line btn-sm-cc' }, t('model.ff.cancel'));
    const form = el('form', { method: 'dialog', style: 'display:flex;flex-direction:column;gap:8px;min-width:300px' },
      el('h2', { style: 'font-size:16px;margin:0' }, d ? t('model.v2.edit') : t('model.v2.new')),
      el('label', {}, t('model.v2.name')), name, el('label', { style: 'display:flex;gap:8px;align-items:center' }, t('model.v2.scale'), '1 :', scale), err,
      el('div', { style: 'display:flex;gap:8px;justify-content:flex-end' }, ...(del ? [del] : []), cancel, ok));
    const dlg = el('dialog', { className: 'bc-dialog', 'data-v2-dialog': '' }, form);
    const end = () => { dlg.close(); dlg.remove(); };
    cancel.addEventListener('click', end);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const sc = Number(String(scale.value).replace(',', '.'));
      let r;
      try { r = A.ed().modelChange(saveDetail({ id: d?.id, name: name.value, scale: sc }), { label: t('model.v2.detail'), verb: d ? t('model.verb.changed') : t('model.verb.placed') }); }
      catch (x) { err.textContent = t(x.key || 'model.err.length'); return; }
      end();
      A.host.afterEdit?.();
      read(); views.render?.();
      if (!d && r?.detail) open('detail:' + r.detail);
      else if (viewExtra.key === 'detail:' + d?.id) { chip(true); A.rangeChanged(); }
    });
    del?.addEventListener('click', () => {
      try { A.ed().modelChange(deleteDetail(d.id), { label: d.name, verb: t('model.verb.deleted') }); } catch (x) { err.textContent = t(x.key || 'model.err.gone'); return; }
      end();
      if (viewExtra.key === 'detail:' + d.id) close();
      A.host.afterEdit?.();
      read(); views.render?.();
    });
    A.root.append(dlg);
    dlg.showModal();
    name.focus();
  }

  // ---- the pens (line weights by category) ----
  function editPens() {
    const P = getPens();
    const inputs = PEN_KEYS.map((k) => el('input', { type: 'text', className: 'bc-input bc-num', 'data-pen': k, value: String(P[k]), size: 5 }));
    const err = el('p', { className: 'bc-input-err', role: 'alert' });
    const ok = el('button', { type: 'submit', className: 'btn-cc btn-sm-cc', 'data-pens-ok': '' }, t('model.v2.save'));
    const reset = el('button', { type: 'button', className: 'btn-line btn-sm-cc', 'data-pens-reset': '' }, t('model.pens.reset'));
    const cancel = el('button', { type: 'button', className: 'btn-line btn-sm-cc' }, t('model.ff.cancel'));
    const grid = el('div', { style: 'display:grid;grid-template-columns:1fr auto auto;gap:6px 10px;align-items:center' },
      ...PEN_KEYS.flatMap((k, i) => [el('label', {}, t('model.pens.' + k)), inputs[i], el('span', {}, t('model.pens.mm'))]));
    const form = el('form', { method: 'dialog', style: 'display:flex;flex-direction:column;gap:10px;min-width:320px' },
      el('h2', { style: 'font-size:16px;margin:0' }, t('model.pens.title')), el('p', { style: 'margin:0;font-size:13px;opacity:.8' }, t('model.pens.lead')), grid, err,
      el('div', { style: 'display:flex;gap:8px;justify-content:flex-end' }, reset, cancel, ok));
    const dlg = el('dialog', { className: 'bc-dialog', 'data-pens-dialog': '' }, form);
    const end = () => { dlg.close(); dlg.remove(); };
    cancel.addEventListener('click', end);
    reset.addEventListener('click', () => PEN_KEYS.forEach((k, i) => { inputs[i].value = String(PEN_DEFAULTS[k]); }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const p = {};
      for (const [i, k] of PEN_KEYS.entries()) {
        const v = Number(String(inputs[i].value).replace(',', '.'));
        if (!(Number.isFinite(v) && v >= 0.05 && v <= 3)) { err.textContent = t('model.pens.bad'); inputs[i].focus(); return; }
        p[k] = v;
      }
      try { const r = A.ed().modelChange(savePens(p), { label: t('model.pens.title'), verb: t('model.verb.changed') }); setPens(r.pens); } catch (x) { err.textContent = t(x.key || 'model.pens.bad'); return; }
      end();
      A.host.afterEdit?.();
    });
    A.root.append(dlg);
    dlg.showModal();
  }

  // ---- the project browser's group ----
  viewExtra.groups = ({ group, row, small }) => {
    if (!A?.ed()) return [];
    read();
    const cur = (k) => (viewExtra.key === k ? 'true' : null);
    const rows = [
      ...SIDES.map((s) => row({ 'data-v2-open': 'elev:' + s, 'aria-current': cur('elev:' + s) }, t('res.sh.elev.' + s), () => open('elev:' + s))),
      ...V.secs.map((s) => row({ 'data-v2-open': 'section:' + s.guid, 'aria-current': cur('section:' + s.guid) }, t('res.sec.name', { name: s.name }), () => open('section:' + s.guid))),
      ...V.details.map((d) => row({ 'data-v2-open': 'detail:' + d.id, 'aria-current': cur('detail:' + d.id) }, d.name + (d.scale ? '  1:' + d.scale : ''), () => open('detail:' + d.id),
        el('button', { type: 'button', className: 'bc-pb-ic', 'data-v2-edit': d.id, title: t('model.v2.edit'), 'aria-label': t('model.v2.edit'), onClick: (e) => { e.stopPropagation(); editDetail(d.id); } }, el('i', { className: 'bi bi-pencil', 'aria-hidden': 'true' })))),
    ];
    return [group('v2d', t('model.v2.title'), rows.length, rows, [small({ 'data-v2-new': '' }, t('model.v2.new'), () => editDetail(null), 'bi-plus-lg'), small({ 'data-v2-pens': '' }, t('model.pens.title'), () => editPens(), 'bi-pen'),
      small({ 'data-v2-showpens': '', 'aria-pressed': PlanView.showPens ? 'true' : 'false' }, t(PlanView.showPens ? 'model.pens.screen.off' : 'model.pens.screen.on'), () => {
        PlanView.showPens = !PlanView.showPens;
        try { localStorage.setItem(SHOW_PENS_KEY, PlanView.showPens ? '1' : '0'); } catch (e) { /* this time only */ }
        A.pv()?.render(); views.render?.();
      }, 'bi-border-width')])];
  };

  // ---- the drawing set: each view's drafting and notes; the drafting views ----
  viewExtra.decorate = (input) => {
    const w = W();
    if (!w) return;
    read();
    let dr = [], nt = [];
    try { dr = readDrafting(w); } catch (e) { dr = []; }
    try { nt = readNotes(w); } catch (e) { nt = []; }
    const annoFor = (key) => {
      const ds = dr.filter((d) => d.view === key), ns = nt.filter((n) => n.view === key);
      if (!ds.length && !ns.length) return null;
      const sc = noteScene(ns, L);
      return { drafting: ds.map((d) => draftingItem(d, d.id)), notes: sc.notes, dims: sc.dims };
    };
    for (const e of input.elevations || []) { const a = annoFor('elev:' + e.ref); if (a && e.view) e.view.anno = a; }
    for (const s of input.sections || []) { const a = annoFor('section:' + s.ref); if (a && s.view) s.view.anno = a; }
    input.details = V.details.map((d) => ({ ref: d.id, title: d.name, scene: { ...(annoFor('detail:' + d.id) || { drafting: [], notes: [], dims: [] }), scale: d.scale } }));
  };

  A = modelUi.extend({
    tools: [],
    scene: (scene) => addScene(scene),
    snapCtx,
    toolChanged(name) { if (viewExtra.key && !TOOLS_OK.has(name)) { A.host.status(t('model.v2.notool'), true); A.setTool('select'); } },
    refresh() { read(); if (viewExtra.key && !nameOf(viewExtra.key)) close(); },
  });
  // the drawing set's plans are made through sceneFor: never with one of these views shown in their place
  const sceneFor0 = A.sceneFor;
  A.sceneFor = (...args) => { const k = viewExtra.key; viewExtra.key = null; try { return sceneFor0(...args); } finally { viewExtra.key = k; } };
  const api = { state: V, open, close, editPens };
  if (typeof window !== 'undefined') window.bimcraftViews2d = { state: V, api: A, open, close };   // for tests
  return api;
}
