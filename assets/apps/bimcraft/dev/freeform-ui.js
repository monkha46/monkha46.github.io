/* SPDX-License-Identifier: Apache-2.0 */
/**
 * freeform-ui.js — free-form elements on the plan (KHADRAW P1), through model-ui.js `extend()`:
 *   Free-form [data-mtool="freeform"] (Build menu)  click a point on the level: the push/pull editor opens there (ModelCraft
 *                                     in a frame, /mc-editor/), with the level's building around it as a grey reference;
 *                                     Done writes what was modelled as one element of the level (freeform-model.js)
 *   A picked free-form element shows its class (proxy, wall, slab, …), volume and area in Properties, and
 *   "Edit in 3D…" opens the editor on it again. Delete removes it.
 * The reference ("BimCraft context") is a component in the editor's model, taken out again on Done.
 * Test hook: window.bimcraftFreeform = { state, api, open(spec) }.
 */
import { Model, meshDef } from './mc/model.js';
import { FREEFORM_CLASSES, FREEFORM_DEFAULT_CLASS, readFreeforms, placeFreeform, changeFreeform, removeFreeforms, meshOf } from './freeform-model.js';
import { modelTriangles } from './res-views.js';
import { viewerToPlan } from './model-plan.js';
import { ModelWriter } from './model-write.js';
import { el } from './ui-util.js';
import { takeScans, samplePoints, toWorld, xyzText } from './scan-cloud.js';   // KHADRAW M4: a headset's room scan → a point cloud
import { t as tr } from './i18n.js';

const CONTEXT = 'KHADRAW context';
const CONTEXT_OLD = 'BimCraft context';   // drafts made before KHADRAW's rename still carry this name   // i18n-ignore: the reference component's name inside the editor's model
const CONTEXT_MAX_TRIS = 80000;
/** KHADRAW M3: the reference's colours by IFC class, so it reads in AR on site (anything else light grey). */
const CLASS_COLORS = [[/Wall/i, '#d8d2c4'], [/Slab|Covering/i, '#bdb7ab'], [/Roof/i, '#b4583e'], [/Window|Plate/i, '#9cc4e4'], [/Door/i, '#9a7352'],
  [/Column|Beam|Member/i, '#a7a39b'], [/Stair|Ramp|Railing/i, '#c2b49a'], [/Furniture|Furnishing/i, '#7f9a7a'], [/Geographic|Site/i, '#9fb38a']];
const colorOf = (cls) => (CLASS_COLORS.find(([re]) => re.test(cls || '')) || [null, '#c9c9c5'])[1];
const EDITOR_URL = '/mc-editor/';
const DRAFT_KEY = 'bimcraft.freeform.draft';   // the edit in progress, kept while the editor is open (cleared by Done / Cancel)
const draftGet = () => { try { const j = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); return j && typeof j.json === 'string' ? j : null; } catch (e) { return null; } };
const draftSet = (d) => { try { if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); else localStorage.removeItem(DRAFT_KEY); } catch (e) { /* storage full or blocked: no draft */ } };

export function mountFreeform(modelUi) {
  const R = { list: [], hover: null, editing: null };
  let A = null;
  const t = (...a) => A.t(...a);
  const levelGuid = () => A.S.data.levels.find((l) => l.id === A.S.level)?.guid;
  const writer = () => { const e = A.ed(); return new ModelWriter(e.W, e.api, e.mid); };
  const read = () => { try { R.list = A.ed() ? readFreeforms(writer()) : []; } catch (e) { R.list = []; } };

  // the tool's button, in the Build menu (extend() wires every [data-mtool] it finds)
  const menu = modelUi && document.querySelector('[data-res-tools] .bc-mb-menu');
  if (menu && !menu.querySelector('[data-mtool="freeform"]')) {
    const b = el('button', { type: 'button', className: 'bc-tool', 'data-mtool': 'freeform', 'aria-pressed': 'false', title: tr('model.ff.tool.title') },
      el('i', { className: 'bi bi-box-seam', 'aria-hidden': 'true' }), el('span', {}, tr('model.ff.tool')));
    menu.prepend(b);
  }
  // KHADRAW M3: the whole building in the headset or on a phone (ModelCraft's Enter AR / Enter VR in the editor), at 1:1
  if (menu && !menu.querySelector('[data-ff-ar]')) {
    const b = el('button', { type: 'button', className: 'bc-tool', 'data-ff-ar': '', title: tr('model.ff.ar.title') },
      el('i', { className: 'bi bi-badge-ar', 'aria-hidden': 'true' }), el('span', {}, tr('model.ff.ar')));
    b.addEventListener('click', () => {
      const lv = A?.S.data?.levels || [], g = lv.find((l) => Math.abs(l.elevation) < 1) || lv[0];
      if (!g) { A?.host.status(tr('model.err.nolevel'), true); return; }
      A.root.querySelector('[data-res-tools]')?.removeAttribute('open');
      open({ mode: 'view', at: [0, 0], levelId: g.id });
    });
    menu.prepend(b);
  }

  /** The level's building as triangles in the element's own frame (metres, origin at `at`, turned by `angle`), the
   *  element itself left out. */
  function contextPolys(levelId, at, skipKey, angle = 0) {
    const host = A.host, model = host.model(), ifc = host.ifc?.();
    const S = A.storeyMatrix(levelId);
    if (!model || !ifc || !S) return [];
    let M;
    try { M = viewerToPlan(ifc.api.GetCoordinationMatrix(model.modelID), S); } catch (e) { return []; }
    const els = modelTriangles(model, M, { skip: skipKey != null ? new Set([skipKey]) : null });
    const polys = [];
    for (const e of els) {
      const T = e.tris;
      for (let i = 0; i + 8 < T.length && polys.length < CONTEXT_MAX_TRIS; i += 9) {
        polys.push({ loops: [[0, 3, 6].map((o) => { const q = turn([T[i + o] - at[0], T[i + o + 1] - at[1]], -angle); return [q[0] / 1000, q[1] / 1000, T[i + o + 2] / 1000]; })], color: colorOf(e.cls) });
      }
    }
    return polys;
  }
  /** The editor's starting model: the element's own (or an empty one) plus the reference around it. */
  function withContext(json, polys) {
    const m = new Model();
    if (json) m.load(typeof json === 'string' ? JSON.parse(json) : json);
    if (polys.length) {
      const d = meshDef(m, polys, CONTEXT, 'component');
      const iid = m.place(m.root, d.id, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      const inst = m.root.insts.get(iid);
      inst.name = CONTEXT;
      inst.locked = true;   // snaps, but cannot be picked, moved or erased (mc/infer.js)
    }
    m.units = 'mm';
    return m.toJSON();
  }
  /** What comes back from the editor, the reference taken out. */
  function withoutContext(j) {
    const m = new Model();
    m.load(j);
    for (const [iid, inst] of [...m.root.insts]) {
      const d = m.defs.get(inst.def);
      if ([CONTEXT, CONTEXT_OLD].includes(inst.name) || [CONTEXT, CONTEXT_OLD].includes(d?.name)) m.root.insts.delete(iid);
    }
    for (const [id, d] of [...m.defs]) if (d.name === CONTEXT || d.name === CONTEXT_OLD) m.defs.delete(id);
    return JSON.stringify(m.toJSON());
  }

  /** Open the push/pull editor: spec { guid? (an element to edit), at, levelId, json?, skipKey? }. */
  function open(spec) {
    const dlg = el('dialog', { className: 'bc-ff-dialog', 'data-ff-editor': '' });
    dlg.style.cssText = 'width:96vw;height:94vh;max-width:none;max-height:none;padding:0;border:1px solid var(--line,#888);display:flex;flex-direction:column;background:var(--sheet,#fff)';
    const status = el('span', { style: 'flex:1;font-size:13px;opacity:.8' }, t(spec.mode === 'view' ? 'model.ff.editor.view' : spec.guid ? 'model.ff.editor.editing' : 'model.ff.editor.new'));
    const done = el('button', { type: 'button', className: 'btn-cc btn-sm-cc', 'data-ff-done': '', disabled: true }, t('model.ff.done'));
    const cancel = el('button', { type: 'button', className: 'btn-line btn-sm-cc', 'data-ff-cancel': '' }, t('model.ff.cancel'));
    const bar = el('div', { style: 'display:flex;gap:8px;align-items:center;padding:6px 10px;border-bottom:1px solid var(--line,#888)' }, status, cancel, done);
    // the editor in the page's language; WebXR allowed in it (its Enter VR / Enter AR model in a headset: KHADRAW M1)
    const lang = document.documentElement.lang && document.documentElement.lang !== 'en' ? '?lang=' + encodeURIComponent(document.documentElement.lang) : '';
    const frame = el('iframe', { src: EDITOR_URL + lang, allow: 'xr-spatial-tracking; fullscreen', title: t('model.ff.editor.title'), style: 'flex:1;border:0;width:100%' });
    dlg.append(bar, frame);
    A.root.append(dlg);
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); });   // Esc belongs to the editor's tools
    dlg.showModal();
    R.editing = { spec, dlg, frame };
    const start = withContext(spec.json || null, contextPolys(spec.levelId, spec.at, spec.skipKey, spec.angle || 0));
    const t0 = Date.now();
    const wait = () => {
      const mc = frame.contentWindow?.modelcraft;
      if (mc?.openJSON) {
        mc.openJSON(start).then(() => { done.disabled = false; mc.markSaved?.(); });
        return;
      }
      if (Date.now() - t0 > 20000) { status.textContent = t('model.ff.editor.nostart'); return; }
      setTimeout(wait, 150);
    };
    frame.addEventListener('load', wait);
    // a draft of the edit every couple of seconds it changed, so a crash or a closed tab can open it again
    const levelGuidOf = (id) => A.S.data?.levels.find((l) => l.id === id)?.guid || null;
    let seen = -1;
    const keep = setInterval(() => {
      const mc = frame.contentWindow?.modelcraft;
      if (!mc || done.disabled || mc.model.version === seen) return;
      seen = mc.model.version;
      try { const json = withoutContext(mc.model.toJSON()); if (meshOf(json).indices.length) draftSet({ guid: spec.guid || null, at: spec.at, angle: spec.angle || 0, level: levelGuidOf(spec.levelId), json, when: Date.now() }); } catch (e) { /* not readable yet */ }
    }, 2000);
    dlg.addEventListener('close', () => clearInterval(keep));
    cancel.addEventListener('click', () => { R.editing = null; draftSet(null); dlg.close(); });
    done.addEventListener('click', () => {
      const mc = frame.contentWindow?.modelcraft;
      if (!mc) return;
      let json;
      try { json = withoutContext(mc.model.toJSON()); } catch (e) { A.host.status(e.message, true); return; }
      // KHADRAW M4: a room scanned in the headset comes out of the element and into the 3D view as a point cloud (as-built)
      let scanned = 0;
      try {
        const cat = JSON.parse(frame.contentDocument?.getElementById('cc-lang')?.textContent || '{}').strings || {};
        const layers = ['Scanned room', 'Scanned furniture', cat['xr.scan_layer_room'], cat['xr.scan_layer_furniture']];
        const r = takeScans(json, layers);
        if (r.scans.length) {
          json = r.json;
          const S = A.storeyMatrix(spec.levelId);
          const pts = toWorld(samplePoints(r.scans.flatMap((x) => x.tris)), { at: spec.at, angle: spec.angle || 0, storeyWorld: S });
          scanned = pts.length / 3;
          openScanCloud(new File([xyzText(pts)], t('model.ff.scan.file') + '.xyz', { type: 'text/plain' }));
        }
      } catch (e) { console.error(e); A.host.status(t('model.ff.scan.fail'), true); }
      if (!meshOf(json).indices.length) {
        if (spec.mode === 'view' || scanned) { mc.markSaved?.(); R.editing = null; draftSet(null); dlg.close(); if (scanned) A.host.status(t('model.ff.scan.done', { n: scanned.toLocaleString() })); return; }   // M3: only looked; M4: only scanned
        A.host.status(t('model.err.ff.empty'), true); return;
      }
      mc.markSaved?.();
      R.editing = null;
      draftSet(null);
      dlg.close();
      if (spec.guid) A.commit(changeFreeform(spec.guid, { json }), { label: t('model.ff.tool'), verb: t('model.verb.changed') });
      else A.commit(placeFreeform({ storey: A.S.data?.levels.find((l) => l.id === spec.levelId)?.guid || levelGuid(), at: spec.at, json, cls: FREEFORM_DEFAULT_CLASS }), { label: t('model.ff.tool'), verb: t('model.verb.placed') });
    });
  }

  /** KHADRAW M4: a cloud opened the way the page opens one (its file input: BimCraft's own cloud layer, placed in model coordinates). */
  function openScanCloud(file) {
    const input = document.querySelector('[data-cloud-input]');
    if (!input) return false;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // ---- Move (SketchUp's way: a base point, then where it goes; R turns 90° about the base point meanwhile) ----
  /** The element's outline in its own plan (mm): the convex hull of its mesh seen from above. */
  function hullOf(f) {
    let P = [];
    try { const m = meshOf(f.json).positions; for (let i = 0; i < m.length; i += 3) P.push([m[i], m[i + 1]]); } catch (e) { return []; }
    P = P.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const p of P) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of P.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    return lo.slice(0, -1).concat(hi.slice(0, -1));
  }
  const turn = (p, deg, about = [0, 0]) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), x = p[0] - about[0], y = p[1] - about[1]; return [about[0] + c * x - s * y, about[1] + s * x + c * y]; };
  /** Where the element ends up: moved by base → to and turned by `rot` about the base point. */
  function placedAfter(mv, to) {
    const f = mv.f, base = mv.base || to;
    const at = turn(f.at, mv.rot, base);
    return { at: [at[0] + to[0] - base[0], at[1] + to[1] - base[1]], angle: ((f.angle + mv.rot) % 360 + 360) % 360 };
  }
  const outlineAt = (mv, at, angle) => mv.hull.map((p) => { const q = turn(p, angle); return [q[0] + at[0], q[1] + at[1]]; });
  function startMove(guid) {
    read();
    const f = R.list.find((x) => x.guid === guid);
    if (!f) return;
    R.mv = { guid, f, hull: hullOf(f), base: null, rot: 0 };
    A.setTool('ffmove');
  }
  const commitPlace = (f, ch) => A.commit(changeFreeform(f.guid, ch), { label: f.name || t('model.ff.tool'), verb: t('model.verb.moved') });

  /** A draft left by an editor that never closed: a bar to open it again (its level must be in this model). */
  let draftBar = null;
  function offerDraft() {
    const d = draftGet();
    if (!d || R.editing || !A.S.data) { if (!d && draftBar) { draftBar.remove(); draftBar = null; } return; }
    const lv = A.S.data.levels.find((l) => l.guid === d.level);
    if (!lv || draftBar) return;
    read();
    const f = d.guid ? R.list.find((x) => x.guid === d.guid) : null;
    const reopen = el('button', { type: 'button', className: 'btn-cc btn-sm-cc', 'data-ff-draft-open': '' }, t('model.ff.draft'));
    const drop = el('button', { type: 'button', className: 'btn-line btn-sm-cc', 'data-ff-draft-drop': '' }, t('model.ff.draft.drop'));
    draftBar = el('div', { 'data-ff-draft': '', style: 'display:flex;gap:6px;flex-wrap:wrap;margin:6px 0' }, reopen, drop);
    const hint = A.root.querySelector('[data-modelbar]') || A.root;
    hint.append(draftBar);
    const close = () => { draftBar?.remove(); draftBar = null; };
    reopen.addEventListener('click', () => { close(); open({ guid: f ? d.guid : null, at: d.at, angle: d.angle, levelId: lv.id, json: d.json, skipKey: f ? A.kb() + f.id : null }); });
    drop.addEventListener('click', () => { draftSet(null); close(); });
  }

  const classRe = new RegExp('^(' + Object.values(FREEFORM_CLASSES).map((c) => c.ifc).join('|') + ')$', 'i');
  A = modelUi.extend({
    tools: ['freeform', 'ffmove'],
    hint: (name) => (name === 'ffmove' ? 'model.hint.ffmove' : 'model.hint.freeform'),
    typed: () => false,
    classes: classRe,
    move(p, e) { R.hover = A.snapAt(p, e); },
    click(p, e) {
      const q = A.snapAt(p, e)?.p || p;
      if (A.S.tool === 'ffmove') {
        const mv = R.mv;
        if (!mv) { A.setTool('select'); return; }
        if (!mv.base) { mv.base = [q[0], q[1]]; return; }
        const to = placedAfter(mv, [q[0], q[1]]);
        R.mv = null;
        A.setTool('select');
        commitPlace(mv.f, to);
        return;
      }
      open({ at: [q[0], q[1]], levelId: A.S.level });
    },
    key(e, low) {
      if (A.S.tool !== 'ffmove' || !R.mv || low !== 'r') return false;
      R.mv.rot = (R.mv.rot + (e.shiftKey ? -90 : 90) + 360) % 360;
      A.drawOverlay();
      return true;
    },
    escape() { if (A.S.tool !== 'ffmove') return false; R.mv = null; A.setTool('select'); return true; },
    toolChanged(name) { R.hover = null; if (name !== 'ffmove') R.mv = null; const m = A.root.querySelector('[data-res-tools]'); if (m?.open) m.open = false; },
    refresh() { read(); offerDraft(); },
    overlay(o) {
      if (!R.hover) return;
      const p = R.hover.p;
      if (A.S.tool === 'ffmove' && R.mv) {
        o.snap = R.hover;
        const to = placedAfter(R.mv, p);
        o.walls.push(outlineAt(R.mv, to.at, to.angle));
        if (R.mv.base) o.lines.push([R.mv.base[0], R.mv.base[1], p[0], p[1]]);
        o.hud = { p, text: R.mv.base ? t('model.hud.ffmove.to', { deg: Math.round(R.mv.rot) }) : t('model.hud.ffmove.base') };
        return;
      }
      if (A.S.tool !== 'freeform') return;
      o.snap = R.hover;
      const s = 300;
      o.lines.push([p[0] - s, p[1], p[0] + s, p[1]], [p[0], p[1] - s, p[0], p[1] + s]);
      o.hud = { p, text: t('model.hud.freeform') };
    },
    pick(key) {
      if (!R.list.length) read();
      const k = A.kb(), f = R.list.find((x) => k + x.id === key);
      return f ? { kind: 'freeform', guid: f.guid, label: f.name || t('model.ff.tool') } : null;
    },
    props(items, kit) {
      if (!items.every((x) => x.kind === 'freeform')) return null;
      read();
      const fs = items.map((x) => R.list.find((f) => f.guid === x.guid)).filter(Boolean);
      if (!fs.length) return null;
      const f0 = fs[0], one = fs.length === 1, title = t('model.ff.tool');
      const run = (ch) => { const ops = fs.map((f) => changeFreeform(f.guid, ch)); A.commit((ed) => { let r = null; for (const o of ops) { const r2 = o(ed); r = r ? { ...r2, journal: A.mergeJournals(r.journal, r2.journal) } : r2; } return r; }, kit.one(title)); };
      kit.field(t('model.ff.class'), kit.select(Object.keys(FREEFORM_CLASSES).map((k) => [k, t(FREEFORM_CLASSES[k].label)]), fs.every((f) => f.cls === f0.cls) ? f0.cls : '', 'data-mp-ffclass', (v) => run({ cls: v })));
      if (one) {
        let mesh = null; try { mesh = meshOf(f0.json); } catch (e) { /* unreadable */ }
        if (mesh) {
          kit.rows.push(el('dt', {}, t('model.ff.volume')), el('dd', {}, mesh.closed ? t('model.ff.m3', { v: (mesh.volume / 1e9).toFixed(3) }) : t('model.ff.open')));
          kit.rows.push(el('dt', {}, t('model.ff.area')), el('dd', {}, t('model.ff.m2', { v: (mesh.area / 1e6).toFixed(2) })));
        }
        // where it stands: X, Y on its level and its turn (each one change; Move… / Turn 90° for the plan's way)
        kit.field(t('model.ff.x'), kit.lenInput(f0.at[0], 'data-mp-ffx', (mm) => run({ at: [mm, f0.at[1]] }), { any: true }));
        kit.field(t('model.ff.y'), kit.lenInput(f0.at[1], 'data-mp-ffy', (mm) => run({ at: [f0.at[0], mm] }), { any: true }));
        const rot = el('input', { type: 'text', className: 'bc-input bc-num', value: String(Math.round(f0.angle * 100) / 100) + '°', 'data-mp-ffrot': '' });
        rot.addEventListener('change', () => { const v = parseFloat(String(rot.value).replace(',', '.')); if (!Number.isFinite(v)) { rot.value = rot.defaultValue; return; } run({ angle: ((v % 360) + 360) % 360 }); });
        rot.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); rot.blur(); } });
        kit.field(t('model.ff.rotation'), rot);
        kit.field(t('model.ff.place'), el('span', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
          kit.button(t('model.ff.move'), 'data-mp-ffmove', () => startMove(f0.guid)),
          kit.button(t('model.ff.turn90'), 'data-mp-ffturn', () => run({ angle: (f0.angle + 90) % 360 }))));
        kit.field(t('model.ff.model'), kit.button(t('model.ff.edit3d'), 'data-mp-ffedit', () => open({ guid: f0.guid, at: f0.at, angle: f0.angle, levelId: f0.storey, json: f0.json, skipKey: A.kb() + f0.id })));
        // KHADRAW F: furniture → its boards, the cut list, the CNC files (furniture-ui.js)
        if (f0.cls === 'furniture' && typeof window !== 'undefined' && window.bimcraftFurniture) kit.field(t('fu.group'), kit.button(t('fu.open'), 'data-mp-ffcnc', () => window.bimcraftFurniture.openDialog([f0.guid])));
      }
      return { title: one ? (f0.name || title) : t('model.elements', { n: fs.length }) };
    },
    remove(items) { const g = items.filter((x) => x.kind === 'freeform').map((x) => x.guid); return g.length ? removeFreeforms(g) : null; },
  });
  if (typeof window !== 'undefined') window.bimcraftFreeform = { state: R, api: A, open };   // for tests
  return { state: R };
}
