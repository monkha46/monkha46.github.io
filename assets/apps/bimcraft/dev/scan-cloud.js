/* SPDX-License-Identifier: Apache-2.0 */
/**
 * scan-cloud.js — the room a headset scanned (ModelCraft's xr-scan.js, in the free-form editor) brought into BimCraft as a
 * point cloud (KHADRAW M4): as-built data beside the design, in the model's own coordinates, ready to compare with it (P2:
 * deviation.js). No DOM: tests/scan-test.mjs runs it in Node.
 *
 *   takeScans(json, layers) → { scans: [{ name, layer, tris: [[a, b, c]…] }] (metres, the editor model's frame), json (without them) }
 *       the root's placements on the scan layers (`layers`: their names — English and the language the editor runs in)
 *   samplePoints(tris, { spacing = 0.03, cap = 300000 }) → Float64Array (3 per point)   surfaces as evenly spread points:
 *       about one per spacing² of area (each triangle gets its share, then a fixed low-discrepancy pattern inside it, so the same
 *       scan gives the same points); thinned evenly when there would be more than `cap`
 *   toWorld(points, { at, angle, storeyWorld }) → Float64Array   editor frame (m, origin at `at` in the level's plan mm, turned
 *       by `angle` degrees) → the IFC's world coordinates in metres (storeyWorld: the level's 4×4, mm, column-major)
 *   xyzText(points) → 'x y z\n…' (metres, mm precision)   what BimCraft's cloud reader opens (pointcloud.js: XYZ)
 */
import { Model } from './mc/model.js';
import { faceTris } from './mc/model.js';

const apply = (M, p) => [M[0] * p[0] + M[4] * p[1] + M[8] * p[2] + M[12], M[1] * p[0] + M[5] * p[1] + M[9] * p[2] + M[13], M[2] * p[0] + M[6] * p[1] + M[10] * p[2] + M[14]];
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };

export function takeScans(json, layers) {
  const names = new Set(layers.filter(Boolean));
  const m = new Model();
  m.load(typeof json === 'string' ? JSON.parse(json) : json);
  const scans = [];
  for (const [iid, inst] of [...m.root.insts]) {
    if (!names.has(inst.tag)) continue;
    const tris = [];
    const walk = (defId, M) => {
      const d = m.defs.get(defId);
      if (!d) return;
      for (const f of d.faces.values()) for (const t of faceTris(d, f)) tris.push(t.map((v) => apply(M, d.verts.get(v))));
      for (const i of d.insts.values()) walk(i.def, mul(M, i.m));
    };
    walk(inst.def, inst.m);
    scans.push({ name: m.defs.get(inst.def)?.name || '', layer: inst.tag, tris });
    m.root.insts.delete(iid);
  }
  // definitions only the scans used go too
  const used = new Set(['root']);
  const mark = (id) => { if (used.has(id)) return; used.add(id); for (const i of m.defs.get(id)?.insts.values() || []) mark(i.def); };
  for (const i of m.root.insts.values()) mark(i.def);
  for (const id of [...m.defs.keys()]) if (!used.has(id)) m.defs.delete(id);
  for (const name of names) { const tg = m.tag(name); if (tg) m.tags = m.tags.filter((x) => x !== tg); }
  return { scans, json: JSON.stringify(m.toJSON()) };
}

const area = (a, b, c) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2; };
export function samplePoints(tris, { spacing = 0.03, cap = 300000 } = {}) {
  const per = 1 / (spacing * spacing);
  let total = 0;
  const counts = tris.map((t) => { const n = area(...t) * per; total += n; return n; });
  const scale = total > cap ? cap / total : 1;
  const out = [];
  let carry = 0;
  tris.forEach(([a, b, c], i) => {
    const want = counts[i] * scale + carry;
    const n = Math.floor(want);
    carry = want - n;
    for (let k = 0; k < n; k++) {
      // R2 sequence (Roberts): evenly spread, the same every time; folded into the triangle
      let u = (0.5 + (k + 1) * 0.7548776662466927) % 1, v = (0.5 + (k + 1) * 0.5698402909980532) % 1;
      if (u + v > 1) { u = 1 - u; v = 1 - v; }
      out.push(a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v, a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v, a[2] + (b[2] - a[2]) * u + (c[2] - a[2]) * v);
    }
  });
  return Float64Array.from(out);
}

export function toWorld(points, { at = [0, 0], angle = 0, storeyWorld }) {
  const r = angle * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), S = storeyWorld, out = new Float64Array(points.length);
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i] * 1000, y = points[i + 1] * 1000, z = points[i + 2] * 1000;
    const plan = [at[0] + c * x - s * y, at[1] + s * x + c * y, z];
    const w = apply(S, plan);
    out[i] = w[0] / 1000; out[i + 1] = w[1] / 1000; out[i + 2] = w[2] / 1000;
  }
  return out;
}

export function xyzText(points) {
  const lines = [];
  for (let i = 0; i < points.length; i += 3) lines.push(points[i].toFixed(3) + ' ' + points[i + 1].toFixed(3) + ' ' + points[i + 2].toFixed(3));
  return lines.join('\n') + '\n';
}
