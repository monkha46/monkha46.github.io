/* SPDX-License-Identifier: Apache-2.0 */
/**
 * xr-icons.js — the wrist menu's icons, drawn with canvas paths (no image files, crisp at any size, one colour).
 *
 *   drawIcon(g, id, x, y, s, color)   draws icon `id` in the square (x, y, s × s) of 2D context g
 *
 * Each icon is drawn in a 0..1 box (p() maps it), strokes are s/14 wide. Unknown ids draw a dot.
 */

export function drawIcon(g, id, x, y, s, color = '#f8fafc', accent = '#5eead4') {
  const p = (u, v) => [x + u * s, y + v * s];
  const lw = Math.max(2, s / 14);
  g.save();
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round';
  const path = (pts, close = false) => { g.beginPath(); pts.forEach(([u, v], i) => (i ? g.lineTo(...p(u, v)) : g.moveTo(...p(u, v)))); if (close) g.closePath(); g.stroke(); };
  const dot = (u, v, r = 0.07, c = color) => { g.beginPath(); g.arc(...p(u, v), r * s, 0, Math.PI * 2); g.fillStyle = c; g.fill(); g.fillStyle = color; };
  const circle = (u, v, r) => { g.beginPath(); g.arc(...p(u, v), r * s, 0, Math.PI * 2); g.stroke(); };
  const arrow = (u0, v0, u1, v1, head = 0.16) => {
    path([[u0, v0], [u1, v1]]);
    const a = Math.atan2(v1 - v0, u1 - u0);
    path([[u1 - head * Math.cos(a - 0.5), v1 - head * Math.sin(a - 0.5)], [u1, v1], [u1 - head * Math.cos(a + 0.5), v1 - head * Math.sin(a + 0.5)]]);
  };
  const box = (u, v, w, h) => { g.strokeRect(...p(u, v), w * s, h * s); };
  switch (id) {
    case 'select':   // a pointer
      g.beginPath(); g.moveTo(...p(0.28, 0.12)); g.lineTo(...p(0.28, 0.82)); g.lineTo(...p(0.45, 0.66)); g.lineTo(...p(0.58, 0.92));
      g.lineTo(...p(0.68, 0.87)); g.lineTo(...p(0.56, 0.62)); g.lineTo(...p(0.78, 0.6)); g.closePath(); g.fill(); break;
    case 'line': path([[0.15, 0.82], [0.85, 0.18]]); dot(0.15, 0.82, 0.08, accent); dot(0.85, 0.18, 0.08, accent); break;
    case 'arc': g.beginPath(); g.arc(...p(0.5, 0.82), 0.38 * s, Math.PI, 0); g.stroke(); dot(0.12, 0.82, 0.08, accent); dot(0.88, 0.82, 0.08, accent); dot(0.5, 0.44, 0.06, accent); break;
    case 'curve':
      g.beginPath(); g.moveTo(...p(0.1, 0.75)); g.bezierCurveTo(...p(0.35, 0.05), ...p(0.6, 1.0), ...p(0.9, 0.25)); g.stroke();
      dot(0.1, 0.75, 0.07, accent); dot(0.9, 0.25, 0.07, accent); break;
    case 'rect': box(0.14, 0.24, 0.72, 0.52); dot(0.14, 0.24, 0.07, accent); dot(0.86, 0.76, 0.07, accent); break;
    case 'circle': circle(0.5, 0.5, 0.36); dot(0.5, 0.5, 0.06, accent); path([[0.5, 0.5], [0.86, 0.5]]); break;
    case 'push':   // a box with its top pulled up
      path([[0.18, 0.62], [0.18, 0.88], [0.72, 0.88], [0.72, 0.62]]); path([[0.18, 0.62], [0.32, 0.48], [0.86, 0.48], [0.72, 0.62], [0.18, 0.62]]);
      path([[0.86, 0.48], [0.86, 0.74], [0.72, 0.88]]); g.strokeStyle = accent; arrow(0.52, 0.42, 0.52, 0.08); break;
    case 'follow':   // a profile ring swept along a bent path
      circle(0.22, 0.3, 0.13); g.strokeStyle = accent; path([[0.22, 0.3], [0.22, 0.78], [0.8, 0.78]]); arrow(0.6, 0.78, 0.86, 0.78, 0.13); break;
    case 'move': arrow(0.5, 0.5, 0.5, 0.1); arrow(0.5, 0.5, 0.5, 0.9); arrow(0.5, 0.5, 0.1, 0.5); arrow(0.5, 0.5, 0.9, 0.5); break;
    case 'copy': box(0.14, 0.32, 0.46, 0.46); g.strokeStyle = accent; box(0.4, 0.14, 0.46, 0.46); break;
    case 'erase':   // the eraser block, tilted
      g.save(); g.translate(...p(0.5, 0.5)); g.rotate(-Math.PI / 4);
      g.fillStyle = '#f472b6'; g.fillRect(-0.38 * s, -0.17 * s, 0.38 * s, 0.34 * s);
      g.strokeRect(-0.38 * s, -0.17 * s, 0.76 * s, 0.34 * s); g.restore(); path([[0.2, 0.9], [0.86, 0.9]]); break;
    case 'measure':   // a tape with ticks
      box(0.1, 0.36, 0.8, 0.28); for (let i = 1; i < 8; i++) path([[0.1 + i * 0.1, 0.36], [0.1 + i * 0.1, i % 2 ? 0.46 : 0.52]]); break;
    case 'tape':   // a tape measure case with its tape pulled out, and a dashed guide line
      circle(0.3, 0.42, 0.2); dot(0.3, 0.42, 0.05, accent); path([[0.3, 0.62], [0.9, 0.62]]); path([[0.9, 0.56], [0.9, 0.68]]);
      g.strokeStyle = accent; g.setLineDash([lw * 1.4, lw * 1.2]); path([[0.08, 0.86], [0.92, 0.86]]); g.setLineDash([]); break;
    case 'rotate':   // a protractor arc with a turning arrow, and a copy at the end
      g.beginPath(); g.arc(...p(0.5, 0.62), 0.36 * s, Math.PI, Math.PI * 1.75); g.stroke();
      arrow(0.68, 0.32, 0.76, 0.38, 0.13); dot(0.5, 0.62, 0.06, accent);
      g.strokeStyle = accent; path([[0.5, 0.62], [0.14, 0.62]]); path([[0.5, 0.62], [0.76, 0.36]]); break;
    case 'offset':   // a shape and its outline again inside it
      box(0.1, 0.16, 0.8, 0.68); g.strokeStyle = accent; box(0.26, 0.32, 0.48, 0.36); break;
    case 'section':   // a box cut by a plane
      path([[0.16, 0.4], [0.16, 0.86], [0.62, 0.86], [0.62, 0.4], [0.16, 0.4]]); path([[0.16, 0.4], [0.3, 0.26], [0.5, 0.26]]);
      g.strokeStyle = accent; g.fillStyle = 'rgba(249, 115, 22, 0.35)';
      g.beginPath(); [[0.5, 0.08], [0.9, 0.24], [0.9, 0.92], [0.5, 0.76]].forEach(([u, v], i) => (i ? g.lineTo(...p(u, v)) : g.moveTo(...p(u, v)))); g.closePath(); g.fill(); g.stroke(); break;
    case 'cuts':   // the section plane with an eye
      g.strokeStyle = accent; path([[0.2, 0.12], [0.8, 0.28], [0.8, 0.88], [0.2, 0.72]], true);
      g.strokeStyle = color; g.beginPath(); g.ellipse(...p(0.5, 0.5), 0.2 * s, 0.11 * s, 0, 0, Math.PI * 2); g.stroke(); dot(0.5, 0.5, 0.06); break;
    case 'clearguides':   // a dashed guide line, crossed out
      g.strokeStyle = accent; g.setLineDash([lw * 1.4, lw * 1.2]); path([[0.08, 0.5], [0.92, 0.5]]); g.setLineDash([]);
      g.strokeStyle = '#f43f5e'; path([[0.28, 0.28], [0.72, 0.72]]); path([[0.72, 0.28], [0.28, 0.72]]); break;
    case 'next': arrow(0.2, 0.5, 0.8, 0.5, 0.2); break;
    case 'prev': arrow(0.8, 0.5, 0.2, 0.5, 0.2); break;
    case 'box':   // a box drawn from its base
      path([[0.14, 0.42], [0.14, 0.86], [0.62, 0.86], [0.62, 0.42], [0.14, 0.42]]); path([[0.14, 0.42], [0.38, 0.2], [0.86, 0.2], [0.62, 0.42]]);
      path([[0.86, 0.2], [0.86, 0.64], [0.62, 0.86]]); dot(0.14, 0.86, 0.07, accent); dot(0.86, 0.2, 0.07, accent); break;
    case 'paint':   // a paint bucket pouring the colour in hand (accent)
      g.save(); g.translate(...p(0.42, 0.46)); g.rotate(-0.5);
      g.strokeRect(-0.22 * s, -0.2 * s, 0.44 * s, 0.4 * s); g.beginPath(); g.ellipse(0, -0.2 * s, 0.22 * s, 0.07 * s, 0, 0, Math.PI * 2); g.stroke(); g.restore();
      g.fillStyle = accent; g.beginPath(); g.moveTo(...p(0.66, 0.36)); g.quadraticCurveTo(...p(0.86, 0.5), ...p(0.8, 0.74));
      g.arc(...p(0.8, 0.8), 0.08 * s, -Math.PI / 2, Math.PI * 1.5); g.fill();
      g.fillRect(...p(0.1, 0.86), 0.8 * s, 0.08 * s); break;
    case 'polygon': { const P = []; for (let i = 0; i < 6; i++) { const t = -Math.PI / 2 + i * Math.PI / 3; P.push([0.5 + 0.38 * Math.cos(t), 0.52 + 0.38 * Math.sin(t)]); } path(P, true); dot(0.5, 0.52, 0.06, accent); break; }
    case 'resize':   // a small box and a big one, an arrow out
      box(0.1, 0.56, 0.3, 0.3); g.strokeStyle = accent; g.setLineDash([lw * 1.4, lw * 1.2]); box(0.1, 0.14, 0.72, 0.72); g.setLineDash([]); arrow(0.4, 0.56, 0.78, 0.2, 0.15); break;
    case 'hide':   // an eye, crossed out
      g.beginPath(); g.ellipse(...p(0.5, 0.5), 0.36 * s, 0.2 * s, 0, 0, Math.PI * 2); g.stroke(); dot(0.5, 0.5, 0.09);
      g.strokeStyle = '#f43f5e'; path([[0.16, 0.84], [0.84, 0.16]]); break;
    case 'unhide': g.beginPath(); g.ellipse(...p(0.5, 0.5), 0.36 * s, 0.2 * s, 0, 0, Math.PI * 2); g.stroke(); dot(0.5, 0.5, 0.09, accent); break;
    case 'angle':   // two arms and the arc between them
      path([[0.12, 0.84], [0.9, 0.84]]); path([[0.12, 0.84], [0.7, 0.2]]);
      g.strokeStyle = accent; g.beginPath(); g.arc(...p(0.12, 0.84), 0.4 * s, -Math.PI * 0.27, 0); g.stroke(); break;
    case 'markup':   // a pen and a red scribble
      g.strokeStyle = '#ef4444'; g.beginPath(); g.moveTo(...p(0.08, 0.8)); g.bezierCurveTo(...p(0.25, 0.5), ...p(0.35, 1.0), ...p(0.5, 0.72)); g.stroke();
      g.strokeStyle = color; g.save(); g.translate(...p(0.66, 0.4)); g.rotate(Math.PI / 4);
      g.strokeRect(-0.08 * s, -0.32 * s, 0.16 * s, 0.5 * s); g.beginPath(); g.moveTo(-0.08 * s, 0.18 * s); g.lineTo(0, 0.32 * s); g.lineTo(0.08 * s, 0.18 * s); g.stroke(); g.restore(); break;
    case 'clearmarkup':
      g.strokeStyle = '#ef4444'; g.beginPath(); g.moveTo(...p(0.1, 0.6)); g.bezierCurveTo(...p(0.3, 0.2), ...p(0.5, 0.9), ...p(0.9, 0.4)); g.stroke();
      g.strokeStyle = color; path([[0.3, 0.3], [0.7, 0.7]]); path([[0.7, 0.3], [0.3, 0.7]]); break;
    case 'photo':   // a camera
      g.strokeRect(...p(0.1, 0.3), 0.8 * s, 0.52 * s); path([[0.32, 0.3], [0.4, 0.18], [0.6, 0.18], [0.68, 0.3]]);
      g.strokeStyle = accent; circle(0.5, 0.56, 0.15); dot(0.78, 0.4, 0.04, accent); break;
    case 'scenes':   // a film strip of three frames
      for (let i = 0; i < 3; i++) box(0.08 + i * 0.29, 0.3, 0.26, 0.4);
      g.strokeStyle = accent; path([[0.08, 0.22], [0.92, 0.22]]); path([[0.08, 0.78], [0.92, 0.78]]); break;
    case 'occlude':   // a wall in front of a box: the box shows only beside it
      box(0.42, 0.3, 0.42, 0.42); g.fillStyle = accent; g.fillRect(...p(0.16, 0.12), 0.34 * s, 0.76 * s); break;
    case 'group':   // two shapes in a dashed box
      g.setLineDash([lw * 1.6, lw * 1.4]); box(0.08, 0.12, 0.84, 0.76); g.setLineDash([]);
      box(0.2, 0.42, 0.26, 0.3); circle(0.66, 0.4, 0.13); break;
    case 'layers':   // stacked sheets
      for (const [v, c] of [[0.66, color], [0.48, accent], [0.3, color]]) { g.strokeStyle = c; path([[0.5, v - 0.14], [0.88, v], [0.5, v + 0.14], [0.12, v]], true); } break;
    case 'teleport':   // an arc landing on a ring
      g.strokeStyle = accent; g.beginPath(); g.moveTo(...p(0.16, 0.7)); g.quadraticCurveTo(...p(0.4, 0.0), ...p(0.66, 0.66)); g.stroke();
      g.strokeStyle = color; g.beginPath(); g.ellipse(...p(0.68, 0.78), 0.2 * s, 0.08 * s, 0, 0, Math.PI * 2); g.stroke(); break;
    case 'scan':   // a room corner (floor and two walls) inside scan brackets
      for (const [u, v, du, dv] of [[0.08, 0.08, 1, 1], [0.92, 0.08, -1, 1], [0.08, 0.92, 1, -1], [0.92, 0.92, -1, -1]]) path([[u, v + dv * 0.2], [u, v], [u + du * 0.2, v]]);
      g.strokeStyle = accent; path([[0.5, 0.28], [0.5, 0.62], [0.28, 0.74]]); path([[0.5, 0.62], [0.72, 0.74]]); path([[0.28, 0.36], [0.28, 0.74]]); path([[0.72, 0.36], [0.72, 0.74]]); break;
    case 'scanlive':   // scan brackets round a surface being swept by a scan line, with a red 'recording' dot
      for (const [u, v, du, dv] of [[0.08, 0.08, 1, 1], [0.92, 0.08, -1, 1], [0.08, 0.92, 1, -1], [0.92, 0.92, -1, -1]]) path([[u, v + dv * 0.2], [u, v], [u + du * 0.2, v]]);
      g.strokeStyle = accent; g.beginPath(); g.moveTo(...p(0.22, 0.72)); g.quadraticCurveTo(...p(0.4, 0.38), ...p(0.56, 0.6)); g.quadraticCurveTo(...p(0.68, 0.76), ...p(0.8, 0.5)); g.stroke();
      path([[0.2, 0.46], [0.8, 0.46]]); dot(0.76, 0.24, 0.08, '#ef4444'); break;
    case 'turn':   // a circular arrow
      g.beginPath(); g.arc(...p(0.5, 0.52), 0.32 * s, -Math.PI * 0.15, Math.PI * 1.35); g.stroke();
      arrow(0.69, 0.33, 0.8, 0.43, 0.14); break;
    case 'grid': for (let i = 0; i <= 3; i++) { path([[0.14 + i * 0.24, 0.14], [0.14 + i * 0.24, 0.86]]); path([[0.14, 0.14 + i * 0.24], [0.86, 0.14 + i * 0.24]]); }
      g.strokeStyle = '#ef4444'; path([[0.14, 0.86], [0.5, 0.86]]); g.strokeStyle = '#22c55e'; path([[0.14, 0.86], [0.14, 0.5]]); break;
    case 'scale':   // a table and a person: 1:1 or table size
      path([[0.1, 0.58], [0.62, 0.58]]); path([[0.18, 0.58], [0.18, 0.88]]); path([[0.54, 0.58], [0.54, 0.88]]);
      box(0.24, 0.36, 0.22, 0.22); circle(0.8, 0.3, 0.08); path([[0.8, 0.38], [0.8, 0.68]]); path([[0.8, 0.68], [0.7, 0.88]]); path([[0.8, 0.68], [0.9, 0.88]]); break;
    case 'undo': g.beginPath(); g.arc(...p(0.52, 0.56), 0.3 * s, Math.PI * 1.1, Math.PI * 2.1); g.stroke(); arrow(0.3, 0.3, 0.2, 0.5, 0.15); break;
    case 'redo': g.beginPath(); g.arc(...p(0.48, 0.56), 0.3 * s, Math.PI * 0.9, Math.PI * 1.9, true); g.stroke(); arrow(0.7, 0.3, 0.8, 0.5, 0.15); break;
    case 'exit': path([[0.56, 0.14], [0.18, 0.14], [0.18, 0.86], [0.56, 0.86]]); g.strokeStyle = accent; arrow(0.4, 0.5, 0.9, 0.5); break;
    default: dot(0.5, 0.5, 0.12);
  }
  g.restore();
}
