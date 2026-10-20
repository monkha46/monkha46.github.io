/* SPDX-License-Identifier: Apache-2.0 */
/**
 * view-extra.js — the views KHADRAW adds to the plan's canvas (P1.5 round 2): a section, an elevation or a drafting (detail)
 * view shown where the plan is, so drafting-ui.js and notes-ui.js draw on it as they draw on a plan. No DOM.
 *
 *   viewExtra.key        the key of the view shown ('section:<GlobalId>' | 'elev:<side>' | 'detail:detail-<n>'), or null (a plan,
 *                        a ceiling plan or a callout: views-ui.js answers)
 *   viewExtra.name(key)  its name in words, or null for a key that is not one of these (sectionview-ui.js sets it)
 *   viewExtra.decorate(input)   the drawing set's input (res-ui.js setInput) given each view's drafting and notes (view.anno)
 *                        and the drafting views (input.details) — set by sectionview-ui.js
 *   EXTRA_VIEW_RE        what such a key looks like
 */
export const EXTRA_VIEW_RE = /^section:[0-9A-Za-z_$]{22}$|^elev:(north|east|south|west)$|^detail:detail-\d+$/;
export const viewExtra = { key: null, name: () => null, decorate: null };
