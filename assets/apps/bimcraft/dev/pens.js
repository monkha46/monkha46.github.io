/* SPDX-License-Identifier: Apache-2.0 */
/**
 * pens.js — line weights by category for the printed drawings (KHADRAW P1.5 round 2): what a section or a plan cuts through
 * the structure heaviest, other cut elements lighter, what is seen beyond thin, drafting and notes at their own pens — the
 * office's pen set, kept with the model. No DOM: tests/views2d-test.mjs runs it in Node.
 *
 *   PEN_KEYS, PEN_DEFAULTS (mm on paper)
 *   pen(key) → mm      the pen in force          cutPen(ifcClass) → mm   cutStructure for walls, columns, slabs, beams, roofs,
 *                                                                        footings, stairs, ramps; cutOther for the rest
 *   setPens(p) / getPens()                       the pens in force (the page sets them from the model; Node tests set them)
 *   readPens(w) → pens                           CadCraft_Pens on the project (JSON), defaults for what is missing
 *   savePens(p) → op                             one undo step
 * res-sheets.js (sheets) and model-pdf.js (the plan print) draw with them.
 */
import { op } from './model-ops.js';
import { ids } from './ifc-util.js';

export const PENS_PSET = 'CadCraft_Pens';
export const PEN_KEYS = ['cutStructure', 'cutOther', 'projection', 'beyond', 'drafting', 'hatch', 'annotation'];
export const PEN_DEFAULTS = Object.freeze({ cutStructure: 0.5, cutOther: 0.35, projection: 0.18, beyond: 0.13, drafting: 0.25, hatch: 0.13, annotation: 0.18 });
const STRUCTURE = /^Ifc(Wall|WallStandardCase|Column|Slab|Beam|Footing|Roof|Stair|StairFlight|Ramp|RampFlight|Member|Plate|Pile|Chimney)$/i;
const clean = (p) => {
  const out = { ...PEN_DEFAULTS };
  for (const k of PEN_KEYS) { const v = Number(p?.[k]); if (Number.isFinite(v) && v >= 0.05 && v <= 3) out[k] = Math.round(v * 1000) / 1000; }
  return out;
};
let pens = { ...PEN_DEFAULTS };
export const setPens = (p) => { pens = clean(p); return pens; };
export const getPens = () => ({ ...pens });
export const pen = (key) => pens[key] ?? PEN_DEFAULTS[key] ?? 0.18;
export const cutPen = (cls) => (STRUCTURE.test(String(cls || '')) ? pens.cutStructure : pens.cutOther);

const project = (w) => ids(w.api, w.mid, 'IFCPROJECT')[0];
export function readPens(w) {
  const pj = project(w);
  const ps = pj === undefined ? null : w.readPset(pj, PENS_PSET);
  let j = null;
  try { j = JSON.parse(ps?.Pens || 'null'); } catch (e) { j = null; }
  return clean(j);
}
export function savePens(p) {
  const P = clean(p);
  return op((w) => {
    const pj = project(w);
    w.upsertPset(pj, PENS_PSET, [['Pens', 'IFCTEXT', JSON.stringify(P)]]);
    return { id: pj, ids: [], pens: P };
  });
}
