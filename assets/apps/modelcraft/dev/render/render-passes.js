/* SPDX-License-Identifier: Apache-2.0 */
/**
 * render-passes.js — the guide pictures an AI needs to keep a render's geometry (KHADRAW: "make it photoreal" through MONZ
 * Studio, ai-enhance.js). Shared like the rest of render/ (canonical in modelcraft/app/render, byte-identical copy in
 * bimcraft/app/render). Takes the same plain scene as render-core.js, and the same camera.
 *
 *   renderPasses(scene, { w, h, creaseDeg = 25 }) → Promise<{ depth: Blob (PNG), lines: Blob (PNG), near, far }>
 *     depth: the distance from the camera, white = nearest point of the model, black = farthest / nothing (linear between,
 *            as ControlNet depth models expect); the section cut is honoured
 *     lines: the model's edges, white on black, hidden lines removed (the model drawn black first): the scene's own edge
 *            items when it has any, else the edges where faces meet at more than `creaseDeg` (three's EdgesGeometry)
 *   depthRange(camWorld, bounds) → { near, far }   from the camera's position to the bounding box's corners
 */
import * as THREE from 'three';
import { farPlane } from './looks.js';

export function depthRange(camWorld, bb) {
  const e = [camWorld[12], camWorld[13], camWorld[14]];
  if (!bb) return { near: 0.1, far: 100 };
  let lo = Infinity, hi = 0;
  for (const x of [bb.min[0], bb.max[0]]) for (const y of [bb.min[1], bb.max[1]]) for (const z of [bb.min[2], bb.max[2]]) {
    const d = Math.hypot(x - e[0], y - e[1], z - e[2]);
    lo = Math.min(lo, d); hi = Math.max(hi, d);
  }
  // the camera inside the box (an interior view): the near side starts at the camera
  const inside = [0, 1, 2].every((k) => e[k] >= bb.min[k] && e[k] <= bb.max[k]);
  return { near: inside ? 0.05 : Math.max(0.05, lo * 0.9), far: Math.max(hi * 1.02, 0.2) };
}

const DEPTH_VS = `#include <common>
#include <clipping_planes_pars_vertex>
varying float vZ;
void main() {
#include <begin_vertex>
#include <project_vertex>
#include <clipping_planes_vertex>
  vZ = -mvPosition.z;
}`;
const DEPTH_FS = `#include <clipping_planes_pars_fragment>
uniform float uNear;
uniform float uFar;
varying float vZ;
void main() {
#include <clipping_planes_fragment>
  float d = 1.0 - clamp((vZ - uNear) / (uFar - uNear), 0.0, 1.0);
  gl_FragColor = vec4(vec3(d), 1.0);
}`;

/** A geometry with only its drawn part (drawRange over the index): EdgesGeometry reads the whole buffer otherwise. */
function drawnPart(g) {
  const r = g.drawRange, idx = g.index;
  if (!idx || (r.start === 0 && (!Number.isFinite(r.count) || r.count >= idx.count))) return { g, own: false };
  const n = Math.min(idx.count - r.start, r.count), out = new THREE.BufferGeometry();
  out.setAttribute('position', g.getAttribute('position'));
  out.setIndex(new THREE.BufferAttribute(idx.array.slice(r.start, r.start + n), 1));
  return { g: out, own: true };
}

const toBlob = (canvas) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG'))), 'image/png'));

export async function renderPasses(scene, { w, h, creaseDeg = 25 } = {}) {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  const disposables = [];
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;   // the depth values go out as they are
    renderer.localClippingEnabled = !!(scene.clip && scene.clip.length);
    renderer.setClearColor(0x000000, 1);
    const clipping = (scene.clip || []).map((p) => new THREE.Plane(new THREE.Vector3(-p.n[0], -p.n[1], -p.n[2]), p.d));
    const spec = scene.camera(w / h);
    const { near, far } = depthRange(spec.world, scene.bounds);
    const cam = new THREE.Camera();
    cam.matrixAutoUpdate = false;
    cam.matrix.fromArray(spec.world);
    cam.matrixWorld.fromArray(spec.world);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    cam.projectionMatrix.fromArray(farPlane(spec.proj, far * 1.5));
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

    const solid = scene.items.filter((it) => !it.lines && it.geometry);
    const place = (o, it) => { o.matrixAutoUpdate = false; if (it.matrix) o.matrix.fromArray(it.matrix); return o; };

    // ---- depth
    const depthMat = new THREE.ShaderMaterial({ vertexShader: DEPTH_VS, fragmentShader: DEPTH_FS, side: THREE.DoubleSide,
      uniforms: { uNear: { value: near }, uFar: { value: far } }, clipping: true, clippingPlanes: clipping });
    disposables.push(depthMat);
    const dScene = new THREE.Scene();
    for (const it of solid) dScene.add(place(new THREE.Mesh(it.geometry, depthMat), it));
    dScene.updateMatrixWorld(true);
    renderer.render(dScene, cam);
    const depth = await toBlob(canvas);

    // ---- lines: the model in black (pushed back a little) hides the edges behind it
    const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes: clipping });
    const white = new THREE.LineBasicMaterial({ color: 0xffffff, clippingPlanes: clipping });
    disposables.push(black, white);
    const lScene = new THREE.Scene();
    for (const it of solid) lScene.add(place(new THREE.Mesh(it.geometry, black), it));
    const own = scene.items.filter((it) => it.lines && it.geometry);
    if (own.length) for (const it of own) lScene.add(place(new THREE.LineSegments(it.geometry, white), it));
    else for (const it of solid) {
      const part = drawnPart(it.geometry), eg = new THREE.EdgesGeometry(part.g, creaseDeg);
      if (part.own) part.g.dispose();
      disposables.push(eg);
      lScene.add(place(new THREE.LineSegments(eg, white), it));
    }
    lScene.updateMatrixWorld(true);
    renderer.render(lScene, cam);
    const lines = await toBlob(canvas);
    return { depth, lines, near, far };
  } finally {
    for (const d of disposables) d.dispose?.();
    renderer.dispose();
    renderer.forceContextLoss?.();
  }
}
