/* SPDX-License-Identifier: Apache-2.0 */
/**
 * ai-enhance.js — Render dialog › "Make it photoreal (MONZ Studio)" (KHADRAW). Shared like the rest of render/ (canonical
 * in modelcraft/app/render, byte-identical copy in bimcraft/app/render). Words through t() with keys `render.ai.*`.
 *
 * The last render, with its depth and line passes (render-passes.js), goes to MONZ Studio on this PC (its app server,
 * http://127.0.0.1:8795 by default; MONZ allows KHADRAW's pages in its config `cors_origins`) as images of a project
 * ("KHADRAW" in the client category unless set otherwise); MONZ's "enhance" job makes it photoreal on the local GPU — SDXL
 * with ControlNet on the depth and lines when MONZ has the ControlNet files, else FLUX.2 Klein 4B from the render — and the
 * result comes back into the dialog (Before / After, Save). Nothing leaves this PC.
 *
 *   monzClient(base, fetchFn) → { connect(), project(name), upload(project, blob, name), submit(project, kind, params),
 *       wait(project, jobId, { onProgress, signal }), asset(project, id), fileUrl(project, asset), fetchFile(project, asset) }
 *   mountAiEnhance({ el, status, pic, lastBlob(), lastPic(), passScene() → { scene, w, h }, download(blob, name),
 *       fileBase() }) → { fieldset, update() }   the dialog's section; update() after each render (enables the button)
 *   loadPrefs() / savePrefs(p)   per viewer, in localStorage: { url, project, prompt, strength, model }
 */
import { t } from '../i18n.js';
import { renderPasses } from './render-passes.js';

export const MONZ_URL = 'http://127.0.0.1:8795';
const PREF_KEY = 'cc.render.monz';
const DEFAULTS = { url: MONZ_URL, project: 'KHADRAW', prompt: '', strength: 0.5, model: 'auto' };
export const MODELS = ['auto', 'sdxl', 'klein4b'];

export function loadPrefs() {
  try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null'); return { ...DEFAULTS, ...(p && typeof p === 'object' ? p : {}) }; } catch (e) { return { ...DEFAULTS }; }
}
export function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* storage blocked: not kept */ } }

const enc = encodeURIComponent;
const sleep = (ms, signal) => new Promise((res) => { const id = setTimeout(res, ms); signal?.addEventListener('abort', () => { clearTimeout(id); res(); }, { once: true }); });

export function monzClient(base = MONZ_URL, fetchFn = (...a) => fetch(...a)) {
  base = String(base || MONZ_URL).replace(/\/+$/, '');
  let token = null;
  async function call(method, path, body) {
    const headers = {};
    if (body !== undefined && !(body instanceof Blob)) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && token) headers['X-MONZ-Token'] = token;
    const r = await fetchFn(base + path, { method, headers, body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
    return d;
  }
  const api = {
    async connect() { const s = await call('GET', '/api/system'); token = s.token; return s; },
    async project(name) {
      const list = await call('GET', '/api/projects');
      const hit = list.find((p) => p.category === 'client' && p.name === name);
      return hit ? hit.id : (await call('POST', '/api/projects', { category: 'client', name })).id;
    },
    upload: (project, blob, name) => call('PUT', `/api/upload?project=${enc(project)}&kind=image&name=${enc(name)}`, blob),
    submit: (project, kind, params) => call('POST', '/api/jobs', { kind, project, params }),
    async wait(project, id, { onProgress, signal, every = 1500 } = {}) {
      for (;;) {
        if (signal?.aborted) { await call('POST', '/api/jobs/cancel', { id }).catch(() => {}); throw Object.assign(new Error('stopped'), { stopped: true }); }
        const job = (await call('GET', '/api/jobs?project=' + enc(project))).find((j) => j.id === id);
        if (!job) throw new Error('job ' + id);
        if (job.status === 'done') return job;
        if (job.status === 'error' || job.status === 'cancelled') throw new Error(job.error || job.progress || job.status);
        onProgress?.(job.progress || job.status, job);
        await sleep(every, signal);
      }
    },
    async asset(project, id) { return (await call('GET', '/api/assets?project=' + enc(project))).find((a) => a.id === id) || null; },
    fileUrl: (project, a) => base + '/file/' + project.split('/').map(enc).join('/') + '/' + a.file.split('/').map(enc).join('/'),
    async fetchFile(project, a) { const r = await fetchFn(api.fileUrl(project, a)); if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); },
  };
  return api;
}

export function mountAiEnhance(o) {
  const { el } = o;
  const prefs = loadPrefs();
  let busy = null, aiBlob = null, aiUrl = null, showing = 'after';
  const promptIn = el('textarea', { className: 'form-control form-control-sm', rows: '2', placeholder: t('render.ai.prompt.ph'), dataset: { renderAiPrompt: '' } });
  promptIn.value = prefs.prompt;
  const strIn = el('input', { type: 'range', min: '0.2', max: '0.8', step: '0.05', value: String(prefs.strength), dataset: { renderAiStrength: '' } });
  const strOut = el('output', {}, '');
  const modelSel = el('select', { className: 'select-cc', dataset: { renderAiModel: '' } }, MODELS.map((k) => el('option', { value: k, selected: k === prefs.model }, t('render.ai.model.' + k))));
  const urlIn = el('input', { type: 'url', className: 'form-control form-control-sm', value: prefs.url, dataset: { renderAiUrl: '' } });
  const projIn = el('input', { type: 'text', className: 'form-control form-control-sm', value: prefs.project, dataset: { renderAiProject: '' } });
  const goBtn = el('button', { type: 'button', className: 'btn-plot btn-sm-cc', dataset: { renderAiGo: '' }, disabled: true }, t('render.ai.go'));
  const cmpBtn = el('button', { type: 'button', className: 'btn-line btn-sm-cc', dataset: { renderAiCompare: '' }, disabled: true }, t('render.ai.before'));
  const saveBtn = el('button', { type: 'button', className: 'btn-line btn-sm-cc', dataset: { renderAiSave: '' }, disabled: true }, t('render.ai.save'));
  const note = el('p', { className: 'cc-render-note', dataset: { renderAiNote: '' } }, t('render.ai.hint'));
  const fieldset = el('fieldset', { dataset: { renderAi: '' } }, el('legend', {}, t('render.ai')), note,
    el('label', {}, t('render.ai.prompt'), promptIn),
    el('label', {}, el('span', {}, t('render.ai.strength'), ' ', strOut), strIn),
    el('label', {}, t('render.ai.model'), modelSel),
    el('details', {}, el('summary', {}, t('render.ai.where')), el('label', {}, t('render.ai.url'), urlIn), el('label', {}, t('render.ai.project'), projIn)),
    el('div', { className: 'cc-render-row' }, goBtn, cmpBtn, saveBtn));

  const read = () => ({ url: urlIn.value.trim() || MONZ_URL, project: projIn.value.trim() || 'KHADRAW', prompt: promptIn.value.trim(),
    strength: Math.min(0.8, Math.max(0.2, Number(strIn.value) || 0.5)), model: MODELS.includes(modelSel.value) ? modelSel.value : 'auto' });
  const sync = () => {
    strOut.value = Math.round(Number(strIn.value) * 100) + '%';
    goBtn.disabled = !busy && !o.lastBlob();
    goBtn.textContent = busy ? t('render.ai.stop') : t('render.ai.go');
    cmpBtn.disabled = saveBtn.disabled = !aiBlob || !!busy;
    for (const x of [promptIn, strIn, modelSel, urlIn, projIn]) x.disabled = !!busy;
  };
  fieldset.addEventListener('input', () => { savePrefs(read()); sync(); });
  sync();

  const showPic = (which) => {
    showing = which;
    const src = which === 'after' ? aiUrl : o.lastPic();
    if (!src) return;
    o.pic.replaceChildren(el('img', { src, alt: t(which === 'after' ? 'render.ai.alt' : 'render.alt'), dataset: which === 'after' ? { renderAiImage: '' } : { renderImage: '' } }));
    cmpBtn.textContent = t(which === 'after' ? 'render.ai.before' : 'render.ai.after');
  };

  async function go() {
    if (busy) { busy.abort(); return; }
    if (!o.lastBlob()) return;
    const p = read();
    savePrefs(p);
    busy = new AbortController();
    const signal = busy.signal;
    sync();
    try {
      o.status(t('render.ai.connect'));
      const c = monzClient(p.url);
      try { await c.connect(); } catch (e) { throw new Error(t('render.ai.offline', { url: p.url })); }
      o.status(t('render.ai.passes'));
      const { scene, w, h } = o.passScene();
      let passes;
      try { passes = await renderPasses(scene, { w, h }); } finally { scene.dispose?.(); }
      if (signal.aborted) throw Object.assign(new Error('stopped'), { stopped: true });
      o.status(t('render.ai.send'));
      const project = await c.project(p.project);
      const base = (o.fileBase?.() || 'render').slice(0, 60);
      const render = await c.upload(project, o.lastBlob(), base + ' render.png');
      const depth = await c.upload(project, passes.depth, base + ' depth.png');
      const lines = await c.upload(project, passes.lines, base + ' lines.png');
      const job = await c.submit(project, 'enhance', { asset: render.id, depth: depth.id, lines: lines.id, prompt: p.prompt, strength: p.strength, model: p.model });
      const done = await c.wait(project, job.id, { signal, onProgress: (msg) => o.status(t('render.ai.progress', { msg })) });
      const id = done.result?.assets?.[0];
      const a = id && await c.asset(project, id);
      if (!a) throw new Error(t('render.ai.noresult'));
      aiBlob = await c.fetchFile(project, a);
      if (aiUrl) URL.revokeObjectURL(aiUrl);
      aiUrl = URL.createObjectURL(aiBlob);
      showPic('after');
      const s = Math.round(done.result?.seconds || 0);
      o.status(t('render.ai.done', { model: done.result?.model || '', s }) + (done.result?.control?.length ? '' : ' ' + t('render.ai.nocontrol'))
        + (a.license && a.license !== 'ok' ? ' ⚠ ' + (a.license_note || t('render.ai.license')) : ''));
    } catch (e) {
      o.status(e?.stopped ? t('render.ai.stopped') : t('render.ai.failed', { error: String(e?.message || e) }));
    } finally {
      busy = null;
      sync();
    }
  }
  goBtn.addEventListener('click', go);
  cmpBtn.addEventListener('click', () => showPic(showing === 'after' ? 'before' : 'after'));
  saveBtn.addEventListener('click', () => {
    if (!aiBlob) return;
    const name = (o.fileBase ? o.fileBase() : 'render') + ' AI.png';
    o.download(aiBlob, name);
    o.status(t('render.saved', { file: name }));
  });
  return {
    fieldset,
    /** After a render: the new picture is "before"; an earlier AI result no longer matches it. */
    update() { if (aiUrl) { URL.revokeObjectURL(aiUrl); aiUrl = null; aiBlob = null; showing = 'after'; cmpBtn.textContent = t('render.ai.before'); } sync(); },
    stop() { busy?.abort(); },
    dispose() { busy?.abort(); if (aiUrl) URL.revokeObjectURL(aiUrl); },
  };
}
