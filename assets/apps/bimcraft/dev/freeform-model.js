/* SPDX-License-Identifier: Apache-2.0 */
/**
 * freeform-model.js — free-form elements: geometry modelled the push/pull way (the ModelCraft kernel, ./mc/model.js) and
 * kept in the IFC as an ordinary element of a level, so plans, sections, elevations, sheets, schedules and clash checks
 * see it like anything else (model-plan.js planCut and res-views.js projectView read every element's mesh).
 * No DOM: tests/freeform-test.mjs runs it in Node. Plan millimetres in the storey's own axes.
 *
 * Written as: an element of FREEFORM_CLASSES (IfcBuildingElementProxy by default; IfcWall, IfcSlab, IfcColumn, IfcBeam,
 * IfcRoof, IfcCovering when tagged as one) contained in its level, placed at `at` (+ `z` above the level) relative to it;
 * Body = the ModelCraft model's faces as an IfcTriangulatedFaceSet (IFC4) or a faceted brep / surface model (IFC2X3)
 * (ifc-place.js bodyItems), one per paint colour, each with an IfcSurfaceStyle "FreeForm #rrggbb"; CadCraft_FreeForm (Model = the ModelCraft file as JSON text — what Edit opens again —,
 * Class, Volume, Area, Closed). The ModelCraft model is in metres, Z up, with its origin at the element's placement.
 *
 *   FREEFORM_PSET, FREEFORM_CLASSES ({ key: { ifc, label } }), FREEFORM_DEFAULT_CLASS
 *   meshOf(json) → { positions (mm, Float64Array), indices (Uint32Array), parts: [{ color (#rrggbb | null), indices }], closed,
 *       volume (mm³), area (mm²), faces }
 *       every shown face of the model (groups and components placed through their matrices), triangulated
 *   readFreeforms(w, storey?) → [{ id, guid, storey, at: [x, y], z, angle, cls, json }]
 *   placeFreeform({ storey (GlobalId), at, z, angle, cls, json, name, guid }) → op
 *   changeFreeform(guid, { json, cls, at, z, angle, name }) → op   (a new class: the element is made again, same GlobalId)
 *   removeFreeforms(guids) → op
 *   Errors: model.err.ff.empty (no faces), model.err.ff.bad (not a ModelCraft model), model.err.ff.class, model.err.nolevel
 */
import { Model, faceTris, paintHex, isPaint } from './mc/model.js';
import { op } from './model-ops.js';
import { ids, val } from './ifc-util.js';
import { round } from './model-write.js';

export const FREEFORM_PSET = 'CadCraft_FreeForm';
export const FREEFORM_CLASSES = {
  proxy: { ifc: 'IFCBUILDINGELEMENTPROXY', label: 'model.ff.cls.proxy' },
  wall: { ifc: 'IFCWALL', label: 'model.ff.cls.wall' },
  slab: { ifc: 'IFCSLAB', label: 'model.ff.cls.slab' },
  column: { ifc: 'IFCCOLUMN', label: 'model.ff.cls.column' },
  beam: { ifc: 'IFCBEAM', label: 'model.ff.cls.beam' },
  roof: { ifc: 'IFCROOF', label: 'model.ff.cls.roof' },
  covering: { ifc: 'IFCCOVERING', label: 'model.ff.cls.covering' },
  furniture: { ifc: 'IFCFURNITURE', label: 'model.ff.cls.furniture' },   // KHADRAW F: built-in furniture (furniture.js reads its boards)
};
export const FREEFORM_DEFAULT_CLASS = 'proxy';
const IFC_CLASSES = Object.values(FREEFORM_CLASSES).map((c) => c.ifc);
const refuse = (key) => { throw Object.assign(new Error(key), { key }); };

/** A ModelCraft model from its JSON (text or parsed). Throws model.err.ff.bad. */
export function loadMc(json) {
  let j = json;
  if (typeof j === 'string') { try { j = JSON.parse(j); } catch (e) { refuse('model.err.ff.bad'); } }
  const m = new Model();
  try { m.load(j); } catch (e) { refuse('model.err.ff.bad'); }
  return m;
}

/** Column-major 4×4 times a point. */
const apply = (M, p) => [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]];

/** The model's shown faces as one welded triangle mesh in millimetres, with its volume (closed meshes) and area. */
export function meshOf(json) {
  const m = json instanceof Model ? json : loadMc(json);
  const pos = [], idx = [], weld = new Map();
  const vert = (p) => {
    const q = p.map((v) => Math.round(v * 1e6) / 1e3);   // metres → mm, on a 1 µm grid (so shared corners weld)
    const k = q.join(',');
    let i = weld.get(k);
    if (i === undefined) { i = pos.length / 3; weld.set(k, i); pos.push(q[0], q[1], q[2]); }
    return i;
  };
  let faces = 0;
  const byColor = new Map();   // '#rrggbb' | '' (unpainted) → triangle indices
  m.walkShown((def, M, path, instColor) => {
    // a mirrored placement turns its faces inside out: put the winding back
    const det = M[0] * (M[5] * M[10] - M[9] * M[6]) - M[4] * (M[1] * M[10] - M[9] * M[2]) + M[8] * (M[1] * M[6] - M[5] * M[2]);
    for (const f of def.faces.values()) {
      if (f.hidden) continue;
      const tris = faceTris(def, f);
      if (!tris.length) continue;
      faces++;
      const paint = f.color || instColor;   // a face's own paint, else what its group or component was painted
      const hex = paint && isPaint(paint) ? String(paintHex(paint) || '').toLowerCase() : '';
      if (!byColor.has(hex)) byColor.set(hex, []);
      const part = byColor.get(hex);
      for (const tr of tris) {
        const [a, b, c] = tr.map((v) => vert(apply(M, def.verts.get(v))));
        if (a === b || b === c || a === c) continue;
        if (det < 0) { idx.push(a, c, b); part.push(a, c, b); } else { idx.push(a, b, c); part.push(a, b, c); }
      }
    }
  });
  const parts = [...byColor].filter(([, I]) => I.length).map(([color, I]) => ({ color: /^#[0-9a-f]{6}$/.test(color) ? color : null, indices: Uint32Array.from(I) }));
  // closed: every edge used exactly twice, once each way
  const half = new Map();
  for (let i = 0; i < idx.length; i += 3) for (let k = 0; k < 3; k++) { const key = idx[i + k] + '_' + idx[i + (k + 1) % 3]; half.set(key, (half.get(key) || 0) + 1); }
  let closed = idx.length > 0;
  for (const [key, n] of half) { const [a, b] = key.split('_'); if (n !== 1 || half.get(b + '_' + a) !== 1) { closed = false; break; } }
  let volume = 0, area = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const A = idx[i] * 3, B = idx[i + 1] * 3, C = idx[i + 2] * 3;
    const a = [pos[A], pos[A + 1], pos[A + 2]], b = [pos[B], pos[B + 1], pos[B + 2]], c = [pos[C], pos[C + 1], pos[C + 2]];
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    area += Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
  }
  return { positions: Float64Array.from(pos), indices: Uint32Array.from(idx), parts, closed, volume: closed ? Math.abs(volume) : 0, area, faces };
}

/** One part's own mesh: its triangles, its vertices renumbered (positions in mm). */
function partMesh(positions, indices) {
  const map = new Map(), P = [], I = [];
  for (const v of indices) {
    let k = map.get(v);
    if (k === undefined) { k = P.length / 3; map.set(v, k); P.push(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]); }
    I.push(k);
  }
  return { type: 'mesh', positions: P, indices: I };
}

/** Free-form elements (those with CadCraft_FreeForm), in each storey's plan axes. */
export function readFreeforms(w, storey = null) {
  const out = [];
  const so = w.storeyOf();
  for (const cls of IFC_CLASSES) {
    let list = [];
    try { list = ids(w.api, w.mid, cls); } catch (e) { continue; }
    for (const id of list) {
      const ps = w.readPset(id, FREEFORM_PSET);
      if (!ps) continue;
      const st = so.get(id);
      if (storey !== null && st !== storey) continue;
      const line = w.api.GetLine(w.mid, id, false);
      const lp = line.ObjectPlacement?.value;
      const stLine = st ? w.api.GetLine(w.mid, st, false) : null;
      const M = lp && stLine ? w.relMatrix(stLine.ObjectPlacement.value, lp) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
      out.push({
        id, guid: val(line.GlobalId), storey: st, name: val(line.Name) || '', at: [M[12], M[13]], z: M[14],
        angle: Math.round(Math.atan2(M[1], M[0]) * 180 / Math.PI * 1e6) / 1e6,
        cls: String(ps.Class || FREEFORM_DEFAULT_CLASS), json: String(ps.Model || ''),
      });
    }
  }
  return out;
}

/** Write one free-form element (a new one when f.id is null). */
function writeFreeform(w, f) {
  const cls = FREEFORM_CLASSES[f.cls];
  if (!cls) refuse('model.err.ff.class');
  if (!w.v4 && f.cls !== 'proxy') refuse('model.err.ff.class');   // IFC2X3 files: a proxy only (the other classes' attributes differ)
  const model = loadMc(f.json);
  const mesh = meshOf(model);
  if (!mesh.indices.length) refuse('model.err.ff.empty');
  const st = w.api.GetLine(w.mid, f.storey, false);
  let id = f.id;
  if (!id) {
    const args = [f.guid || w.guid(), w.ownerHistory(), w.L(f.name || 'Free-form'), null, w.L('FreeForm'), w.H(w.placeAt(st.ObjectPlacement.value, f.at[0], f.at[1], f.z || 0, f.angle || 0)), null, null];   // i18n-ignore: IFC Name / ObjectType
    if (w.v4) args.push('NOTDEFINED');
    else args.push(null);   // IfcBuildingElementProxy (IFC2X3): CompositionType
    id = w.make(cls.ifc, ...args);
    w.contain(id, f.storey);
  } else {
    const line = w.api.GetLine(w.mid, id, false);
    w.movePlacement(line.ObjectPlacement.value, f.at[0], f.at[1], f.z || 0, f.angle || 0);
  }
  // one face set per paint colour, each styled with it (unpainted faces: no style, the viewer's default)
  const items = [], styled = [];
  let type = null;
  for (const part of mesh.parts) {
    const b = w.bodyItems(partMesh(mesh.positions, part.indices));
    if (type && b.type !== type) { type = null; break; }   // closed and open parts in an IFC2X3 file: fall back to one item
    type = b.type;
    items.push(...b.items);
    if (part.color) for (const it of b.items) styled.push([it, part.color]);
  }
  if (!type) {
    items.length = 0; styled.length = 0;
    const b = w.bodyItems({ type: 'mesh', positions: [...mesh.positions], indices: [...mesh.indices] });
    type = b.type; items.push(...b.items);
  }
  w.setShape(id, [w.rep('body', 'Body', type, items)]);
  for (const [it, hex] of styled) {
    const rgb = [1, 3, 5].map((o) => round(parseInt(hex.slice(o, o + 2), 16) / 255, 4));
    w.styleItem(it, w.surfaceStyle('FreeForm ' + hex, rgb));   // i18n-ignore: style name in the file
  }
  const text = typeof f.json === 'string' ? f.json : JSON.stringify(f.json);
  w.upsertPset(id, FREEFORM_PSET, [
    ['Model', 'IFCTEXT', text], ['Class', 'IFCLABEL', f.cls],
    ['Volume', 'IFCVOLUMEMEASURE', round(mesh.volume / 1e9, 9)], ['Area', 'IFCAREAMEASURE', round(mesh.area / 1e6, 6)],
    ['Closed', 'IFCBOOLEAN', mesh.closed],
  ]);
  return id;
}

/** A new free-form element on a level. One undo step. */
export function placeFreeform({ storey, at = [0, 0], z = 0, angle = 0, cls = FREEFORM_DEFAULT_CLASS, json, name = '', guid = null }) {
  const spec = { at: [at[0], at[1]], z, angle, cls, json, name, guid };
  return op((w) => {
    const st = w.byGuid(storey);
    if (!st) refuse('model.err.nolevel');
    if (!spec.guid) spec.guid = val(w.guid());   // fixed the first time, so a redo makes the same element
    const id = writeFreeform(w, { ...spec, id: null, storey: st });
    return { id, ids: [id], made: new Map([[spec.guid, id]]) };
  });
}

/** Change a free-form element: its model, class, place or name. A new class makes it again under the same GlobalId. */
export function changeFreeform(guid, ch) {
  const c = { ...ch };
  return op((w) => {
    const cur = readFreeforms(w).find((x) => x.guid === guid);
    if (!cur) refuse('model.err.ff.gone');
    const next = { ...cur, ...c };
    if (next.cls !== cur.cls) {
      w.dropProduct([cur.id]);
      const id = writeFreeform(w, { ...next, id: null, guid });
      return { id, ids: [id] };
    }
    const id = writeFreeform(w, next);
    return { id, ids: [id] };
  });
}

export function removeFreeforms(guids) {
  return op((w) => {
    const list = guids.map((g) => w.byGuid(g)).filter(Boolean);
    if (list.length) w.dropProduct(list);
    return { id: null, ids: [] };
  });
}
