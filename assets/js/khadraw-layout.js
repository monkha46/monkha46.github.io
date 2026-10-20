/* SPDX-License-Identifier: Apache-2.0 */
/**
 * khadraw-layout.js — KHADRAW Graphite's layout (design: the "KHADRAW UX/UI" canvas), over CadCraft's own markup.
 * Byte-identical in modelcraft/devshell/site/assets/js and bimcraft/devshell/site/assets/js; loaded by index.html,
 * index.th.html and render.php after the app's module (a module: it runs once the app has built its UI). Styles:
 * khadraw.css (.kd-*).
 *
 *  - Mode tabs in the app bar [data-kd-modes]: Model · BIM · Sheets · CNC · XR. A tab opens what it names in this app
 *    (BimCraft: the sheets dialog, the CNC dialog, AR/VR; ModelCraft: VR) or goes to the other app (ModelCraft ↔
 *    BimCraft: the dev shells' ports 8001 ↔ 8000, or localStorage "kd.apps" = {"modelcraft": url, "bimcraft": url}).
 *  - Command search [data-palette-open] in the app bar: the shell's own palette command (Ctrl+K, app.palette in
 *    input-modelcraft.js / input-bimcraft.js) clicks it; it lists window.ccInput.paletteItems() — every command with
 *    its key — filtered as one types (↑ ↓ Enter, Esc).
 *  - ModelCraft: the Draw, Modify and Organize groups move into a tool rail floating over the 3D view [data-kd-rail]
 *    (a second .mc-tools, so every ".mc-tools [data-tool=…]" lookup still finds them); File, Edit and Camera stay in
 *    the bar above. Only with the "toolbar" layout of Settings › Keys & mouse (the ribbon keeps CadCraft's own).
 * window.kdLayout = { app, modes, openPalette(), closePalette() } for tests.
 */

const TH = (document.documentElement.lang || '').startsWith('th');
const W = TH ? {
  modes: 'โหมดงาน', model: 'โมเดล', bim: 'BIM', sheets: 'แบบก่อสร้าง', cnc: 'CNC', xr: 'XR',
  search: 'ค้นหาคำสั่ง', searchPh: 'พิมพ์ชื่อคำสั่ง เช่น ผนัง, เรนเดอร์, รายการตัด…', none: 'ไม่พบคำสั่ง', rail: 'เครื่องมือวาด',
  other: 'เปิดใน {app}', needModel: 'เปิดอาคารก่อน แล้วค่อยเลือกโหมดนี้', disabled: 'ใช้ไม่ได้ตอนนี้',
} : {
  modes: 'Work mode', model: 'Model', bim: 'BIM', sheets: 'Sheets', cnc: 'CNC', xr: 'XR',
  search: 'Search commands', searchPh: 'Type a command: wall, render, cut list…', none: 'No command found', rail: 'Drawing tools',
  other: 'Open in {app}', needModel: 'Open a building first, then pick this mode', disabled: 'Not available now',
};
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) { if (k === 'className') e.className = v; else e.setAttribute(k, v === true ? '' : String(v)); }
  for (const k of kids.flat()) if (k != null) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return e;
};
const icon = (name) => el('i', { className: 'bi ' + name, 'aria-hidden': 'true' });
const APP = document.querySelector('main.mc') ? 'modelcraft' : document.querySelector('.bc-stage') ? 'bimcraft' : null;

/** The other app's address: localStorage "kd.apps", else the dev shells' ports (ModelCraft 8001, BimCraft 8000). */
function appUrl(app) {
  try { const m = JSON.parse(localStorage.getItem('kd.apps') || 'null'); if (m && typeof m[app] === 'string') return m[app]; } catch (e) { /* no storage */ }
  const port = { modelcraft: '8001', bimcraft: '8000' }[app];
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && ['8000', '8001'].includes(location.port)) {
    const u = new URL(location.href);
    u.port = port; u.hash = '';
    return u.href;
  }
  // the web site (web/build-web.mjs): KHADRAW BIM at /, KHADRAW Model at /model/, English under en/
  const en = /\/en\/?$/.test(location.pathname);
  return new URL((app === 'modelcraft' ? '/model/' : '/') + (en ? 'en/' : '') + location.search, location.origin).href;
}

/** The shell's own forms post to "/" (the dev shell's one page); on the web site each app has its own path. */
function keepFormsHere() {
  if (location.pathname === '/' || location.pathname === '/index.html') return;
  for (const f of document.querySelectorAll('form[action="/"]')) f.setAttribute('action', location.pathname);
}
const clickFirst = (sel) => { const b = document.querySelector(sel); if (b && !b.disabled) { b.click(); return true; } return false; };

// ------------------------------------------------------------------------------------------------ mode tabs
function modes() {
  const here = APP;
  const go = (app) => () => { const u = appUrl(app); if (u) location.href = u; };
  const list = [
    { key: 'model', icon: 'bi-box', run: here === 'modelcraft' ? null : go('modelcraft'), other: here !== 'modelcraft' && 'ModelCraft' },
    { key: 'bim', icon: 'bi-building', run: here === 'bimcraft' ? null : go('bimcraft'), other: here !== 'bimcraft' && 'BimCraft' },
    { key: 'sheets', icon: 'bi-file-earmark-ruled', run: here === 'bimcraft' ? () => clickFirst('[data-res-sheetsopen]') : go('bimcraft'), other: here !== 'bimcraft' && 'BimCraft' },
    { key: 'cnc', icon: 'bi-scissors', run: here === 'bimcraft' ? () => (window.bimcraftFurniture ? (window.bimcraftFurniture.openDialog(), true) : false) : go('bimcraft'), other: here !== 'bimcraft' && 'BimCraft' },
    { key: 'xr', icon: 'bi-headset-vr', run: here === 'bimcraft' ? () => clickFirst('[data-ff-ar]') : () => clickFirst('.mc-tools [data-xr-enter]') },
  ];
  return list.map((m) => ({ ...m, current: m.run === null }));
}
function mountModes(bar) {
  if (bar.querySelector('[data-kd-modes]')) return;
  const nav = el('nav', { className: 'kd-modes', 'data-kd-modes': '', 'aria-label': W.modes });
  for (const m of modes()) {
    const away = m.other && !appUrl(m.key === 'model' ? 'modelcraft' : 'bimcraft');
    const b = el('button', { type: 'button', className: 'kd-mode', 'data-kd-mode': m.key, 'aria-pressed': m.current ? 'true' : 'false',
      title: m.other ? W.other.replace('{app}', m.other) : W[m.key], disabled: away || null }, icon(m.icon), el('span', {}, W[m.key]));
    if (m.run) b.addEventListener('click', () => { if (m.run() === false) b.animate?.([{ transform: 'translateX(-2px)' }, { transform: 'translateX(2px)' }, { transform: 'none' }], 180); });
    nav.append(b);
  }
  const name = bar.querySelector('.app-bar-name');
  (name ? name.after(nav) : bar.prepend(nav));
}

// ------------------------------------------------------------------------------------------------ command palette
let dlg = null;
function items() {
  const own = window.ccInput?.paletteItems?.() || [];
  const shell = [['[data-help-open]', 'bi-question-circle'], ['[data-settings-open]', 'bi-gear'], ['[data-fs-cycle]', 'bi-fullscreen']]
    .map(([sel]) => document.querySelector('.app-bar ' + sel)).filter((b) => b && !b.hidden)
    .map((b) => ({ id: 'shell:' + b.className, label: (b.title || b.textContent).replace(/\s*\(.*\)$/, '').trim(), group: 'KHADRAW', key: (/\(([^)]+)\)$/.exec(b.title || '') || [])[1] || '', run: () => b.click() }));
  return [...own, ...shell].filter((x) => x.label);
}
function openPalette() {
  if (dlg?.open) return;
  const all = items();
  const input = el('input', { type: 'search', className: 'kd-pal-input', placeholder: W.searchPh, 'aria-label': W.search, 'aria-controls': 'kd-pal-list', autocomplete: 'off' });
  const list = el('ul', { className: 'kd-pal-list', id: 'kd-pal-list', role: 'listbox', 'aria-label': W.search });
  let shown = [], at = 0;
  const norm = (s) => String(s).toLowerCase();
  const render = () => {
    const q = norm(input.value.trim());
    shown = all.filter((x) => !q || norm(x.label + ' ' + x.group).includes(q)).slice(0, 60);
    at = Math.min(at, Math.max(0, shown.length - 1));
    list.replaceChildren(...(shown.length ? shown.map((x, i) => {
      const li = el('li', { role: 'option', id: 'kd-pal-' + i, 'aria-selected': i === at ? 'true' : 'false', 'aria-disabled': x.disabled ? 'true' : null, className: 'kd-pal-item', title: x.hint || null },
        el('span', { className: 'kd-pal-label' }, x.label), el('span', { className: 'kd-pal-group' }, x.group || ''), x.key ? el('kbd', {}, x.key) : null);
      li.addEventListener('mousemove', () => { if (at !== i) { at = i; render(); } });
      li.addEventListener('click', () => choose(i));
      return li;
    }) : [el('li', { className: 'kd-pal-none' }, W.none)]));
    input.setAttribute('aria-activedescendant', shown.length ? 'kd-pal-' + at : '');
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  };
  const choose = (i) => { const x = shown[i]; if (!x || x.disabled) return; closePalette(); setTimeout(() => x.run(), 0); };
  input.addEventListener('input', () => { at = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(shown.length - 1, at + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, at - 1); render(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(at); }
  });
  dlg = el('dialog', { className: 'kd-palette', 'data-kd-palette': '', 'aria-label': W.search },
    el('div', { className: 'kd-pal-head' }, icon('bi-search'), input, el('kbd', {}, 'Esc')), list);
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closePalette(); });
  dlg.addEventListener('close', () => { dlg?.remove(); dlg = null; });
  document.body.append(dlg);
  dlg.showModal();
  render();
  input.focus();
}
function closePalette() { if (dlg?.open) dlg.close(); }
function mountSearch(bar) {
  if (bar.querySelector('[data-palette-open]')) return;
  const b = el('button', { type: 'button', className: 'kd-search', 'data-palette-open': '', title: W.search + ' (Ctrl+K)', 'aria-haspopup': 'dialog' },
    icon('bi-search'), el('span', { className: 'kd-search-label' }, W.search), el('kbd', {}, 'Ctrl K'));
  b.addEventListener('click', openPalette);
  const modesNav = bar.querySelector('[data-kd-modes]');
  (modesNav ? modesNav.after(b) : bar.append(b));
}

// ------------------------------------------------------------------------------------------------ ModelCraft's tool rail
function mountRail() {
  const tools = document.querySelector('body > main.mc > .mc-tools'), stage = document.querySelector('main.mc > .mc-stage');
  if (!tools || !stage || stage.querySelector('[data-kd-rail]')) return;
  const layout = window.ccInput?.current?.()?.layout;
  if (layout && layout !== 'toolbar') return;   // the ribbon arranges the groups itself
  const groups = [...tools.children].filter((c) => c.classList.contains('mc-tool-group'));
  if (groups.length < 6) return;
  const rail = el('nav', { className: 'mc-tools kd-rail', 'data-kd-rail': '', role: 'toolbar', 'aria-label': W.rail, 'aria-orientation': 'vertical' });
  for (const g of groups.slice(1, 4)) rail.append(g);   // Draw, Modify, Organize (File, Edit, Camera stay in the bar)
  stage.prepend(rail);
  document.documentElement.classList.add('kd-has-rail');
}

/** Ctrl+K when nothing else took it: the input layer leaves keys to the app in the app's own style, and neither app
 * binds Ctrl+K itself (the other styles reach the same button through app.palette). */
function onKey(e) {
  if (e.defaultPrevented || e.isComposing || e.repeat || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || (e.key || '').toLowerCase() !== 'k') return;
  const t = e.target;
  if (document.querySelector('dialog[open]') || (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))) return;
  e.preventDefault();
  openPalette();
}

function mount() {
  const bar = document.querySelector('header.app-bar');
  if (bar && APP) { mountModes(bar); mountSearch(bar); window.addEventListener('keydown', onKey); }
  if (APP === 'modelcraft') mountRail();
  keepFormsHere();
  window.kdLayout = { app: APP, modes, openPalette, closePalette };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
