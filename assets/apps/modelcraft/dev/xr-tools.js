/* SPDX-License-Identifier: Apache-2.0 */
/**
 * xr-tools.js — MonzDraw's modeling tools for a pointing ray (WebXR controllers, a phone's tap): Line, Rectangle,
 * Push/Pull, Move and Measure, with snapping. No DOM and no three.js: xr.js turns the controller into a ray in model
 * coordinates (Z up, meters) and draws what view() returns; tests drive the same object with plain rays.
 *
 *   const xt = new XRTools({ model, host, changed });
 *   xt.set('line' | 'rect' | 'push' | 'move' | 'measure');
 *   xt.hover({o, d})   each frame: snap + live preview          xt.trigger({o, d})   a click
 *   xt.cancel() · xt.undo() · xt.redo()                         xt.grid = 0.01 (lengths round to it, m)
 *   xt.view() → {cursor: {p, kind} | null, lines: [{a, b, kind}], label: {p, text} | null, tip}
 *   xt.canType()      true while a tool waits for a length    xt.typed('2.5m' | '4,3')   apply an exact value
 *
 * Tape (SketchUp's Tape Measure): click an edge (or a guide), move off it and click: a guide line parallel to it at that
 * distance (or type it). Click a point and another point: the length, and a guide point where it ends.
 *
 * Box: two corners (as Rectangle), then the height; type 'width,depth' and then the height.
 * Paint: click a face (or a group) to give it the colour or material in `paintColor` (null: the default); with
 * `picking` on, the click takes the colour from what it points at instead.
 * Polygon: as Circle with `sides` sides (6; type 8s for eight). Resize (scale): click the thing (or what is selected), then
 * move away from or toward its base (the middle of its bottom): it grows or shrinks about it; type a factor (2, 0.5, 50%).
 * Hide: click an edge, face or group to hide it (Unhide all brings them back). Angle: the corner, then a point on each arm.
 * Markup: hold the trigger and draw in the air (xr.js feeds the pen's tip to markBegin/markAdd/markCommit); the strokes go
 * in one group, "Markup", on its own layer, so they never join the model and hide in one go.
 * Rotate: click the thing to turn (or what is selected) where the pivot goes (the axis is the face's normal there, else
 * up), click a point to turn from, then where to; 5° steps, or type the angle. After it, type 3x for three copies round
 * the pivot at that angle (the original stays where it was) or /3 for three spread over it.
 * Offset: click a face, move in or out and click (or type): its outline again inside it (or round it).
 * Section: click a face (or the ground, for a floor plan cut) and move the plane in; click (or type how far). The cut
 * shows straight away; Section cuts (menu) turns it off and on.
 *
 * Typed values (the wrist keypad, a phone's keyboard): Line and Move go that far towards the ray, Push/Pull that far
 * along the face (the side the ray is on; '-' flips it), Rectangle takes 'width,height' (or one value: a square) on
 * the side the ray points to. A bare number is in the model's unit.
 *
 * Snapping (angular, so it feels the same at 1:1 and as a table model): end points and guide points (with where guides
 * cross each other or an edge), then midpoints, then edges and guide lines, then faces, then the ground (z = 0). From a start point the ray also locks to the red, green and blue axes. Edits go into
 * the open context (host.path), the same place the desktop tools draw.
 */
import { add, sub, mul, dot, cross, len, dist, norm, apply, applyDir, translation, rotation, scaling, mmul, frame, rayPlane, rayTri, rayToSegment, lineLine } from './vec.js';
import { addEdge, addPolygon, rectPts, ngonPts, tagCurve, eraseEdges, removeLooseVerts, pushPull, transformSel, copySel, connected, faceTris, faceNormal,
  addSpline, smoothPts, followMe, chainThrough, edgeChain, arcPts, offsetFace, paintFaces, paintInstance, isPaint,
  hideSel, unhideAll, hiddenCount } from './model.js';
import { formatLength, parseLength } from './units.js';

const AXES = [['axis-x', [1, 0, 0]], ['axis-y', [0, 1, 0]], ['axis-z', [0, 0, 1]]];
export const XR_TOOLS = ['select', 'line', 'arc', 'curve', 'rect', 'box', 'circle', 'polygon', 'push', 'paint', 'follow', 'move', 'copy', 'rotate', 'resize', 'offset',
  'erase', 'hide', 'measure', 'angle', 'tape', 'section', 'markup'];

export class XRTools {
  constructor({ model, host, changed = () => {}, tol = 0.02 }) {
    this.model = model; this.host = host; this.changed = changed;
    this.tol = tol;          // radians: how close the ray must pass to snap
    this.grid = 0.01;        // m: free lengths round to this
    this.name = 'line';
    this.op = null;          // the tool's state between clicks
    this.snap = null;        // the last hover
    this.measured = null;    // {a, b} the last measurement, kept on screen
    this.paintColor = null;  // Paint: a colour (#rrggbb) or material (mat:id); null = the default
    this.picking = false;    // Paint: the next click takes the colour instead
    this.tip = '';
    this._cache = null; this._frozen = null;
  }

  set(name) { if (!XR_TOOLS.includes(name)) return; this.cancel(); if (name !== 'select') this.selection = []; this.name = name; this.tip = ''; this.lastCopy = null; }
  cancel() {
    this.sweep = null;
    if (this.op?.preview) this.model.abort();
    this.op = null; this._frozen = null;
  }
  undo() { this.cancel(); if (this.model.undo()) this.changed(); }
  redo() { this.cancel(); if (this.model.redo()) this.changed(); }

  get units() { return this.model.units || 'm'; }
  fmt(m) { return formatLength(m, this.units); }
  round(x) { const g = this.grid; return g > 0 ? Math.round(x / g) * g : x; }
  ctx() { return this.model.context(this.host.path || []) || this.model.context([]); }

  // ---- what the ray can snap to (world = model root coordinates) ----
  cache() {
    if (this._frozen) return this._frozen;
    if (this._cache && this._cache.version === this.model.version) return this._cache;
    const tris = [], verts = [], edges = [];
    const walk = (this.model.walkShown || this.model.walk).bind(this.model);
    walk((def, m, path) => {
      const P = new Map();
      const at = (v) => { let p = P.get(v); if (!p) { p = apply(m, def.verts.get(v)); P.set(v, p); } return p; };
      for (const [fid, f] of def.faces) {
        if (f.hidden) continue;
        const n = norm(applyDir(m, norm(faceNormal(def, f))));
        for (const t of faceTris(def, f)) tris.push({ a: at(t[0]), b: at(t[1]), c: at(t[2]), def, m, path, fid, n });
      }
      for (const [eid, e] of def.edges) {
        if (e.hidden) continue;
        edges.push({ a: at(e.a), b: at(e.b), path, def, eid });
      }
      for (const v of def.verts.keys()) verts.push({ p: at(v), path, def });
    });
    // guides (model root coordinates): lines, points, and where a guide line crosses another guide line or an edge
    const glines = [], gpts = [];
    for (const [gid, g] of this.model.guides || []) {
      if (g.kind === 'line') glines.push({ gid, p: g.p, d: g.d });
      else if (g.kind === 'point') gpts.push({ p: g.p });
    }
    const meets = (r) => r && dist(r.p1, r.p2) < 1e-6;
    for (let i = 0; i < glines.length && gpts.length < 4000; i++) {
      const g = glines[i];
      for (let j = i + 1; j < glines.length; j++) { const r = lineLine(g.p, g.d, glines[j].p, glines[j].d); if (meets(r)) gpts.push({ p: r.p1 }); }
      for (const e of edges) {
        const u = sub(e.b, e.a), L = len(u);
        if (L < 1e-9) continue;
        const r = lineLine(g.p, g.d, e.a, mul(u, 1 / L));
        if (meets(r) && r.s > -1e-9 && r.s < L + 1e-9) gpts.push({ p: r.p1 });
      }
    }
    this._cache = { version: this.model.version, tris, verts, edges, glines, gpts };
    return this._cache;
  }

  /** The point the ray picks: {p, kind, t, hit?: {def, m, path, fid, n}}. `from` adds the axis locks. */
  pick(ray, { from = null, faces = true } = {}) {
    const { o } = ray, d = norm(ray.d), c = this.cache(), tol = this.tol;
    const cut = this.op?.section ? null : this.model.activeCut?.();
    const kept = (p) => !cut || dot(sub(p, cut.p), cut.n) <= 1e-6;   // the side the cut keeps
    let face = null;
    if (faces) for (const tr of c.tris) {
      const t = rayTri(o, d, tr.a, tr.b, tr.c);
      if (t !== null && (!face || t < face.t) && kept(add(o, mul(d, t)))) face = { t, tr };
    }
    const limit = face ? face.t * 1.02 + 1e-3 : Infinity;   // nothing hidden behind the face it hits
    const off = (p) => { const t = dot(sub(p, o), d); if (t <= 0 || t > limit) return null; return { t, a: dist(add(o, mul(d, t)), p) / t }; };
    let best = null;
    const take = (p, kind, rank, extra = {}) => {
      if (!kept(p)) return;
      const k = off(p);
      if (!k || k.a > tol) return;
      // same kind: the nearer one (a corner straight below another is the top one you see)
      if (!best || rank < best.rank || (rank === best.rank && k.t < best.t - 1e-6)) best = { p, kind, rank, a: k.a, t: k.t, ...extra };
    };
    for (const v of c.verts) take(v.p, 'end', 0);
    for (const g of c.gpts || []) take(g.p, 'guidept', 0);
    for (const e of c.edges) {
      take(mul(add(e.a, e.b), 0.5), 'mid', 1);
      const r = rayToSegment(o, d, e.a, e.b);
      if (r.t > 0) take(r.onSeg, 'edge', 2, { dir: norm(sub(e.b, e.a)) });
    }
    for (const g of c.glines || []) {
      const r = lineLine(o, d, g.p, g.d);
      if (r && r.t > 0) take(r.p2, 'guide', 2, { dir: g.d, guide: g.gid });
    }
    const hit = face ? { def: face.tr.def, m: face.tr.m, path: face.tr.path, fid: face.tr.fid, n: face.tr.n } : null;
    if (best) return { p: best.p, kind: best.kind, t: best.t, hit, dir: best.dir, guide: best.guide };
    if (from) {
      let ax = null;
      for (const [kind, u] of AXES) {
        const r = lineLine(o, d, from, u);
        if (!r || r.t <= 0) continue;
        const a = dist(r.p1, r.p2) / r.t;
        if (a <= tol * 1.5 && (!ax || a < ax.a)) ax = { p: add(from, mul(u, this.round(r.s))), kind, t: r.t, a };
      }
      if (ax && (!face || ax.t <= limit)) return { p: ax.p, kind: ax.kind, t: ax.t, hit };
    }
    if (face) return { p: add(o, mul(d, face.t)), kind: 'face', t: face.t, hit };
    const g = rayPlane(o, d, { n: [0, 0, 1], d: from ? from[2] : 0 });
    if (g && g.t > 0) return { p: [this.round(g.p[0]), this.round(g.p[1]), g.p[2]], kind: 'ground', t: g.t, hit: null };
    return null;
  }

  // ---- each frame ----
  hover(ray) {
    const op = this.op;
    if (this.name === 'push' && op) return this.pushHover(ray);
    if ((this.name === 'move' || this.name === 'copy') && op) return this.moveHover(ray);
    if (this.name === 'box' && op?.base) return this.boxHover(ray);
    if ((this.name === 'rect' || this.name === 'box') && op) {
      const q = this.onPlane(ray, op.plane, op.p);
      this.snap = q ? { p: q.p, kind: q.kind } : null;
      return this.snap;
    }
    if (this.name === 'circle' && op) {
      const q = this.onPlane(ray, op.plane, op.c);
      this.snap = q ? { p: q.p, kind: q.kind } : null;
      return this.snap;
    }
    if (this.name === 'arc' && op?.p1) {
      const q = rayPlane(ray.o, norm(ray.d), { n: op.n, d: dot(op.n, op.p0) });
      if (q && q.t > 0) {
        const c = dist(op.p0, op.p1), m = mul(add(op.p0, op.p1), 0.5);
        let h = this.round(dot(sub(q.p, m), op.w));
        if (Math.abs(Math.abs(h) - c / 2) < c * 0.04) h = Math.sign(h || 1) * c / 2;   // a half circle
        op.h = h;
        this.snap = { p: add(m, mul(op.w, h)), kind: Math.abs(Math.abs(h) - c / 2) < 1e-9 ? 'end' : 'plane' };
      }
      return this.snap;
    }
    if (this.name === 'rotate' && op?.ref) return this.rotateHover(ray);
    if (this.name === 'resize' && op) return this.scaleHover(ray);
    if (this.name === 'hide') { this.eraseTarget = this.eraseAt(ray); this.snap = this.pick(ray, {}); return this.snap; }
    if (this.name === 'polygon' && op) { const q = this.onPlane(ray, op.plane, op.c); this.snap = q ? { p: q.p, kind: q.kind } : null; return this.snap; }
    if (this.name === 'offset' && op) return this.offsetHover(ray);
    if (this.name === 'section' && op) return this.sectionHover(ray);
    if (this.name === 'tape' && op?.dir) {
      // off the edge: what the ray points at, less its part along the edge; lengths round to the grid
      const q = this.pick(ray, { from: op.p0 });
      let w = [0, 0, 0];
      if (q) { const w0 = sub(q.p, op.p0); w = sub(w0, mul(op.dir, dot(w0, op.dir))); }
      const L = len(w);
      op.w = L > 1e-9 ? mul(w, this.round(L) / L) : w;
      this.snap = q ? { p: q.p, kind: q.kind } : null;
      return this.snap;
    }
    if (this.name === 'erase') { this.eraseTarget = this.eraseAt(ray); this.snap = this.pick(ray, {}); return this.snap; }
    if (this.name === 'follow') { this.eraseTarget = op ? this.eraseAt(ray, { faces: false }) : null; if (op) this.followDrag(this.eraseTarget); this.snap = this.pick(ray, {}); return this.snap; }
    this.snap = this.pick(ray, { from: op?.from || op?.a || op?.p0 || (op?.pts ? op.pts[op.pts.length - 1] : null) });
    return this.snap;
  }

  /** KHADRAW M1: a live preview as ModelCraft 0.6 runs them — scoped to the open context's definition, the one these tools
   *  edit in place (0.6's unscoped previews restore the whole model each frame; MonzDraw was written for 0.5's). */
  /** KHADRAW M2: a locked placement in the open context (BimCraft's reference building) snaps but is never taken. */
  locked(iid) { return !!this.ctx().def.insts.get(iid)?.locked; }
  pv(fn) { const c = this.model.context(this.host.path || []); return this.model.preview(fn, c ? [c.def.id] : null); }

  trigger(ray) {
    this.hover(ray);
    const s = this.snap;
    try {
      return this[this.name](s, ray);
    } catch (e) { this.cancel(); this.tip = String(e.message || e); return false; }
  }

  // ---- Line: click, click, click…; clicking the first point again (or a cancel) ends the chain ----
  line(s) {
    if (!s) return false;
    if (!this.op) { this.op = { from: s.p, first: s.p }; return true; }
    const a = this.op.from, b = s.p;
    if (dist(a, b) < 1e-6) return false;
    const { def, inv } = this.ctx();
    this.model.change('Line', () => addEdge(def, apply(inv, a), apply(inv, b)));
    this.changed();
    if (dist(b, this.op.first) < 1e-6) this.op = null;
    else this.op = { from: b, first: this.op.first };
    return true;
  }

  // ---- Rectangle: a corner, then the opposite corner on the face it started on (or flat on the ground) ----
  rect(s, ray) {
    if (!this.op) {
      if (!s) return false;
      const n = s.hit && s.kind !== 'ground' ? s.hit.n : [0, 0, 1];
      this.op = { p: s.p, plane: frame(n) };
      return true;
    }
    const q = this.onPlane(ray, this.op.plane, this.op.p);
    if (!q || !q.w || !q.h) return false;
    const { u, v } = this.op.plane;
    const pts = rectPts(this.op.p, u, v, q.w, q.h);
    const { def, inv } = this.ctx();
    this.model.change('Rectangle', () => addPolygon(def, pts.map((p) => apply(inv, p))));
    this.op = null; this.changed();
    return true;
  }
  // ---- Box: a rectangle's two corners, then up (or out of the face) to the height ----
  box(s, ray) {
    if (!this.op) return this.rect(s, ray);
    if (!this.op.base) {
      const q = this.onPlane(ray, this.op.plane, this.op.p);
      if (!q || !q.w || !q.h) return false;
      return this.boxBase(q.w, q.h);
    }
    this.boxHover(ray);
    return this.finishBox();
  }
  boxBase(w, h) {
    const op = this.op;
    op.base = rectPts(op.p, op.plane.u, op.plane.v, w, h); op.w = w; op.dh = h; op.h = 0;
    this._frozen = this.cache();
    this.model.begin(); op.preview = true;
    this.previewBox();
    this.tip = 'Now the height: move up and click (or type it)';
    return true;
  }
  boxHover(ray) {
    const op = this.op, n = op.plane.n, c = mid(op.base[0], op.base[2]);
    const s = this.pick(ray, {});
    let h;
    if (s && (s.kind === 'end' || s.kind === 'mid')) h = dot(sub(s.p, c), n);
    else { const r = lineLine(ray.o, norm(ray.d), c, n); if (!r) return this.snap; h = this.round(r.s); }
    if (h !== op.h) { op.h = h; this.previewBox(); }
    this.snap = { p: add(c, mul(n, op.h)), kind: s?.kind === 'end' ? 'end' : 'push' };
    return this.snap;
  }
  previewBox() {
    const op = this.op, path = this.host.path || [], base = op.base, n = op.plane.n, h = op.h;
    this.pv((m) => {
      const { def, inv } = m.context(path);
      const P = base.map((p) => apply(inv, p));
      addPolygon(def, P, applyDir(inv, n));
      if (Math.abs(h) < 1e-9) return;
      const hit = [...def.faces].find(([, f]) => f.loops[0].length === 4 && f.loops[0].every((v) => P.some((p) => dist(p, def.verts.get(v)) < 1e-7)));
      if (!hit) return;
      const nf = faceNormal(def, hit[1]);
      pushPull(def, hit[0], dot(nf, applyDir(inv, n)) < 0 ? -h : h);
    });
  }
  finishBox() {
    if (Math.abs(this.op.h) < 1e-9) { this.tip = 'Move up first'; return false; }
    this.model.commit('Box');
    this.op = null; this._frozen = null; this.tip = ''; this.changed();
    return true;
  }

  // ---- Paint: a colour or material on a face (or on a group); picking takes it from what you point at ----
  paint(s) {
    if (!s?.hit) { this.tip = 'Point at a face or a group'; return false; }
    const base = this.host.path || [], hp = s.hit.path || [], ctx = this.ctx();
    const inst = hp.length > base.length && base.every((x, i) => hp[i] === x) ? hp[base.length] : null;
    if (inst === null && s.hit.def.id !== ctx.def.id) { this.tip = 'Point at a face or a group'; return false; }
    if (this.picking) {
      this.paintColor = inst !== null ? ctx.def.insts.get(inst)?.color || null : ctx.def.faces.get(s.hit.fid)?.color || null;
      this.picking = false;
      this.tip = '';
      return true;
    }
    const c = this.paintColor ?? null;
    if (c !== null && !isPaint(c)) return false;
    this.model.change('Paint', (m) => {
      const def = m.context(base).def;
      if (inst !== null) paintInstance(def, inst, c); else paintFaces(def, [s.hit.fid], c);
    });
    this.changed();
    return true;
  }

  /** The ray on a rectangle's plane: {p, w, h} with the sides rounded to the grid (or to a point it snaps to). */
  onPlane(ray, f, p0) {
    const s = this.pick(ray, {});
    let p;
    if (s && (s.kind === 'end' || s.kind === 'mid') && Math.abs(dot(sub(s.p, p0), f.n)) < 1e-4) p = s.p;
    else {
      const r = rayPlane(ray.o, norm(ray.d), { n: f.n, d: dot(f.n, p0) });
      if (!r || r.t <= 0) return null;
      p = r.p;
    }
    const w = s?.kind === 'end' ? dot(sub(p, p0), f.u) : this.round(dot(sub(p, p0), f.u));
    const h = s?.kind === 'end' ? dot(sub(p, p0), f.v) : this.round(dot(sub(p, p0), f.v));
    return { p: add(p0, add(mul(f.u, w), mul(f.v, h))), w, h, kind: s?.kind === 'end' ? 'end' : 'plane' };
  }

  // ---- Push/Pull: click a face, move along its normal (or to a point's height), click ----
  push(s, ray) {
    if (!this.op) {
      if (!s?.hit) { this.tip = 'Point at a face'; return false; }
      const ctx = this.ctx();
      if (s.hit.def !== ctx.def) { this.tip = 'That face is inside a group'; return false; }
      this.op = { fid: s.hit.fid, n: s.hit.n, p0: s.p, d: 0, preview: true };
      this._frozen = this.cache();
      this.model.begin();
      return true;
    }
    this.pushHover(ray);
    if (Math.abs(this.op.d) < 1e-6) { this.cancel(); return false; }
    this.model.commit('Push/Pull');
    this.op = null; this._frozen = null; this.changed();
    return true;
  }
  pushHover(ray) {
    const op = this.op;
    const s = this.pick(ray, {});
    let d;
    if (s && (s.kind === 'end' || s.kind === 'mid')) d = dot(sub(s.p, op.p0), op.n);
    else {
      const r = lineLine(ray.o, norm(ray.d), op.p0, op.n);
      if (!r) return this.snap;
      d = this.round(r.s);
    }
    if (d !== op.d) {
      op.d = d;
      const fid = op.fid;
      if (Math.abs(d) > 1e-6) this.pv((m) => pushPull(m.context(this.host.path || []).def, fid, d));
      else this.pv(() => {});
    }
    this.snap = { p: add(op.p0, mul(op.n, op.d)), kind: s?.kind === 'end' ? 'end' : 'push' };
    return this.snap;
  }

  // ---- Move: click what to move (a group, or the connected geometry), then where it goes ----
  move(s, ray) {
    if (!this.op) {
      if (!s?.hit && s?.kind !== 'end' && s?.kind !== 'mid' && s?.kind !== 'edge') { this.tip = 'Point at something to move'; return false; }
      const base = (this.host.path || []);
      const hitPath = s.hit?.path || [];
      const ctx = this.ctx();
      let what;
      if (hitPath.length > base.length && base.every((x, i) => hitPath[i] === x)) what = this.locked(hitPath[base.length]) ? null : { iid: hitPath[base.length] };
      else if (s.hit && s.hit.def === ctx.def) what = { sel: connected(ctx.def, [{ t: 'f', id: s.hit.fid }]) };
      else { this.tip = 'Point at a face'; return false; }
      if (!what) { this.tip = 'That is the reference around it: it stays put'; return false; }   // KHADRAW M2: a locked placement
      this.op = { what, from: s.p, delta: [0, 0, 0], preview: true, copy: this.name === 'copy' };
      this.lastCopy = null;
      this._frozen = this.cache();
      this.model.begin();
      return true;
    }
    this.moveHover(ray);
    return this.finishMove();
  }
  copy(s, ray) { return this.move(s, ray); }
  finishMove() {
    const op = this.op;
    if (len(op.delta) < 1e-9) { this.cancel(); return false; }
    this.model.commit(op.copy ? 'Copy' : 'Move');
    // a copy can be repeated: 3x (or *3) more in a row, /3 spread between the original and the copy
    this.lastCopy = op.copy ? { what: op.what, delta: op.delta } : null;
    if (op.copy) this.tip = 'Copied: type 3x for more in a row, or /3 to divide';
    this.op = null; this._frozen = null; this.changed();
    return true;
  }
  /** Preview op's selection moved (or a copy of it moved) by delta, model root coordinates. */
  previewMove(op, delta) {
    const path = this.host.path || [];
    this.pv((m) => {
      const ctx = m.context(path);
      const sel = op.what.iid !== undefined ? [{ t: 'i', id: op.what.iid }] : op.what.sel;
      transformSel(ctx.def, op.copy ? copySel(ctx.def, sel) : sel, translation(applyDir(ctx.inv, delta)));
    });
  }
  /** n more copies of the last copy: in a row (array) or spread over its distance (divide). */
  array(n, divide) {
    const lc = this.lastCopy;
    if (!lc || !(n >= 1 && n <= 500)) return false;
    const path = this.host.path || [];
    this.model.undo();
    this.model.change(divide ? 'Copy /' + n : 'Copy ×' + n, (m) => {
      const ctx = m.context(path);
      const sel = lc.what.iid !== undefined ? [{ t: 'i', id: lc.what.iid }] : lc.what.sel;
      for (let k = 1; k <= n; k++) transformSel(ctx.def, copySel(ctx.def, sel), translation(applyDir(ctx.inv, mul(lc.delta, divide ? k / n : k))));
    });
    this.changed();
    return true;
  }
  moveHover(ray) {
    const op = this.op;
    const s = this.pick(ray, { from: op.from });
    if (!s) return this.snap;
    const delta = sub(s.p, op.from);
    if (dist(delta, op.delta) > 1e-9) { op.delta = delta; this.previewMove(op, delta); }
    this.snap = s;
    return s;
  }

  // ---- Circle: the centre (on a face, or on the ground), then a point on the rim; 24 sides, kept as one curve ----
  circle(s, ray) {
    if (!this.op) {
      if (!s) return false;
      const n = s.hit && s.kind !== 'ground' ? s.hit.n : [0, 0, 1];
      this.op = { c: s.p, plane: frame(n) };
      return true;
    }
    const q = this.onPlane(ray, this.op.plane, this.op.c);
    if (!q) return false;
    return this.makeCircle(dist(q.p, this.op.c), sub(q.p, this.op.c));
  }
  polygon(s, ray) {
    if (!this.op) return this.circle(s, ray);
    const q = this.onPlane(ray, this.op.plane, this.op.c);
    if (!q) return false;
    return this.makeCircle(dist(q.p, this.op.c), sub(q.p, this.op.c), this.sides || 6);
  }
  makeCircle(r, toward = null, sides = 0) {
    if (!(r > 1e-6)) return false;
    const { c, plane } = this.op;
    const u = toward && len(toward) > 1e-9 ? norm(toward) : plane.u;
    const { def, inv } = this.ctx();
    const pts = ngonPts(c, plane.n, u, r, sides || 24).map((p) => apply(inv, p));
    this.model.change(sides ? 'Polygon' : 'Circle', () => { addPolygon(def, pts); tagCurve(def, pts, sides ? 'polygon' : 'circle', true); });
    this.op = null; this.changed();
    return true;
  }

  // ---- Eraser: the edge the ray passes nearest (in the open group), or a whole group or component ----
  /** What the eraser (or Follow Me's second click, faces: false) points at: {eid, a, b} an edge of the open context,
   *  {fid, outline} a face of it, or {iid} a group or component in it. */
  eraseAt(ray, { faces = true } = {}) {
    const { o } = ray, d = norm(ray.d), c = this.cache(), base = this.host.path || [], ctx = this.ctx();
    let face = null;
    for (const tr of c.tris) { const t = rayTri(o, d, tr.a, tr.b, tr.c); if (t !== null && (!face || t < face.t)) face = { t, tr }; }
    const limit = face ? face.t * 1.02 + 1e-3 : Infinity;
    let best = null;
    for (const e of c.edges) {
      if (e.def.id !== ctx.def.id) continue;   // by id: a preview reloads the definitions
      const r = rayToSegment(o, d, e.a, e.b);
      if (!(r.t > 0) || r.t > limit) continue;
      const a = dist(add(o, mul(d, r.t)), r.onSeg) / r.t;
      if (a <= this.tol && (!best || a < best.a)) best = { a, eid: e.eid, A: e.a, B: e.b };
    }
    if (best) return { eid: best.eid, a: best.A, b: best.B };
    // a guide line (shown by a metre of it round where the ray passes) or a guide point
    for (const [gid, g] of this.model.guides || []) {
      const r = g.kind === 'line' ? lineLine(o, d, g.p, g.d) : null, q = r ? r.p2 : g.p, t = dot(sub(q, o), d);
      if (!(t > 0) || t > limit) continue;
      const a = dist(add(o, mul(d, t)), q) / t;
      if (a <= this.tol && (!best || a < best.a)) best = { a, gid, A: r ? add(q, mul(g.d, -0.5)) : q, B: r ? add(q, mul(g.d, 0.5)) : q };
    }
    if (best) return { gid: best.gid, a: best.A, b: best.B };
    if (faces && face && face.tr.def.id === ctx.def.id) {
      const { def, m, fid } = face.tr, F = def.faces.get(fid), outline = [];
      for (const l of F?.loops || []) for (let i = 0; i < l.length; i++) outline.push([apply(m, def.verts.get(l[i])), apply(m, def.verts.get(l[(i + 1) % l.length]))]);
      return { fid, outline };
    }
    const hp = face?.tr.path || [];
    if (hp.length > base.length && base.every((x, i) => hp[i] === x)) return this.locked(hp[base.length]) ? null : { iid: hp[base.length] };
    return null;
  }
  erase(s, ray) {
    if (this.sweep) return this.eraseCommit();
    const tg = this.eraseAt(ray);
    if (!tg) { this.tip = 'Point at an edge, a face, a group or a guide'; return false; }
    return this.eraseAll([tg]);
  }
  /** Hold the trigger and sweep: everything the ray passes over is collected, and goes when it is let go. */
  eraseBegin(ray) { this.sweep = new Map(); if (ray) this.eraseAdd(ray); }
  eraseAdd(ray) {
    if (!this.sweep) return;
    const tg = this.eraseAt(ray);
    if (tg) this.sweep.set(tg.eid !== undefined ? 'e' + tg.eid : tg.gid !== undefined ? 'g' + tg.gid : tg.fid !== undefined ? 'f' + tg.fid : 'i' + tg.iid, tg);
  }
  eraseCommit() {
    const all = this.sweep ? [...this.sweep.values()] : [];
    this.sweep = null;
    return all.length ? this.eraseAll(all) : false;
  }
  eraseAll(tgs) {
    const path = this.host.path || [];
    this.model.change('Erase', (m) => {
      const def = m.context(path).def;
      for (const tg of tgs) if (tg.fid !== undefined) def.faces.delete(tg.fid);   // a face goes, its edges stay
      eraseEdges(def, tgs.filter((tg) => tg.eid !== undefined).map((tg) => tg.eid));
      for (const tg of tgs) if (tg.iid !== undefined) def.insts.delete(tg.iid);
      for (const tg of tgs) if (tg.gid !== undefined) m.guides.delete(tg.gid);
      removeLooseVerts(def);
      m.purge?.();
    });
    this.eraseTarget = null; this.changed();
    return true;
  }

  // ---- Select: a click adds a whole object (a group, or the geometry connected to the face or edge) or takes it out ----
  select(s, ray) {
    const ctx = this.ctx(), base = this.host.path || [];
    this.selection ??= [];
    let add = null;
    const tg = this.eraseAt(ray);
    const hp = s?.hit?.path || [];
    if (tg?.iid !== undefined) add = [{ t: 'i', id: tg.iid }];
    else if (hp.length > base.length && base.every((x, i) => hp[i] === x)) add = [{ t: 'i', id: hp[base.length] }];
    else if (tg?.fid !== undefined) add = connected(ctx.def, [{ t: 'f', id: tg.fid }]);
    else if (tg?.eid !== undefined) add = connected(ctx.def, [{ t: 'e', id: tg.eid }]);
    if (!add || !add.length) { this.selection = []; this.tip = ''; return false; }
    const k = (x) => x.t + x.id, have = new Set(this.selection.map(k));
    if (add.every((x) => have.has(k(x)))) { const drop = new Set(add.map(k)); this.selection = this.selection.filter((x) => !drop.has(k(x))); }
    else for (const x of add) if (!have.has(k(x))) this.selection.push(x);
    this.tip = this.selection.length ? 'Selected: make a group, or give it a layer' : '';
    return true;
  }
  clearSelection() { this.selection = []; }
  /** The selection (open context) as one new group; returns its placement id. */
  makeGroup() {
    const sel = (this.selection || []).filter((x) => x.t === 'i' ? this.ctx().def.insts.has(x.id) : true);
    if (!sel.length) { this.tip = 'Select something first'; return null; }
    const path = this.host.path || [];
    const iid = this.model.change('Group', (m) => m.makeGroup(m.context(path).def, sel, 'group'));
    this.selection = iid ? [{ t: 'i', id: iid }] : [];
    this.changed();
    return iid;
  }
  /** Put the selected groups and components on a layer (tag; null takes it off). Loose geometry is grouped first. */
  tagSelection(name) {
    let sel = this.selection || [];
    if (!sel.length) { this.tip = 'Select something first'; return false; }
    if (sel.some((x) => x.t !== 'i')) { if (!this.makeGroup()) return false; sel = this.selection; }
    const path = this.host.path || [];
    this.model.change('Layer', (m) => m.setTag(m.context(path).def, sel.map((x) => x.id), name || null));
    this.changed();
    return true;
  }
  setLayerShown(name, on) { this.model.change(on ? 'Show layer' : 'Hide layer', (m) => m.setTagHidden(name, !on)); this.changed(); }
  addLayer(name = '') { let nm; this.model.change('New layer', (m) => { nm = m.addTag(name); }); this.changed(); return nm; }

  // ---- Arc: the start, the end, then how far the middle stands off (the bulge); a half circle snaps ----
  arc(s, ray) {
    if (!this.op) {
      if (!s) return false;
      this.op = { p0: s.p, n0: s.hit && s.kind !== 'ground' ? s.hit.n : null };
      return true;
    }
    if (!this.op.p1) {
      if (!s || dist(s.p, this.op.p0) < 1e-6) return false;
      return this.arcEnd(s.p);
    }
    this.hover(ray);
    return this.makeArc(this.op.h);
  }
  arcEnd(p1) {
    const op = this.op, u = norm(sub(p1, op.p0));
    let n = op.n0;
    // on the face it started on; else flat when the chord is level, upright through the chord when it is not
    if (!n || Math.abs(dot(n, u)) > 1e-6) n = Math.abs(u[2]) < 1e-6 ? [0, 0, 1] : norm(cross(u, [0, 0, 1]));
    if (!len(n)) n = [1, 0, 0];
    Object.assign(op, { p1, n, w: norm(cross(n, u)), h: 0 });
    this.tip = 'Move to bulge the arc, then click';
    return true;
  }
  arcPoints(h) {
    const { p0, p1, w, n } = this.op, c = dist(p0, p1), m = mul(add(p0, p1), 0.5);
    if (!(Math.abs(h) > 1e-6)) return null;
    const R = (h * h + (c / 2) ** 2) / (2 * Math.abs(h));
    const ctr = add(m, mul(w, Math.sign(h) * (Math.abs(h) - R)));
    const sweep = 4 * Math.atan(2 * Math.abs(h) / c);
    const u0 = norm(sub(p0, ctr));
    const nn = norm(cross(u0, norm(sub(add(m, mul(w, h)), ctr))));
    return arcPts(ctr, len(nn) ? nn : n, u0, R, sweep, 12);
  }
  makeArc(h) {
    const P = this.arcPoints(h);
    if (!P) return false;
    const { def, inv } = this.ctx(), loc = P.map((p) => apply(inv, p));
    this.model.change('Arc', () => { for (let i = 0; i + 1 < loc.length; i++) addEdge(def, loc[i], loc[i + 1]); tagCurve(def, loc, 'arc'); });
    this.op = null; this.tip = ''; this.changed();
    return true;
  }

  // ---- Curve: points the smooth curve passes through; click the last point again to end it, the first to close it ----
  curve(s) {
    if (!s) return false;
    if (!this.op) { this.op = { pts: [s.p] }; return true; }
    const P = this.op.pts, last = P[P.length - 1];
    if (P.length >= 3 && dist(s.p, P[0]) < 1e-6) return this.finishCurve(true);
    if (dist(s.p, last) < 1e-6) return P.length >= 2 ? this.finishCurve(false) : false;
    P.push(s.p);
    this.tip = 'Click the last point again to end, the first to close';
    return true;
  }
  finishCurve(closed = false) {
    const P = this.op?.pts;
    if (!P || P.length < 2) return false;
    const { def, inv } = this.ctx();
    this.model.change('Curve', () => addSpline(def, P.map((p) => apply(inv, p)), { closed }));
    this.op = null; this.tip = ''; this.changed();
    return true;
  }

  // ---- Follow Me: click the face to sweep (the profile), then an edge of the path; the chain through it is the path ----
  follow(s, ray) {
    const ctx = this.ctx();
    if (!this.op) {
      if (!s?.hit || s.hit.def !== ctx.def) { this.tip = 'Point at the face to sweep'; return false; }
      const f = ctx.def.faces.get(s.hit.fid), A = f.loops[0].map((v) => ctx.def.verts.get(v));
      this.op = { fid: s.hit.fid, cen: mul(A.reduce((a, q) => add(a, q), [0, 0, 0]), 1 / A.length), own: this.faceEdgeKeys(ctx.def, f) };
      this.tip = 'Now move along the path: the sweep follows; click to finish';
      return true;
    }
    // dragged along the path (SketchUp style): the preview so far is the result
    if (this.op.preview && this.op.upto) {
      this.model.commit('Follow me');
      this.op = null; this._frozen = null; this.tip = ''; this.eraseTarget = null; this.changed();
      return true;
    }
    const tg = this.eraseAt(ray, { faces: false });
    if (tg?.eid === undefined) { this.tip = 'Point at an edge of the path'; return false; }
    const e = ctx.def.edges.get(tg.eid);
    if (this.op.own.has([e.a, e.b].sort().join('|'))) { this.tip = 'That edge is part of the face: point at the path'; return false; }
    const fid = this.op.fid, path = chainThrough(ctx.def, tg.eid);
    this.model.change('Follow me', () => followMe(ctx.def, fid, path));
    this.op = null; this.tip = ''; this.eraseTarget = null; this.changed();
    return true;
  }

  faceEdgeKeys(def, f) { return new Set((f?.loops || []).flatMap((l) => l.map((v, i) => [v, l[(i + 1) % l.length]].sort().join('|')))); }
  /** While pointing along the path: sweep the profile from the path's end at the profile up to the edge pointed at. */
  followDrag(tg) {
    const op = this.op;
    if (tg?.eid === undefined) return;
    if (!op.adj) {
      // the edge graph of the open context as it was before the preview started (ids stay the same in the previews)
      const def = this.ctx().def, adj = new Map(), ends = new Map();
      for (const [id, e] of def.edges) {
        if (op.own.has([e.a, e.b].sort().join('|'))) continue;
        ends.set(id, [e.a, e.b]);
        for (const [x, y] of [[e.a, e.b], [e.b, e.a]]) { if (!adj.has(x)) adj.set(x, []); adj.get(x).push({ eid: id, to: y }); }
      }
      const pos = new Map([...def.verts].map(([v, p]) => [v, p.slice()]));
      if (!ends.has(tg.eid)) return;
      // the path starts at the end of the first edge nearer the profile
      const [a, b] = ends.get(tg.eid);
      const first = dist(pos.get(a), op.cen) <= dist(pos.get(b), op.cen) ? a : b;
      Object.assign(op, { adj, ends, pos, pathV: [first], pathE: [] });
      this._frozen = this.cache();
      this.model.begin(); op.preview = true;
    }
    if (!op.ends.has(tg.eid)) return;
    const i = op.pathE.indexOf(tg.eid);
    if (i >= 0) {   // back along the path: shorten it to here
      if (i + 1 === op.pathE.length) return;
      op.pathE = op.pathE.slice(0, i + 1); op.pathV = op.pathV.slice(0, i + 2);
    } else {
      // on from the end of the path: the edge itself when it touches the end, else the shortest way there along edges
      const last = op.pathV[op.pathV.length - 1], used = new Set(op.pathE), [ea, eb] = op.ends.get(tg.eid);
      const prev = new Map([[last, null]]), queue = [last];
      while (queue.length && !(prev.has(ea) || prev.has(eb))) {
        const v = queue.shift();
        for (const { eid, to } of op.adj.get(v) || []) {
          if (used.has(eid) || eid === tg.eid || prev.has(to) || op.pathV.includes(to) && to !== op.pathV[0]) continue;
          prev.set(to, { v, eid }); queue.push(to);
        }
        if (prev.size > 400) break;
      }
      const near = prev.has(ea) ? ea : prev.has(eb) ? eb : null;
      if (near === null) return;
      const stepsV = [], stepsE = [];
      for (let x = near; prev.get(x); x = prev.get(x).v) { stepsV.unshift(x); stepsE.unshift(prev.get(x).eid); }
      const far = near === ea ? eb : ea;
      op.pathE = [...op.pathE, ...stepsE, tg.eid];
      op.pathV = [...op.pathV, ...stepsV, far];
    }
    const fid = op.fid, path = op.pathE.slice();
    op.upto = path.length;
    try { this.pv((m) => followMe(m.context(this.host.path || []).def, fid, path)); this.tip = ''; }
    catch (err) { this.tip = String(err.message || err); }
  }

  // ---- typed values ----
  canType() { return (!!this.op && ['line', 'arc', 'curve', 'rect', 'box', 'circle', 'push', 'move', 'copy', 'tape', 'offset', 'section', 'resize', 'polygon'].includes(this.name)) || (this.name === 'rotate' && (!!this.op?.ref || !!this.lastRotate)) || (this.name === 'copy' && !!this.lastCopy); }
  typed(text) {
    if (!this.canType()) { this.tip = 'Start the tool first, then type a length'; return false; }
    const arr = /^\s*(?:(\d+)\s*[x×]|[*×]\s*(\d+)|\/\s*(\d+))\s*$/i.exec(String(text));
    if (arr && this.name === 'copy' && !this.op) return this.array(+(arr[1] || arr[2] || arr[3]), !!arr[3]);
    if (arr && this.name === 'rotate' && !this.op) return this.rotateArray(+(arr[1] || arr[2] || arr[3]), !!arr[3]);
    if (this.name === 'polygon') {   // 8s: eight sides; a length: the radius
      const sd = /^\s*(\d+)\s*s\s*$/i.exec(String(text));
      if (sd) { const n = +sd[1]; if (n < 3 || n > 100) { this.tip = '3 to 100 sides'; return false; } this.sides = n; this.tip = n + ' sides'; return true; }
      if (!this.op) { this.tip = 'Type 6s for six sides, or click the centre first'; return false; }
    }
    if (this.name === 'resize') {   // a factor: 2, 0.5, 50%
      const m = /^\s*(-?[\d.,]+)\s*(%?)\s*$/.exec(String(text));
      const f = m ? parseFloat(m[1].replace(',', '.')) / (m[2] ? 100 : 1) : NaN;
      if (!this.op || !(f > 0)) { this.tip = 'Type a factor such as 2 or 50%'; return false; }
      this.op.f = f; this.previewScale();
      return this.finishScale();
    }
    if (this.name === 'rotate') {   // an angle in degrees
      const a = parseFloat(String(text).replace(',', '.').replace(/[°\s]/g, ''));
      if (!Number.isFinite(a) || !this.op?.ref) { this.tip = 'Type an angle such as 45'; return false; }
      const sign = String(text).trim().startsWith('-') ? 1 : (this.op.angle < 0 ? -1 : 1);
      this.op.angle = sign * a * Math.PI / 180;
      this.previewRotate();
      return this.finishRotate();
    }
    const parts = String(text).split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    const L = parts.map((x) => parseLength(x, this.units));
    if (!L.length || L.some((x) => x === null || !Number.isFinite(x))) { this.tip = 'Type a length such as 2.5 or 250cm'; return false; }
    const op = this.op, s = this.snap;
    try {
      if (this.name === 'arc') {
        if (!op.p1) {   // the chord's length, toward the ray
          const dir = s ? sub(s.p, op.p0) : null;
          if (!dir || len(dir) < 1e-9) { this.tip = 'Point the way the arc goes, then type'; return false; }
          return this.arcEnd(add(op.p0, mul(norm(dir), L[0])));
        }
        return this.makeArc((op.h < 0 ? -1 : 1) * Math.abs(L[0]) * (parts[0].startsWith('-') ? -1 : 1));   // the bulge
      }
      if (this.name === 'curve') {
        const last = op.pts[op.pts.length - 1], dir = s ? sub(s.p, last) : null;
        if (!dir || len(dir) < 1e-9) { this.tip = 'Point the way the curve goes, then type'; return false; }
        op.pts.push(add(last, mul(norm(dir), L[0])));
        return true;
      }
      if (this.name === 'line') {
        const dir = s ? sub(s.p, op.from) : null;
        if (!dir || len(dir) < 1e-9) { this.tip = 'Point the way the line goes, then type'; return false; }
        return this.line({ p: add(op.from, mul(norm(dir), L[0])), kind: 'typed' });
      }
      if (this.name === 'rect') {
        const { u, v } = op.plane, d = s ? sub(s.p, op.p) : [0, 0, 0];
        const sw = dot(d, u) < 0 ? -1 : 1, sh = dot(d, v) < 0 ? -1 : 1;
        const w = sw * Math.abs(L[0]), h = sh * Math.abs(L[1] ?? L[0]);
        if (!w || !h) return false;
        const pts = rectPts(op.p, u, v, w, h);
        const { def, inv } = this.ctx();
        this.model.change('Rectangle', () => addPolygon(def, pts.map((p) => apply(inv, p))));
        this.op = null; this.changed();
        return true;
      }
      if (this.name === 'box') {
        if (op.base) { op.h = (parts[0].startsWith('-') ? -1 : op.h < 0 ? -1 : 1) * Math.abs(L[0]); this.previewBox(); return this.finishBox(); }
        const { u, v } = op.plane, d = s ? sub(s.p, op.p) : [0, 0, 0];
        const w = (dot(d, u) < 0 ? -1 : 1) * Math.abs(L[0]), h = (dot(d, v) < 0 ? -1 : 1) * Math.abs(L[1] ?? L[0]);
        if (!w || !h) return false;
        return this.boxBase(w, h);
      }
      if (this.name === 'polygon') return this.makeCircle(Math.abs(L[0]), s ? sub(s.p, op.c) : null, this.sides || 6);
      if (this.name === 'circle') return this.makeCircle(Math.abs(L[0]), s ? sub(s.p, op.c) : null);
      if (this.name === 'push') {
        const typedNeg = parts[0].startsWith('-');
        const d = typedNeg ? L[0] : (op.d < 0 ? -1 : 1) * L[0];
        if (Math.abs(d) < 1e-9) return false;
        op.d = d;
        const fid = op.fid;
        this.pv((m) => pushPull(m.context(this.host.path || []).def, fid, d));
        this.model.commit('Push/Pull');
        this.op = null; this._frozen = null; this.changed();
        return true;
      }
      if (this.name === 'offset') {
        op.d = (parts[0].startsWith('-') ? -1 : op.d < 0 ? -1 : 1) * Math.abs(L[0]);
        if (!this.previewOffset()) return false;
        return this.finishOffset();
      }
      if (this.name === 'section') {
        op.d = Math.abs(L[0]) * (parts[0].startsWith('-') ? -1 : 1);
        this.previewSection();
        return this.finishSection();
      }
      if (this.name === 'tape') {
        if (op.dir) {   // the guide's distance from the edge, on the side the ray is
          if (len(op.w) < 1e-9) { this.tip = 'Move off the edge to the side the guide goes, then type'; return false; }
          op.w = mul(norm(op.w), Math.abs(L[0]));
        } else {        // the measured length, toward the ray
          const dir = s ? sub(s.p, op.p0) : null;
          if (!dir || len(dir) < 1e-9) { this.tip = 'Point the way to measure, then type'; return false; }
          op.q = add(op.p0, mul(norm(dir), Math.abs(L[0])));
        }
        return this.makeTape();
      }
      if (this.name === 'move' || this.name === 'copy') {
        if (len(op.delta) < 1e-9) { this.tip = 'Point the way it moves, then type'; return false; }
        op.delta = mul(norm(op.delta), L[0]);
        this.previewMove(op, op.delta);
        return this.finishMove();
      }
    } catch (e) { this.cancel(); this.tip = String(e.message || e); }
    return false;
  }

  // ---- Measure: two clicks; the length stays on screen until the next one ----
  measure(s) {
    if (!s) return false;
    if (!this.op) { this.op = { a: s.p }; this.measured = null; return true; }
    this.measured = { a: this.op.a, b: s.p };
    this.op = null;
    return true;
  }

  // ---- Rotate: pivot (on the thing to turn), a point to turn from, then where to ----
  /** What a click on s takes: the selection if there is one, else the group under it or the geometry joined to its face. */
  whatAt(s) {
    if (this.selection?.length) return { sel: this.selection.map((x) => ({ t: x.t, id: x.id })) };
    const base = this.host.path || [], hitPath = s?.hit?.path || [], ctx = this.ctx();
    if (hitPath.length > base.length && base.every((x, i) => hitPath[i] === x)) return this.locked(hitPath[base.length]) ? null : { iid: hitPath[base.length] };
    if (s?.hit && s.hit.def.id === ctx.def.id) return { sel: connected(ctx.def, [{ t: 'f', id: s.hit.fid }]) };
    return null;
  }
  rotate(s, ray) {
    if (!s) return false;
    const op = this.op;
    if (!op) {
      const what = this.whatAt(s);
      if (!what) { this.tip = 'Point at the thing to turn, where its pivot goes'; return false; }
      const n = s.hit?.n && s.kind === 'face' ? s.hit.n : [0, 0, 1];
      this.op = { what, c: s.p, n: norm(n), ref: null, angle: 0 };
      this.lastRotate = null;
      this.tip = 'Click a point to turn from';
      return true;
    }
    if (!op.ref) {
      const q = this.onRotPlane(ray) || s.p, w = sub(q, op.c);
      const r = sub(w, mul(op.n, dot(w, op.n)));
      if (len(r) < 1e-6) { this.tip = 'Click away from the pivot'; return false; }
      op.ref = norm(r);
      this.tip = 'Turn and click (or type the angle)';
      this._frozen = this.cache();
      this.model.begin(); op.preview = true;
      return true;
    }
    this.rotateHover(ray);
    return this.finishRotate();
  }
  onRotPlane(ray) { const q = rayPlane(ray.o, norm(ray.d), { n: this.op.n, d: dot(this.op.n, this.op.c) }); return q && q.t > 0 ? q.p : null; }
  rotateHover(ray) {
    const op = this.op, q = this.onRotPlane(ray);
    if (!q) return this.snap;
    const w = sub(q, op.c), r = sub(w, mul(op.n, dot(w, op.n)));
    if (len(r) > 1e-6) {
      const u = norm(r);
      let a = Math.atan2(dot(cross(op.ref, u), op.n), dot(op.ref, u));
      const step = Math.PI / 36;   // 5°
      a = Math.round(a / step) * step;
      if (Math.abs(a - op.angle) > 1e-9) { op.angle = a; this.previewRotate(); }
    }
    this.snap = { p: q, kind: 'plane' };
    return this.snap;
  }
  previewRotate() {
    const op = this.op, path = this.host.path || [];
    this.pv((m) => {
      const ctx = m.context(path);
      const sel = op.what.iid !== undefined ? [{ t: 'i', id: op.what.iid }] : op.what.sel;
      transformSel(ctx.def, sel, this.rotIn(ctx, op.c, op.n, op.angle));
    });
  }
  /** The rotation about the axis (c, n) of the root, in the coordinates of the open context. */
  rotIn(ctx, c, n, a) { return rotation(norm(applyDir(ctx.inv, n)), a, apply(ctx.inv, c)); }
  finishRotate() {
    const op = this.op;
    if (Math.abs(op.angle) < 1e-9) { this.cancel(); return false; }
    this.model.commit('Rotate');
    this.lastRotate = { what: op.what, c: op.c, n: op.n, angle: op.angle };
    this.tip = 'Turned ' + Math.round(op.angle * 180 / Math.PI) + '°: type 3x for copies round the pivot, or /3';
    this.op = null; this._frozen = null; this.changed();
    return true;
  }
  /** The last turn as copies instead: n of them, each turned a step more (or n spread over the turn); the original stays. */
  rotateArray(n, divide) {
    const lr = this.lastRotate;
    if (!lr || !(n >= 1 && n <= 360)) return false;
    const path = this.host.path || [];
    this.model.undo();
    this.model.change(divide ? 'Rotate copy /' + n : 'Rotate copy ×' + n, (m) => {
      const ctx = m.context(path);
      const sel = lr.what.iid !== undefined ? [{ t: 'i', id: lr.what.iid }] : lr.what.sel;
      for (let k = 1; k <= n; k++) transformSel(ctx.def, copySel(ctx.def, sel), this.rotIn(ctx, lr.c, lr.n, lr.angle * (divide ? k / n : k)));
    });
    this.lastRotate = null; this.tip = '';
    this.changed();
    return true;
  }

  // ---- Scale: about the middle of the bottom of what is scaled ----
  /** World points of what (a placement or a selection in the open context). */
  pointsOf(what) {
    const ctx = this.ctx(), out = [];
    if (what.iid !== undefined) {
      const inst = ctx.def.insts.get(what.iid), d = inst && this.model.defs.get(inst.def);
      const bb = d && this.model.bbox(d, mmul(ctx.m, inst.m));
      if (bb) for (const x of [bb.min[0], bb.max[0]]) for (const y of [bb.min[1], bb.max[1]]) for (const z of [bb.min[2], bb.max[2]]) out.push([x, y, z]);
      return out;
    }
    const vs = new Set();
    for (const x of what.sel) {
      if (x.t === 'f') for (const l of ctx.def.faces.get(x.id)?.loops || []) for (const v of l) vs.add(v);
      else if (x.t === 'e') { const e = ctx.def.edges.get(x.id); if (e) { vs.add(e.a); vs.add(e.b); } }
      else if (x.t === 'i') out.push(...this.pointsOf({ iid: x.id }));
    }
    for (const v of vs) out.push(apply(ctx.m, ctx.def.verts.get(v)));
    return out;
  }
  resize(s, ray) {
    if (!this.op) {
      const what = s && this.whatAt(s);
      if (!what) { this.tip = 'Point at the thing to scale'; return false; }
      const P = this.pointsOf(what);
      if (!P.length) return false;
      const lo = P.reduce((a, p) => a.map((x, k) => Math.min(x, p[k])), [Infinity, Infinity, Infinity]);
      const hi = P.reduce((a, p) => a.map((x, k) => Math.max(x, p[k])), [-Infinity, -Infinity, -Infinity]);
      const base = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, lo[2]];
      let u = sub(s.p, base);
      if (len(u) < 1e-6) u = sub(hi, base);
      if (len(u) < 1e-6) return false;
      this.op = { what, base, from: add(base, u), u: norm(u), d0: len(u), f: 1 };
      this._frozen = this.cache();
      this.model.begin(); this.op.preview = true;
      this.tip = 'Move out to grow, in to shrink; click (or type a factor)';
      return true;
    }
    this.scaleHover(ray);
    return this.finishScale();
  }
  scaleHover(ray) {
    const op = this.op, r = lineLine(ray.o, norm(ray.d), op.base, op.u);
    if (!r || r.t <= 0) return this.snap;
    const L = Math.max(this.grid || 0.01, this.round(r.s)), f = Math.round((L / op.d0) * 100) / 100;
    if (f > 0 && Math.abs(f - op.f) > 1e-9) { op.f = f; this.previewScale(); }
    this.snap = { p: add(op.base, mul(op.u, op.d0 * op.f)), kind: 'push' };
    return this.snap;
  }
  previewScale() {
    const op = this.op, path = this.host.path || [];
    this.pv((m) => {
      const ctx = m.context(path);
      const sel = op.what.iid !== undefined ? [{ t: 'i', id: op.what.iid }] : op.what.sel;
      transformSel(ctx.def, sel, scaling(op.f, apply(ctx.inv, op.base)));
    });
  }
  finishScale() {
    if (Math.abs(this.op.f - 1) < 1e-9) { this.cancel(); return false; }
    this.model.commit('Scale');
    this.op = null; this._frozen = null; this.tip = ''; this.changed();
    return true;
  }

  // ---- Hide: what the eraser would take is hidden instead ----
  hide(s, ray) {
    const tg = this.eraseAt(ray);
    if (!tg || tg.gid !== undefined) { this.tip = 'Point at an edge, a face or a group'; return false; }
    const path = this.host.path || [];
    const sel = [tg.eid !== undefined ? { t: 'e', id: tg.eid } : tg.fid !== undefined ? { t: 'f', id: tg.fid } : { t: 'i', id: tg.iid }];
    this.model.change('Hide', (m) => hideSel(m.context(path).def, sel));
    this.eraseTarget = null; this.changed();
    return true;
  }
  unhideAll() {
    if (!hiddenCount(this.model)) return false;
    this.model.change('Unhide all', (m) => unhideAll(m));
    this.changed();
    return true;
  }

  // ---- Angle: the corner, then a point on each arm; the angle stays on screen ----
  angle(s) {
    if (!s) return false;
    const op = this.op;
    if (!op) { this.op = { c: s.p }; this.measuredAngle = null; return true; }
    if (!op.a) { if (dist(s.p, op.c) < 1e-6) return false; op.a = s.p; return true; }
    if (dist(s.p, op.c) < 1e-6) return false;
    this.measuredAngle = { c: op.c, a: op.a, b: s.p };
    this.op = null;
    return true;
  }
  static angleOf(c, a, b) { const u = norm(sub(a, c)), v = norm(sub(b, c)); return Math.atan2(len(cross(u, v)), dot(u, v)) * 180 / Math.PI; }

  // ---- Markup: freehand strokes in the air, in a group of their own ----
  markBegin(p) { this.stroke = p ? [p] : []; }
  markAdd(p) {
    const S = this.stroke;
    if (!S) return;
    if (!S.length || dist(S[S.length - 1], p) >= (this.markStep || 0.01)) S.push(p);
  }
  markCommit({ name = 'Markup', layer = 'Markup' } = {}) {
    const S = this.stroke;
    this.stroke = null;
    if (!S || S.length < 2) return false;
    this.model.change('Markup', (m) => {
      const root = m.root;
      let inst = [...root.insts.values()].find((i) => i.tag === layer && m.defs.get(i.def)?.name === name);
      if (!inst) {
        const nd = m.newDef('group', name);
        if (!m.tag(layer)) m.addTag(layer);
        const iid = m.place(root, nd.id, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
        inst = root.insts.get(iid); inst.tag = m.tag(layer).name;
      }
      const d = m.defs.get(inst.def);
      for (let i = 0; i + 1 < S.length; i++) addEdge(d, S[i], S[i + 1]);
    });
    this.changed();
    return true;
  }
  markup() { this.tip = 'Hold the trigger and draw'; return false; }
  /** All markup strokes gone (one undo step). */
  clearMarkup({ name = 'Markup', layer = 'Markup' } = {}) {
    const root = this.model.root;
    const iids = [...root.insts].filter(([, i]) => i.tag === layer && this.model.defs.get(i.def)?.name === name).map(([id]) => id);
    if (!iids.length) return false;
    this.model.change('Delete markup', (m) => { for (const id of iids) m.root.insts.delete(id); m.purge?.(); });
    this.changed();
    return true;
  }

  // ---- Offset: a face's outline again, in (positive) or out by the distance moved from the click ----
  offset(s, ray) {
    if (!this.op) {
      const ctx = this.ctx();
      if (!s?.hit || s.hit.def.id !== ctx.def.id) { this.tip = 'Point at a face to offset'; return false; }
      const def = ctx.def, f = def.faces.get(s.hit.fid);
      const P = f.loops[0].map((v) => apply(ctx.m || [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], def.verts.get(v)));
      const cen = mul(P.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / P.length);
      this.op = { fid: s.hit.fid, n: s.hit.n, p0: s.p, cen, d: 0 };
      this._frozen = this.cache();
      this.model.begin(); this.op.preview = true;
      this.tip = 'Move in or out and click (or type the distance)';
      return true;
    }
    this.offsetHover(ray);
    if (!this.op.d) { this.tip = 'Move off the click first'; return false; }
    return this.finishOffset();
  }
  offsetHover(ray) {
    const op = this.op, q = rayPlane(ray.o, norm(ray.d), { n: op.n, d: dot(op.n, op.p0) });
    if (!q || q.t <= 0) return this.snap;
    const L = this.round(dist(q.p, op.p0)), d = dist(q.p, op.cen) < dist(op.p0, op.cen) ? L : -L;   // toward the middle: in
    if (Math.abs(d - op.d) > 1e-9) { op.d = d; this.previewOffset(); }
    this.snap = { p: q.p, kind: 'plane' };
    return this.snap;
  }
  previewOffset() {
    const op = this.op, path = this.host.path || [], fid = op.fid, d = op.d;
    if (!d) { this.pv(() => {}); return false; }
    const ok = this.pv((m) => offsetFace(m.context(path).def, fid, d));
    if (ok === null) { this.tip = 'That is further than the face allows'; return false; }
    this.tip = '';
    return true;
  }
  finishOffset() {
    this.model.commit('Offset');
    this.op = null; this._frozen = null; this.changed();
    return true;
  }

  // ---- Section: a cutting plane on a face (or level with the ground), moved in, kept as the model's active cut ----
  section(s, ray) {
    if (!this.op) {
      if (!s) return false;
      // on a face the plane lies on it and cuts away the side you look from; elsewhere it is level and cuts away the top
      const n = s.kind === 'face' && s.hit?.n ? s.hit.n : [0, 0, 1];
      this.op = { p0: s.p, n: norm(n), d: 0, section: true };
      this.model.begin(); this.op.preview = true;
      this.previewSection();
      this.tip = 'Move the cut in and click (or type how far)';
      return true;
    }
    this.sectionHover(ray);
    return this.finishSection();
  }
  sectionHover(ray) {
    const op = this.op, r = lineLine(ray.o, norm(ray.d), op.p0, op.n);
    if (!r || r.t <= 0) return this.snap;
    const d = -this.round(r.s);   // into the thing: against the normal
    if (Math.abs(d - op.d) > 1e-9) { op.d = d; this.previewSection(); }
    this.snap = { p: add(op.p0, mul(op.n, -op.d)), kind: 'plane' };
    return this.snap;
  }
  previewSection() {
    const op = this.op, p = add(op.p0, mul(op.n, -op.d)), n = op.n;
    this.model.preview((m) => m.addSection(p, n));
  }
  finishSection() {
    this.model.commit('Section plane');
    this.op = null; this.tip = ''; this.changed();
    return true;
  }
  /** The section cut on or off (the plane stays). */
  toggleCuts() {
    if (!this.model.sections?.size) { this.tip = 'No section yet: use the Section tool'; return false; }
    const on = !this.model.sectionView.cuts;
    this.model.change(on ? 'Section cut on' : 'Section cut off', (m) => { m.sectionView.cuts = on; if (on && m.activeSection === null) m.activeSection = [...m.sections.keys()].pop(); });
    this.changed();
    return true;
  }

  // ---- Tape: from an edge (or guide) a parallel guide line; from a point a measurement and a guide point ----
  tape(s) {
    if (!s) return false;
    if (!this.op) {
      const dir = (s.kind === 'edge' || s.kind === 'guide') && s.dir ? s.dir : null;
      this.op = { p0: s.p, dir, w: [0, 0, 0], q: null };
      this.measured = null;
      this.tip = dir ? 'Move off the edge and click (or type the distance)' : 'Click where to measure to (or type the length)';
      return true;
    }
    if (!this.op.dir) this.op.q = s.p;
    return this.makeTape();
  }
  makeTape() {
    const op = this.op;
    if (op.dir) {
      if (len(op.w) < 1e-9) { this.tip = 'Move off the edge first'; return false; }
      const p = add(op.p0, op.w), d = op.dir;
      this.model.change('Guide line', (m) => m.addGuideLine(p, d));
      this.measured = { a: op.p0, b: p };
    } else {
      if (!op.q || dist(op.q, op.p0) < 1e-9) return false;
      const q = op.q;
      this.model.change('Guide point', (m) => m.addGuidePoint(q));
      this.measured = { a: op.p0, b: q };
    }
    this.op = null; this.tip = ''; this.changed();
    return true;
  }
  /** Every guide line and point in the model: removed in one undo step. */
  clearGuides() {
    if (!this.model.guides?.size) return false;
    this.model.change('Delete guides', (m) => m.guides.clear());
    this.changed();
    return true;
  }

  /** What to draw now, in model root coordinates. */
  view() {
    const s = this.snap, op = this.op, lines = [];
    let label = null;
    if (this.name === 'line' && op && s) { lines.push({ a: op.from, b: s.p, kind: s.kind }); label = { p: mid(op.from, s.p), text: this.fmt(dist(op.from, s.p)) }; }
    if (this.name === 'box' && op?.base) label = { p: this.snap?.p || op.base[2], text: this.fmt(Math.abs(op.w)) + ' × ' + this.fmt(Math.abs(op.dh)) + ' × ' + this.fmt(Math.abs(op.h)) };
    if ((this.name === 'rect' || (this.name === 'box' && !op?.base)) && op && s) {
      const { u, v } = op.plane, d = sub(s.p, op.p), w = dot(d, u), h = dot(d, v);
      const P = rectPts(op.p, u, v, w, h);
      for (let i = 0; i < 4; i++) lines.push({ a: P[i], b: P[(i + 1) % 4], kind: 'rect' });
      label = { p: s.p, text: this.fmt(Math.abs(w)) + ' × ' + this.fmt(Math.abs(h)) };
    }
    if (this.name === 'circle' && op && s) {
      const r = dist(s.p, op.c), P = r > 1e-9 ? ngonPts(op.c, op.plane.n, norm(sub(s.p, op.c)), r, 24) : [];
      for (let i = 0; i < P.length; i++) lines.push({ a: P[i], b: P[(i + 1) % P.length], kind: 'rect' });
      lines.push({ a: op.c, b: s.p, kind: s.kind });
      label = { p: s.p, text: 'R ' + this.fmt(r) };
    }
    if (this.name === 'arc' && op) {
      if (!op.p1 && s) { lines.push({ a: op.p0, b: s.p, kind: s.kind }); label = { p: s.p, text: this.fmt(dist(op.p0, s.p)) }; }
      if (op.p1) {
        const P = this.arcPoints(op.h) || [op.p0, op.p1];
        for (let i = 0; i + 1 < P.length; i++) lines.push({ a: P[i], b: P[i + 1], kind: 'rect' });
        if (s) label = { p: s.p, text: this.fmt(Math.abs(op.h || 0)) };
      }
    }
    if (this.name === 'curve' && op) {
      const P = s ? [...op.pts, s.p] : op.pts;
      const S = P.length >= 2 ? smoothPts(P, false) : P;
      for (let i = 0; i + 1 < S.length && lines.length < 60; i++) lines.push({ a: S[i], b: S[i + 1], kind: 'rect' });
      if (s) label = { p: s.p, text: this.fmt(dist(op.pts[op.pts.length - 1], s.p)) };
    }
    if (this.name === 'follow' && op && this.eraseTarget?.a) lines.push({ a: this.eraseTarget.a, b: this.eraseTarget.b, kind: 'push' });
    if (this.selection?.length) {
      const c = this.cache(), def = this.ctx().def, base = (this.host.path || []).length;
      const fs = new Set(this.selection.filter((x) => x.t === 'f').map((x) => x.id)), es = new Set(this.selection.filter((x) => x.t === 'e').map((x) => x.id));
      const is = new Set(this.selection.filter((x) => x.t === 'i').map((x) => x.id));
      for (const e of c.edges) {
        if (lines.length > 200) break;
        if ((e.def === def && es.has(e.eid)) || (e.path.length > base && is.has(e.path[base]))) lines.push({ a: e.a, b: e.b, kind: 'selected' });
      }
      void fs;
    }
    if (this.name === 'erase') {
      const show = (tg) => { if (tg.a) lines.push({ a: tg.a, b: tg.b, kind: 'erase' }); for (const [a, b] of tg.outline || []) lines.push({ a, b, kind: 'erase' }); };
      for (const tg of this.sweep?.values() || []) show(tg);
      if (this.eraseTarget) show(this.eraseTarget);
    }
    if (this.name === 'push' && op) { lines.push({ a: op.p0, b: add(op.p0, mul(op.n, op.d)), kind: 'push' }); label = { p: add(op.p0, mul(op.n, op.d)), text: this.fmt(op.d) }; }
    if ((this.name === 'move' || this.name === 'copy') && op && s) { lines.push({ a: op.from, b: s.p, kind: s.kind }); label = { p: s.p, text: this.fmt(len(op.delta)) }; }
    if (this.name === 'rotate' && op) {
      const r = 0.3, P = [];
      const v = cross(op.n, op.ref || [1, 0, 0]), u = op.ref || [1, 0, 0];
      for (let i = 0; i <= 36; i++) { const a = (i / 36) * Math.PI * 2; P.push(add(op.c, add(mul(u, r * Math.cos(a)), mul(v, r * Math.sin(a))))); }
      for (let i = 0; i < 36; i++) lines.push({ a: P[i], b: P[i + 1], kind: 'measure' });
      if (op.ref) {
        const to = add(mul(u, Math.cos(op.angle)), mul(v, Math.sin(op.angle)));
        lines.push({ a: op.c, b: add(op.c, mul(u, r * 1.3)), kind: 'axis-x' }, { a: op.c, b: add(op.c, mul(to, r * 1.3)), kind: 'push' });
        label = { p: add(op.c, mul(to, r * 1.3)), text: Math.round(op.angle * 1800 / Math.PI) / 10 + '°' };
      }
    }
    if (this.name === 'resize' && op) { lines.push({ a: op.base, b: add(op.base, mul(op.u, op.d0 * op.f)), kind: 'push' }); label = { p: add(op.base, mul(op.u, op.d0 * op.f)), text: '× ' + op.f }; }
    if (this.name === 'hide' && this.eraseTarget) { const tg = this.eraseTarget; if (tg.a) lines.push({ a: tg.a, b: tg.b, kind: 'measure' }); for (const [a, b] of tg.outline || []) lines.push({ a, b, kind: 'measure' }); }
    if (this.name === 'angle') {
      const m = op?.a && s ? { c: op.c, a: op.a, b: s.p } : this.measuredAngle;
      if (op && !op.a && s) lines.push({ a: op.c, b: s.p, kind: 'measure' });
      if (m) { lines.push({ a: m.c, b: m.a, kind: 'measure' }, { a: m.c, b: m.b, kind: 'measure' }); label = { p: m.c, text: Math.round(XRTools.angleOf(m.c, m.a, m.b) * 10) / 10 + '°' }; }
    }
    if (this.name === 'markup' && this.stroke) for (let i = 0; i + 1 < this.stroke.length && lines.length < 250; i++) lines.push({ a: this.stroke[i], b: this.stroke[i + 1], kind: 'markup' });
    if (this.name === 'polygon' && op && s) {
      const r = dist(s.p, op.c), P = r > 1e-9 ? ngonPts(op.c, op.plane.n, norm(sub(s.p, op.c)), r, this.sides || 6) : [];
      for (let i = 0; i < P.length; i++) lines.push({ a: P[i], b: P[(i + 1) % P.length], kind: 'rect' });
      label = { p: s.p, text: (this.sides || 6) + ' · R ' + this.fmt(r) };
    }
    if (this.name === 'offset' && op && s) { lines.push({ a: op.p0, b: s.p, kind: 'measure' }); label = { p: s.p, text: this.fmt(Math.abs(op.d)) + (op.d < 0 ? ' ↗' : ' ↘') }; }
    if (this.name === 'section' && op) {
      const p = add(op.p0, mul(op.n, -op.d)), fr = frame(op.n), r = 1.5;
      const C = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => add(p, add(mul(fr.u, x * r), mul(fr.v, y * r))));
      for (let i = 0; i < 4; i++) lines.push({ a: C[i], b: C[(i + 1) % 4], kind: 'section' });
      lines.push({ a: op.p0, b: p, kind: 'measure' });
      label = { p, text: this.fmt(op.d) };
    }
    if (this.name === 'tape') {
      if (op?.dir) {
        const b = add(op.p0, op.w), L = 50;
        lines.push({ a: add(b, mul(op.dir, -L)), b: add(b, mul(op.dir, L)), kind: 'guide' }, { a: op.p0, b, kind: 'measure' });
        label = { p: b, text: this.fmt(len(op.w)) };
      } else {
        const m = op && s ? { a: op.p0, b: s.p } : this.measured;
        if (m) { lines.push({ a: m.a, b: m.b, kind: 'measure' }); label = { p: mid(m.a, m.b), text: this.fmt(dist(m.a, m.b)) }; }
      }
    }
    if (this.name === 'measure') {
      const m = op && s ? { a: op.a, b: s.p } : this.measured;
      if (m) { lines.push({ a: m.a, b: m.b, kind: 'measure' }); label = { p: mid(m.a, m.b), text: this.fmt(dist(m.a, m.b)) }; }
    }
    return { cursor: s ? { p: s.p, kind: s.kind } : null, lines, label, tip: this.tip };
  }
}

const mid = (a, b) => mul(add(a, b), 0.5);
