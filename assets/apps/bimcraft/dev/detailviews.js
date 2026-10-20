/* SPDX-License-Identifier: Apache-2.0 */
/**
 * detailviews.js — drafting views (KHADRAW P1.5 round 2): a blank view of its own for a detail drawn by hand (a cornice, a
 * joint, a stair nosing) at its own scale, with drafting (drafting.js) and notes (notes.js) in it, placed on sheets like any
 * view. No DOM: tests/views2d-test.mjs runs it in Node.
 *
 * Kept on the project as a property set other programs ignore (one undo step per change), as callouts are (views-model.js):
 *   CadCraft_DraftingViews   one IfcText per view ("detail-<n>"): JSON { name, scale (1:n, 0 = fit) }; a deleted one is written
 *                            empty (read as gone)
 *   readDetails(w) → [{ id, name, scale }]   saveDetail({ id?, name, scale }) → op ({ detail: id })
 *   deleteDetail(id) → op   (its drafting and notes go with it)
 *   Errors: model.err.dv.name, model.err.dv.gone, model.err.vr.scale
 */
import { op } from './model-ops.js';
import { ids } from './ifc-util.js';
import { removeDraftingInViews } from './drafting.js';
import { readNotes } from './notes.js';

export const DETAILS_PSET = 'CadCraft_DraftingViews';
const refuse = (key) => { throw Object.assign(new Error(key), { key }); };
const project = (w) => ids(w.api, w.mid, 'IFCPROJECT')[0];
const json = (s) => { try { const v = JSON.parse(s || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; } };
const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 80);
const scaleOf = (x) => { const v = Math.round(Number(x)); return Number.isFinite(v) && v >= 0 && v <= 10000 ? v : 0; };

export function readDetails(w) {
  const pj = project(w), ps = pj === undefined ? null : w.readPset(pj, DETAILS_PSET), out = [];
  for (const [id, v] of Object.entries(ps || {})) {
    const d = json(v);
    if (!d || !/^detail-\d+$/.test(id)) continue;
    out.push({ id, name: cleanName(d.name) || id, scale: scaleOf(d.scale) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.id.localeCompare(b.id, undefined, { numeric: true }));
}

export function saveDetail(d) {
  const D = { ...d };
  let fixed = D.id || null;
  return op((w) => {
    const pj = project(w), all = readDetails(w);
    const was = fixed ? all.find((x) => x.id === fixed) : null;
    if (fixed && !was) refuse('model.err.dv.gone');
    const name = cleanName(D.name ?? was?.name);
    if (!name) refuse('model.err.dv.name');
    const scale = 'scale' in D ? Number(D.scale) : was?.scale ?? 0;
    if (!(Number.isFinite(scale) && scale >= 0 && scale <= 10000)) refuse('model.err.vr.scale');
    if (!fixed) { let n = 1; while (all.some((x) => x.id === 'detail-' + n)) n++; fixed = 'detail-' + n; }
    w.upsertPset(pj, DETAILS_PSET, [[fixed, 'IFCTEXT', JSON.stringify({ name, scale: scaleOf(scale) })]]);
    return { id: pj, ids: [], detail: fixed };
  });
}

/** Delete a drafting view with the drafting and notes drawn in it, in one step. */
export function deleteDetail(id) {
  return op((w) => {
    if (!readDetails(w).some((x) => x.id === id)) refuse('model.err.dv.gone');
    w.upsertPset(project(w), DETAILS_PSET, [[id, 'IFCTEXT', '']]);
    const key = 'detail:' + id;
    const drafting = removeDraftingInViews(w, new Set([key]));
    const notes = readNotes(w).filter((n) => n.view === key).map((n) => n.id);
    if (notes.length) w.dropProduct(notes);
    return { id: null, ids: [], drafting, notes: notes.length };
  });
}
