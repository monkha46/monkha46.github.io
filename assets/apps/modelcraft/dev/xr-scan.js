/* SPDX-License-Identifier: Apache-2.0 */
/**
 * xr-scan.js — the room a headset knows (Quest's Space Setup: walls, floor, ceiling, door and window frames, furniture
 * boxes) as model geometry. xr.js reads it from WebXR plane and mesh detection; this file only builds the model, so it
 * runs in tests without a headset.
 *
 *   roomItems(frame, refSpace, toModel, opts)  → [{type: 'plane', label, poly}, {type: 'box', label, corners},
 *                                                  {type: 'mesh', label, tris}] (model m); opts.mesh takes the room mesh too
 *   meshTris(vertices, indices, map, cell)      → the room mesh as triangles, welded on a grid of `cell` metres
 *   buildScan(model, path, items, names)        → {groups, planes, boxes} — one undo step
 *
 * Every item is a group of its own, named after what it is (Wall, Floor, Table…), on the layer "Scanned room" (planes)
 * or "Scanned furniture" (boxes), so they never merge with what you drew and can be hidden in one go.
 */
import { addPolygon, meshDef, edgeFaces, faceNormal } from './model.js';
import { sub, add, mul, dot, cross, norm, len, translation } from './vec.js';

const vecOf = (p) => [p.x, p.y, p.z];

/**
 * What the session's last frame knows of the room, in model coordinates. `toModel([x, y, z])` maps a point of the
 * reference space (the room, Y up, metres) into the model (Z up). Quest gives walls and the floor as planes and the
 * Space Setup furniture as box meshes; the "global mesh" (the whole room as triangles) only with opts.mesh.
 */
export function roomItems(frame, refSpace, toModel, { mesh: withMesh = false, cell = 0.04 } = {}) {
  const out = [];
  const pose = (space) => { const p = frame.getPose(space, refSpace); return p ? p.transform.matrix : null; };
  const apply = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
  for (const plane of frame.detectedPlanes || []) {
    const m = pose(plane.planeSpace);
    if (!m || !plane.polygon || plane.polygon.length < 3) continue;
    out.push({ type: 'plane', label: plane.semanticLabel || plane.orientation || 'plane', poly: plane.polygon.map((q) => toModel(apply(m, vecOf(q)))) });
  }
  for (const mesh of frame.detectedMeshes || []) {
    const label = mesh.semanticLabel || 'object';
    const m = pose(mesh.meshSpace), V = mesh.vertices;
    if (/global/i.test(label)) {
      if (withMesh && m && V && mesh.indices?.length) out.push({ type: 'mesh', label: 'room mesh', tris: meshTris(V, mesh.indices, (v) => toModel(apply(m, v)), cell) });
      continue;
    }
    if (!m || !V || V.length < 9) continue;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i + 2 < V.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], V[i + k]); hi[k] = Math.max(hi[k], V[i + k]); }
    const C = [];
    for (const z of [lo[2], hi[2]]) for (const [x, y] of [[lo[0], lo[1]], [hi[0], lo[1]], [hi[0], hi[1]], [lo[0], hi[1]]]) C.push(toModel(apply(m, [x, y, z])));
    out.push({ type: 'box', label, corners: C });
  }
  return out;
}

/**
 * The room mesh (the headset's own scan of every surface: walls, floor, furniture, clutter) as model triangles.
 * Points are welded on a grid of `cell` metres, which also thins the mesh (triangles smaller than a cell vanish);
 * at most `max` triangles are kept.
 */
export function meshTris(V, I, map, cell = 0.04, max = 30000) {
  const grid = new Map(), pts = [];
  const at = (i) => {
    const p = map([V[i * 3], V[i * 3 + 1], V[i * 3 + 2]]);
    const k = p.map((x) => Math.round(x / cell)).join(',');
    let id = grid.get(k);
    if (id === undefined) { id = pts.length; grid.set(k, id); pts.push(p); }
    return id;
  };
  const seen = new Set(), tris = [];
  for (let t = 0; t + 2 < I.length && tris.length < max; t += 3) {
    const a = at(I[t]), b = at(I[t + 1]), c = at(I[t + 2]);
    if (a === b || b === c || a === c) continue;
    const k = [a, b, c].sort((x, y) => x - y).join(',');
    if (seen.has(k)) continue;
    seen.add(k);
    const P = [pts[a], pts[b], pts[c]];
    if (len(cross(sub(P[1], P[0]), sub(P[2], P[0]))) < 1e-8) continue;
    tris.push(P);
  }
  return tris;
}

/** The six faces of a box from its 8 corners (0-3 one end, 4-7 the other, in the same turn), each facing out. */
function boxFaces(C) {
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const mid = mul(C.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / 8);
  return quads.map((q) => {
    let P = q.map((i) => C[i]);
    const n = cross(sub(P[1], P[0]), sub(P[2], P[0]));
    const fc = mul(P.reduce((a, p) => add(a, p), [0, 0, 0]), 1 / 4);
    if (dot(n, sub(fc, mid)) < 0) P = P.reverse();
    return P;
  });
}

const TH = {
  floor: 'พื้น', wall: 'ผนัง', ceiling: 'เพดาน', table: 'โต๊ะ', couch: 'โซฟา', bed: 'เตียง', screen: 'จอ', lamp: 'โคมไฟ', plant: 'ต้นไม้',
  storage: 'ตู้', shelf: 'ชั้นวาง', door: 'ประตู', 'door frame': 'วงกบประตู', window: 'หน้าต่าง', 'window frame': 'วงกบหน้าต่าง',
  'wall art': 'ภาพบนผนัง', 'room mesh': 'ผิวห้องที่สแกน', other: 'วัตถุ', horizontal: 'พื้นราบ', vertical: 'ผนัง',
};
/** A name for an item: Thai when the page is Thai. */
export const labelName = (label, thai) => {
  const k = String(label || '').toLowerCase().replace(/_/g, ' ');
  if (thai && TH[k]) return TH[k];
  return k ? k[0].toUpperCase() + k.slice(1) : 'Object';
};

/** Build the scanned items as groups in the open context; one undo step. */
export function buildScan(model, path, items, { room = 'Scanned room', furniture = 'Scanned furniture', thai = false, replace = false } = {}) {
  let groups = 0, planes = 0, boxes = 0, tris = 0;
  if (!items.length) return { groups, planes, boxes, tris };
  model.change('Scan room', (m) => {
    const def = m.context(path || []).def;
    const tagOf = (nm) => (m.tag(nm) ? m.tag(nm).name : m.addTag(nm));
    // a new scan takes the place of the last one
    if (replace) for (const [iid, inst] of [...def.insts]) if (inst.tag === room || inst.tag === furniture) def.insts.delete(iid);
    const tRoom = tagOf(room), tFurn = items.some((it) => it.type === 'box') ? tagOf(furniture) : null;
    for (const it of items) {
      if (it.type === 'mesh') {
        if (!it.tris.length) continue;
        const origin = it.tris.flat().reduce((a, p) => a.map((x, k) => Math.min(x, p[k])), [Infinity, Infinity, Infinity]);
        const nd = meshDef(m, it.tris.map((P) => P.map((p) => sub(p, origin))), labelName(it.label, thai));
        // smooth where the surface bends gently (a scanned sofa reads as one shape, not a net of triangles)
        const ef = edgeFaces(nd);
        for (const e of nd.edges.values()) {
          const fs = ef.get(e.a < e.b ? e.a + '|' + e.b : e.b + '|' + e.a) || [];
          if (fs.length === 2 && dot(faceNormal(nd, nd.faces.get(fs[0])), faceNormal(nd, nd.faces.get(fs[1]))) > 0.85) e.soft = true;
        }
        const iid = m.place(def, nd.id, translation(origin));
        def.insts.get(iid).tag = tRoom;
        groups++; tris += nd.faces.size;
        continue;
      }
      const polys = it.type === 'box' ? boxFaces(it.corners) : [it.poly];
      if (polys.some((P) => P.length < 3 || P.some((p) => p.some((x) => !Number.isFinite(x))))) continue;
      const area = polys.reduce((a, P) => { let s = [0, 0, 0]; for (let i = 0; i < P.length; i++) s = add(s, cross(P[i], P[(i + 1) % P.length])); return a + len(s) / 2; }, 0);
      if (!(area > 1e-4)) continue;
      const origin = polys.flat().reduce((a, p) => a.map((x, k) => Math.min(x, p[k])), [Infinity, Infinity, Infinity]);
      const nd = m.newDef('group', labelName(it.label, thai));
      for (const P of polys) addPolygon(nd, P.map((p) => sub(p, origin)), it.type === 'plane' ? norm(cross(sub(P[1], P[0]), sub(P[2], P[0]))) : undefined);
      if (!nd.faces.size) { m.defs.delete(nd.id); continue; }
      const iid = m.place(def, nd.id, translation(origin));
      def.insts.get(iid).tag = it.type === 'box' ? tFurn : tRoom;
      groups++; if (it.type === 'box') boxes++; else planes++;
    }
  });
  return { groups, planes, boxes, tris };
}
