/* SPDX-License-Identifier: Apache-2.0 */
/**
 * notes-ui.js — notes on the plan (KHADRAW P1.5), through model-ui.js extend(); mounted by views-ui.js beside drafting-ui.js,
 * which says which view is shown (a floor plan, a ceiling plan or a callout). Tools (added to the model bar's Annotate menu):
 *   Text       [data-mtool="ntext"]    a click where it starts, then the text (several lines; Thai or anything) and its height
 *   Leader     [data-mtool="nleader"]  a click on what it points at, a click (or two) for its bend and end — Enter, a
 *                                      double-click or the third click finishes —, then its text
 *   Dimension  [data-mtool="ndim"]     two clicks for what it measures, a third for where the line goes (the measured length;
 *                                      Properties can give it a text of its own)
 *   Cloud      [data-mtool="ncloud"]   a revision cloud (round 3): two corners round what changed, then its revision's number
 *                                      (the latest revision of the project offered)
 *   Move       [nmove]                 from Properties: two points
 * Each is one undo step; Delete and Properties (text, height, rotation, offset, Move) through the plan's own selection.
 * IFC: notes.js. Test hook: window.bimcraftNotes = { state, api }.
 */
import { readNotes, addNote, changeNotes, moveNotes, removeNotes, noteScene, NOTE_HEIGHT } from './notes.js';
import { ModelWriter } from './model-write.js';
import { fmtLen } from './model-units.js';
import { el } from './ui-util.js';
import { t as tr } from './i18n.js';
import { readRevisions } from './sheetset.js';

const TOOLS = ['ntext', 'nleader', 'ndim', 'ncloud', 'nmove'];
export const HEIGHTS = [1.8, 2.5, 3.5, 5, 7];   // mm on paper: the usual pens for notes, labels, titles

export function mountNotes(modelUi, views) {
  const N = { items: [], pts: [], at: null, height: NOTE_HEIGHT, move: null, reselect: null };
  let A = null;
  const t = (...a) => A.t(...a);
  const W = () => (A.ed() ? new ModelWriter(A.ed().W, A.ed().api, A.ed().mid) : null);
  const L = (mm) => fmtLen(mm, A.units());
  const levelGuid = () => A.S.data?.levels.find((l) => l.id === A.S.level)?.guid || null;

  // the tools' buttons, in the Annotate menu (extend() wires every [data-mtool] it finds)
  const menu = document.querySelector('[data-annot-tools] .bc-mb-menu');
  if (menu) {
    for (const [tool, icon] of [['ntext', 'bi-fonts'], ['nleader', 'bi-arrow-up-left'], ['ndim', 'bi-rulers'], ['ncloud', 'bi-cloud']]) {
      if (menu.querySelector(`[data-mtool="${tool}"]`)) continue;
      menu.append(el('button', { type: 'button', className: 'bc-tool', 'data-mtool': tool, 'aria-pressed': 'false', title: tr('model.nt.' + tool + '.title') },
        el('i', { className: 'bi ' + icon, 'aria-hidden': 'true' }), el('span', {}, tr('model.nt.' + tool))));
    }
  }

  /** Ask for a note's text (several lines) and height: → { text, height } | null. */
  function askText({ text = '', height = N.height } = {}) {
    return new Promise((resolve) => {
      const ta = el('textarea', { className: 'bc-input', rows: 3, 'data-nt-text': '', style: 'width:100%;min-width:280px;font-size:15px' });
      ta.value = text;
      const hs = el('select', { className: 'bc-mb-select', 'data-nt-height': '' }, ...HEIGHTS.map((h) => el('option', { value: String(h), selected: Math.abs(h - height) < 1e-6 }, t('model.nt.mm', { h }))));
      const okB = el('button', { type: 'submit', className: 'btn-cc btn-sm-cc', 'data-nt-ok': '' }, t('model.nt.ok'));
      const noB = el('button', { type: 'button', className: 'btn-line btn-sm-cc' }, t('model.ff.cancel'));
      const form = el('form', { method: 'dialog', style: 'display:flex;flex-direction:column;gap:8px' },
        el('label', {}, t('model.nt.text')), ta,
        el('label', { style: 'display:flex;gap:8px;align-items:center' }, t('model.nt.height'), hs),
        el('div', { style: 'display:flex;gap:8px;justify-content:flex-end' }, noB, okB));
      const dlg = el('dialog', { className: 'bc-dialog', 'data-nt-dialog': '' }, form);
      let done = false;
      const end = (v) => { if (done) return; done = true; dlg.close(); dlg.remove(); resolve(v); };
      form.addEventListener('submit', (e) => { e.preventDefault(); const s = ta.value.replace(/\s+$/g, ''); end(s.trim() ? { text: s, height: Number(hs.value) } : null); });
      noB.addEventListener('click', () => end(null));
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); end(null); });
      ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); } });
      A.root.append(dlg);
      dlg.showModal();
      ta.focus();
    });
  }

  function commit(spec, label) {
    const view = views.viewKey(), level = levelGuid();
    if (!view || !level) return;
    A.commit(addNote({ ...spec, view, level }), { label, verb: t('model.verb.drew') });
  }
  const snap = (p, e) => A.snapFrom(p, e, N.pts[N.pts.length - 1] || null).p;
  /** The perpendicular offset of point q from the line a → b (+ = left). */
  const offsetOf = (a, b, q) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / d; };

  async function finishLeader() {
    const pts = N.pts.slice();
    N.pts = []; A.drawOverlay();
    if (pts.length < 2) return;
    const r = await askText();
    if (r) { N.height = r.height; commit({ kind: 'leader', pts, text: r.text, height: r.height }, t('model.nt.nleader')); }
  }
  async function point(q) {
    const tool = A.S.tool;
    if (tool === 'ntext') {
      const r = await askText();
      if (r) { N.height = r.height; commit({ kind: 'text', pts: [q], text: r.text, height: r.height }, t('model.nt.ntext')); }
      return;
    }
    if (tool === 'nleader') {
      const l = N.pts[N.pts.length - 1];
      if (l && Math.hypot(q[0] - l[0], q[1] - l[1]) < 1) return;
      N.pts.push(q);
      if (N.pts.length >= 3) await finishLeader();
      return;
    }
    if (tool === 'ncloud') {
      if (!N.pts.length) { N.pts = [q]; return; }
      const a = N.pts[0];
      N.pts = [];
      if (Math.abs(q[0] - a[0]) < 10 || Math.abs(q[1] - a[1]) < 10) { A.host.status(t('model.err.note.short'), true); return; }
      let last = 1;
      try { const revs = readRevisions(W()); if (revs.length) last = revs[revs.length - 1].n; } catch (e) { /* 1 */ }
      const r = await askText({ text: String(last) });
      if (r) commit({ kind: 'cloud', pts: [a, [q[0], a[1]], q, [a[0], q[1]]], text: r.text.trim(), height: r.height }, t('model.nt.ncloud'));
      return;
    }
    if (tool === 'ndim') {
      if (N.pts.length < 2) {
        if (N.pts.length === 1 && Math.hypot(q[0] - N.pts[0][0], q[1] - N.pts[0][1]) < 10) { A.host.status(t('model.err.note.short'), true); return; }
        N.pts.push(q); return;
      }
      const [a, b] = N.pts;
      N.pts = [];
      commit({ kind: 'dim', pts: [a, b], offset: offsetOf(a, b, q), height: N.height }, t('model.nt.ndim'));
    }
  }

  // ---- the plan scene: this view's notes (texts and leaders; dimensions with the walls') ----
  function addScene(scene) {
    const key = views.viewKey(), r = A.viewRange?.();
    if (!key || [...(r?.hiddenClasses || [])].some((c) => c.toLowerCase() === 'ifcannotation')) return;
    const k = A.kb(), mine = N.items.filter((n) => n.view === key);
    const sc = noteScene(mine, L);
    const keyOf = (g) => { const n = mine.find((x) => x.guid === g); return n ? k + n.id : null; };
    scene.notes = sc.notes.map((n) => ({ ...n, key: keyOf(n.guid) }));
    scene.dims = [...(scene.dims || []), ...sc.dims.map((d) => ({ ...d, key: keyOf(d.guid) }))];
    scene.ratio = r?.scale || 100;
  }
  function overlay(o) {
    const tool = A.S.tool;
    if (!TOOLS.includes(tool)) return;
    const at = N.at;
    if (at) o.snap = { p: at, kind: 'free' };
    if (tool === 'nmove') {
      if (N.move?.a && at) { o.points.push(N.move.a); o.dashed.push([N.move.a[0], N.move.a[1], at[0], at[1]]); o.hud = { p: at, text: L(Math.hypot(at[0] - N.move.a[0], at[1] - N.move.a[1])) }; }
      return;
    }
    for (const q of N.pts) o.points.push(q);
    if (tool === 'ncloud') {
      if (N.pts.length && at) { const a = N.pts[0]; o.dashed.push([a[0], a[1], at[0], a[1]], [at[0], a[1], at[0], at[1]], [at[0], at[1], a[0], at[1]], [a[0], at[1], a[0], a[1]]); }
      if (at) o.hud = { p: at, text: t(N.pts.length ? 'model.nt.hud.cloud2' : 'model.nt.hud.cloud1') };
      return;
    }
    if (tool === 'ndim') {
      if (N.pts.length === 1 && at) { o.lines.push([N.pts[0][0], N.pts[0][1], at[0], at[1]]); o.hud = { p: at, text: L(Math.hypot(at[0] - N.pts[0][0], at[1] - N.pts[0][1])) }; }
      if (N.pts.length === 2 && at) {
        const [a, b] = N.pts;
        o.dims = [{ a, b, off: offsetOf(a, b, at), text: L(Math.hypot(b[0] - a[0], b[1] - a[1])) }];
        o.hud = { p: at, text: t('model.nt.hud.dimoff') };
      }
      return;
    }
    const pts = at ? [...N.pts, at] : N.pts;
    for (let i = 1; i < pts.length; i++) o.lines.push([pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]]);
    if (at) o.hud = { p: at, text: t(tool === 'ntext' ? 'model.nt.hud.text' : N.pts.length ? 'model.nt.hud.leader2' : 'model.nt.hud.leader1') };
  }

  /** Notes have no 3D shape, so the reload after a change drops them from the pick: pick them again once the model is back. */
  function reselectLater(ks) {
    N.reselect = ks;
    const go = (n) => setTimeout(() => {
      if (N.reselect !== ks) return;
      if ((A.S.busy || A.S.reloading || A.S.queue?.length) && n < 600) { go(n + 1); return; }
      N.reselect = null;
      const have = new Set(N.items.map((x) => A.kb() + x.id));
      A.host.select(ks.filter((k) => have.has(k)));
    }, 50);
    go(0);
  }
  const change = (op, meta) => { const ks = A.selectedKeys(); A.commit(op, meta); reselectLater(ks); };
  const kindName = (n) => t('model.nt.' + (n.kind === 'dim' ? 'ndim' : n.kind === 'leader' ? 'nleader' : n.kind === 'cloud' ? 'ncloud' : 'ntext'));

  // ---- Properties ----
  function props(items, kit) {
    const list = items.map((x) => N.items.find((n) => n.guid === x.guid)).filter(Boolean);
    if (!list.length) return null;
    const guids = list.map((n) => n.guid), n0 = list[0], one = kit.one(list.length === 1 ? kindName(n0) : t('model.nt.many', { n: list.length }));
    if (list.length === 1) {
      const ta = el('textarea', { className: 'bc-input', rows: 3, 'data-mp-nttext': '', style: 'width:100%;font-size:14px', placeholder: n0.kind === 'dim' ? t('model.nt.measured') : '' });
      ta.value = n0.text;
      ta.addEventListener('change', () => { const s = ta.value.replace(/\s+$/g, ''); if (!s.trim() && n0.kind !== 'dim') { A.host.status(t('model.err.note.text'), true); ta.value = n0.text; return; } change(changeNotes(guids, { text: s }), one); });
      kit.field(t('model.nt.text'), ta);
    }
    kit.field(t('model.nt.height'), kit.select(HEIGHTS.map((h) => [String(h), t('model.nt.mm', { h })]), list.every((n) => Math.abs(n.height - n0.height) < 1e-6) ? String(n0.height) : '', 'data-mp-ntheight', (v) => change(changeNotes(guids, { height: Number(v) }), one)));
    if (list.every((n) => n.kind === 'text')) {
      const rot = el('input', { type: 'text', className: 'bc-input bc-num', value: String(n0.rot) + '°', 'data-mp-ntrot': '' });
      rot.addEventListener('change', () => { const v = parseFloat(String(rot.value).replace(',', '.')); if (!Number.isFinite(v)) { rot.value = rot.defaultValue; return; } change(changeNotes(guids, { rot: v }), one); });
      kit.field(t('model.ff.rotation'), rot);
    }
    if (list.length === 1 && n0.kind === 'dim') kit.field(t('model.nt.offset'), kit.lenInput(n0.offset, 'data-mp-ntoff', (mm) => change(changeNotes(guids, { offset: mm }), one), { any: true }));
    kit.field(t('model.dr.view'), kit.el('span', {}, views.viewName(n0.view)));
    kit.field(t('model.dr.move'), kit.button(t('model.dr.move.go'), 'data-mp-ntmove', () => { A.setTool('nmove'); N.move = { guids, a: null }; }));
    return { title: list.length === 1 ? kindName(n0) : t('model.nt.many', { n: list.length }) };
  }

  A = modelUi.extend({
    tools: TOOLS,
    hint: (name) => (name === 'nmove' && N.move?.a ? 'model.hint.dmove2' : name === 'nmove' ? 'model.hint.dmove' : 'model.hint.' + name),
    typed: () => false,
    move(p, e) { N.at = snap(p, e); },
    click(p, e) {
      const tool = A.S.tool;
      if (tool === 'nmove') {
        const q = A.snapFrom(p, e, N.move?.a || null).p;
        if (!N.move?.guids?.length) { A.setTool('select'); return; }
        if (!N.move.a) { N.move.a = q; const h = A.root.querySelector('[data-model-hint]'); if (h) h.textContent = t('model.hint.dmove2'); return; }
        const { guids, a } = N.move;
        N.move = null;
        A.setTool('select');
        const k = A.kb(), keys = N.items.filter((n) => guids.includes(n.guid)).map((n) => k + n.id);
        A.commit(moveNotes(guids, q[0] - a[0], q[1] - a[1]), { label: guids.length === 1 ? t('model.nt.one') : t('model.nt.many', { n: guids.length }), verb: t('model.verb.moved') });
        reselectLater(keys);
        return;
      }
      point(snap(p, e));
    },
    dbl() { if (A.S.tool === 'nleader' && N.pts.length >= 2) finishLeader(); },
    key(e) {
      if (!TOOLS.includes(A.S.tool)) return false;
      if (e.key === 'Enter' && A.S.tool === 'nleader' && N.pts.length >= 2) { finishLeader(); return true; }
      if (e.key === 'Backspace' && N.pts.length) { N.pts.pop(); A.drawOverlay(); return true; }
      return false;
    },
    escape() { if (!TOOLS.includes(A.S.tool)) return false; if (N.pts.length) { N.pts = []; return true; } if (A.S.tool === 'nmove') { N.move = null; A.setTool('select'); return true; } return false; },
    toolChanged(name) { N.pts = []; N.at = null; if (name !== 'nmove') N.move = null; const m = A.root.querySelector('[data-annot-tools]'); if (m?.open && TOOLS.includes(name)) m.open = false; },
    overlay,
    scene: (scene) => addScene(scene),
    classes: /^IfcAnnotation$/,
    pick(key) {
      const k = A.kb(), n = N.items.find((x) => k + x.id === key);
      return n ? { kind: 'note', guid: n.guid, label: kindName(n) } : null;
    },
    props: (items, kit) => (items.every((x) => x.kind === 'note') ? props(items, kit) : null),
    remove(items) { return removeNotes(items.filter((x) => x.kind === 'note').map((x) => x.guid)); },
    refresh() { const w = W(); try { N.items = w ? readNotes(w) : []; } catch (e) { N.items = []; } },
  });
  const api = { state: N, items: () => N.items };
  if (typeof window !== 'undefined') window.bimcraftNotes = { state: N, api };   // for tests
  return api;
}
