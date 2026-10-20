/* SPDX-License-Identifier: Apache-2.0 */
/**
 * deviation.js — as-built against design (KHADRAW P2): how far each point of a scan lies from the model's surfaces, which
 * element it belongs to, which elements are out of tolerance, and where the scan shows something the model does not have.
 * No DOM, no three.js: tests/deviation-test.mjs runs it in Node. One space for both (BimCraft: the viewer's, metres).
 *
 *   compareScan(points, elements, { tolerance = 0.02, reach = 0.3, cell = 0.25, minPoints = 30, cap = 600000 }) → {
 *       dist: Float32Array (per point compared: metres to the nearest surface; NaN = nothing within `reach`),
 *       key: Int32Array (the nearest element's key; −1 outside), index: Uint32Array (which input point each one is), n,
 *       elements: [{ key, cls, n, mean, max, p95, over (points beyond tolerance), share (over / n) }] worst first,
 *       outside: { n, clusters: [{ center: [x, y, z], n, min, max }] } (points with no surface within reach, grouped in
 *       `cell × 2` voxels that touch, at least minPoints each — what was built and is not in the model),
 *       stats: { n, within, near (≤ 2 × tolerance), beyond, outside, tolerance } }
 *     points: Float32Array | Float64Array (x, y, z …); elements: [{ key, cls, tris: Float64Array (9 per triangle) }]
 *     (res-views.js modelTriangles gives them); more than `cap` points: every k-th is compared
 *   issuesFrom(result, { minPoints = 30, minShare = 0.1, name(key) → text }) → [{ kind: 'element' | 'extra', key?, at, title,
 *       description }]   one per element with enough points out of tolerance, one per cluster outside the model
 *   heatColors(result, total) → Uint8Array (rgb per input point): green within tolerance, amber up to twice it, red beyond,
 *       slate-blue outside every surface, grey for points not compared
 *   pointTriangle(p, a, b, c) → squared distance (Ericson's closest point on a triangle)
 */

export function pointTriangle(p, a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const d2 = (q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  const at = (s, t) => [a[0] + ab[0] * s + ac[0] * t, a[1] + ab[1] * s + ac[1] * t, a[2] + ab[2] * s + ac[2] * t];
  const d1 = dot(ab, ap), d2v = dot(ac, ap);
  if (d1 <= 0 && d2v <= 0) return d2(a);
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]], d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return d2(b);
  const vc = d1 * d4 - d3 * d2v;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return d2(at(d1 / (d1 - d3), 0));
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return d2(c);
  const vb = d5 * d2v - d1 * d6;
  if (vb <= 0 && d2v >= 0 && d6 <= 0) return d2(at(0, d2v / (d2v - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return d2([b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]); }
  const den = 1 / (va + vb + vc);
  return d2(at(vb * den, vc * den));
}

export function compareScan(points, elements, { tolerance = 0.02, reach = 0.3, cell = 0.25, minPoints = 30, cap = 600000 } = {}) {
  // the triangles in a grid of `cell` metres (each in the cells its box touches)
  const tri = [], grid = new Map();
  const K = (i, j, k) => i + ',' + j + ',' + k;
  for (const e of elements) {
    const T = e.tris;
    for (let o = 0; o + 8 < T.length; o += 9) {
      const id = tri.length;
      tri.push({ key: e.key, a: [T[o], T[o + 1], T[o + 2]], b: [T[o + 3], T[o + 4], T[o + 5]], c: [T[o + 6], T[o + 7], T[o + 8]] });
      const lo = [0, 1, 2].map((d) => Math.floor(Math.min(T[o + d], T[o + 3 + d], T[o + 6 + d]) / cell));
      const hi = [0, 1, 2].map((d) => Math.floor(Math.max(T[o + d], T[o + 3 + d], T[o + 6 + d]) / cell));
      if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > 20000) continue;   // a huge triangle (terrain): skipped
      for (let i = lo[0]; i <= hi[0]; i++) for (let j = lo[1]; j <= hi[1]; j++) for (let k = lo[2]; k <= hi[2]; k++) {
        const kk = K(i, j, k); let l = grid.get(kk); if (!l) { l = []; grid.set(kk, l); } l.push(id);
      }
    }
  }
  const clsOf = new Map(elements.map((e) => [e.key, e.cls || '']));
  const total = Math.floor(points.length / 3), stride = Math.max(1, Math.ceil(total / cap)), n = Math.ceil(total / stride);
  const dist = new Float32Array(n), key = new Int32Array(n), index = new Uint32Array(n);
  const r = Math.ceil(reach / cell), reach2 = reach * reach, seen = new Uint32Array(tri.length);
  let stamp = 0;
  for (let q = 0, i = 0; i < total; i += stride, q++) {
    const p = [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]];
    const ci = Math.floor(p[0] / cell), cj = Math.floor(p[1] / cell), ck = Math.floor(p[2] / cell);
    let best = reach2, bk = -1;
    stamp++;
    // nearer cells first: stop once a ring can no longer hold anything closer
    for (let ring = 0; ring <= r; ring++) {
      if (ring > 0 && (ring - 1) * cell >= Math.sqrt(best)) break;
      for (let a = -ring; a <= ring; a++) for (let b = -ring; b <= ring; b++) for (let c = -ring; c <= ring; c++) {
        if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c)) !== ring) continue;
        const l = grid.get(K(ci + a, cj + b, ck + c));
        if (!l) continue;
        for (const id of l) {
          if (seen[id] === stamp) continue;
          seen[id] = stamp;
          const t = tri[id], d = pointTriangle(p, t.a, t.b, t.c);
          if (d < best) { best = d; bk = t.key; }
        }
      }
    }
    index[q] = i;
    if (bk === -1) { dist[q] = NaN; key[q] = -1; } else { dist[q] = Math.sqrt(best); key[q] = bk; }
  }
  // per element
  const per = new Map();
  for (let q = 0; q < n; q++) {
    if (key[q] === -1) continue;
    let s = per.get(key[q]); if (!s) { s = { key: key[q], cls: clsOf.get(key[q]) || '', d: [] }; per.set(key[q], s); }
    s.d.push(dist[q]);
  }
  const elementsOut = [...per.values()].map((s) => {
    const d = Float32Array.from(s.d).sort(), sum = d.reduce((x, y) => x + y, 0), over = d.filter((x) => x > tolerance).length;
    return { key: s.key, cls: s.cls, n: d.length, mean: sum / d.length, max: d[d.length - 1], p95: d[Math.min(d.length - 1, Math.floor(d.length * 0.95))], over, share: over / d.length };
  }).sort((x, y) => y.over - x.over || y.max - x.max);
  // outside every surface: voxels of 2 × cell, joined when they touch
  const vox = new Map(), V = cell * 2;
  let outsideN = 0;
  for (let q = 0; q < n; q++) {
    if (key[q] !== -1) continue;
    outsideN++;
    const i = index[q], p = [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]];
    const kk = K(Math.floor(p[0] / V), Math.floor(p[1] / V), Math.floor(p[2] / V));
    let v = vox.get(kk); if (!v) { v = { n: 0, s: [0, 0, 0], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }; vox.set(kk, v); }
    v.n++; for (let d = 0; d < 3; d++) { v.s[d] += p[d]; v.min[d] = Math.min(v.min[d], p[d]); v.max[d] = Math.max(v.max[d], p[d]); }
  }
  const done = new Set(), clusters = [];
  for (const [k0] of vox) {
    if (done.has(k0)) continue;
    const c = { n: 0, s: [0, 0, 0], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }, stack = [k0];
    done.add(k0);
    while (stack.length) {
      const kk = stack.pop(), v = vox.get(kk), [x, y, z] = kk.split(',').map(Number);
      c.n += v.n; for (let d = 0; d < 3; d++) { c.s[d] += v.s[d]; c.min[d] = Math.min(c.min[d], v.min[d]); c.max[d] = Math.max(c.max[d], v.max[d]); }
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let e = -1; e <= 1; e++) {
        const nk = K(x + a, y + b, z + e);
        if (vox.has(nk) && !done.has(nk)) { done.add(nk); stack.push(nk); }
      }
    }
    if (c.n >= minPoints) clusters.push({ center: c.s.map((v) => v / c.n), n: c.n, min: c.min, max: c.max });
  }
  clusters.sort((a, b) => b.n - a.n);
  let within = 0, near = 0, beyond = 0;
  for (let q = 0; q < n; q++) { const d = dist[q]; if (Number.isNaN(d)) continue; if (d <= tolerance) within++; else if (d <= 2 * tolerance) near++; else beyond++; }
  return { dist, key, index, n, elements: elementsOut, outside: { n: outsideN, clusters }, stats: { n, within, near, beyond, outside: outsideN, tolerance } };
}

const mm = (m) => Math.round(m * 1000);
export function issuesFrom(result, { minPoints = 30, minShare = 0.1, name = (k) => '#' + k, centerOf = () => null, words = {} } = {}) {
  const W = { element: 'Out of tolerance: {name}', elementText: '{over} of {n} scan points are more than {tol} mm from it (mean {mean} mm, 95% within {p95} mm, at most {max} mm).',
    extra: 'In the scan, not in the model ({n} points)', extraText: 'About {w} × {d} × {h} m of the scan has no element of the model within reach: built and not drawn, or not built as drawn.', ...words };
  const fill = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  const out = [];
  for (const e of result.elements) {
    if (e.over < minPoints || e.share < minShare) continue;
    const v = { name: name(e.key), over: e.over, n: e.n, tol: mm(result.stats.tolerance), mean: mm(e.mean), p95: mm(e.p95), max: mm(e.max) };
    out.push({ kind: 'element', key: e.key, at: centerOf(e.key), title: fill(W.element, v), description: fill(W.elementText, v), max: e.max });
  }
  for (const c of result.outside.clusters) {
    if (c.n < minPoints) continue;
    const v = { n: c.n, w: (c.max[0] - c.min[0]).toFixed(1), d: (c.max[2] - c.min[2]).toFixed(1), h: (c.max[1] - c.min[1]).toFixed(1) };
    out.push({ kind: 'extra', at: c.center, title: fill(W.extra, v), description: fill(W.extraText, v), n: c.n });
  }
  return out;
}

export function heatColors(result, total) {
  const rgb = new Uint8Array(total * 3).fill(150);   // not compared (thinned out): grey
  const tol = result.stats.tolerance;
  for (let q = 0; q < result.n; q++) {
    const i = result.index[q], d = result.dist[q];
    const c = Number.isNaN(d) ? [92, 107, 192] : d <= tol ? [46, 160, 67] : d <= 2 * tol ? [245, 166, 35] : [214, 48, 49];
    rgb[i * 3] = c[0]; rgb[i * 3 + 1] = c[1]; rgb[i * 3 + 2] = c[2];
  }
  return rgb;
}
