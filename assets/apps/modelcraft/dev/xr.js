/* SPDX-License-Identifier: Apache-2.0 */
/**
 * xr.js — MonzDraw in a headset or on a phone through WebXR (Quest 3/3S, Pico 4 Ultra, Android Chrome; the VITURE
 * glasses show the phone's screen). Look at the model at 1:1 or as a table model, and model in it with xr-tools.js.
 *
 *   installXR({ view, stage, model, host, t })   → { enter(mode), end(), session(), state, tools }
 *                                                   mode 'immersive-vr' | 'immersive-ar'
 *
 * The model is Z up in meters; WebXR is Y up in meters. While a session runs every object of view.scene moves into one
 * `world` group (Z up → Y up, then the user's scale, turn and offset), and the controllers, the wrist menu and the
 * tools' marks stay in the room's own space (so a cursor is the same size at any scale). The session ends → the
 * objects go back and the desktop view draws as before.
 *
 * Controllers:  trigger = use the tool (or a menu button)      grip = drag the model; both grips = scale and turn it
 * Hands (Quest, Pico): point and pinch = trigger; a fist = grip (one fist drags the model, two fists scale and turn it); the
 *               menu and keypad stay on the left wrist, the right hand points at them.
 *               left stick = walk · right stick = turn 30°      A = undo · B = cancel · X = redo · Y = menu on/off
 * The menu rides on the left wrist: Line, Curve, Rectangle, Circle, Push/Pull, Follow me, Move, Copy, Eraser, Measure, Teleport (the next
 * trigger puts you where you point: walking at 1:1 with bare hands), Undo, Redo, 1:1 ↔ table, Exit;
 * while a tool waits for a length it turns into a keypad (type 2.5, 250cm, 4,3; after a copy 3x or /3; ✓ applies, Cancel
 * goes back to the menu).
 * A phone in AR: tap the floor to place the model, then the buttons at the bottom pick the tool and a tap uses it.
 *
 * ?xremu=quest3 (or quest-pro) on a desktop browser loads IWER, Meta's WebXR emulator, with its on-screen controls
 * (dev only; downloaded from esm.sh).
 */
import * as THREE from 'three';
import { el } from './ui-util.js';
import { XRTools } from './xr-tools.js';
import { drawIcon } from './xr-icons.js';
import { roomItems, buildScan } from './xr-scan.js';
import { PALETTE, cleanScene } from './model.js';
import { MATERIALS } from './render/materials.js';

const TABLE_SCALE = 1 / 10;   // largest table scale; big models shrink further to fit TABLE_SIZE
const TABLE_SIZE = 0.8;       // a table model fits in this many meters
const WALK = 1.6;             // m/s at full stick
const TURN = Math.PI / 6;
const FIST_CLOSED = 0.075, FIST_OPEN = 0.095;   // m: farthest of index/middle/ring tip from the palm base that closes / opens a fist
const JOINTS = ['wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  ...['index', 'middle', 'ring', 'pinky'].flatMap((f) => ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map((p) => f + '-finger-' + p))];
const Z_UP = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
const TEAL = 0x14b8a6;
const KIND = {   // snap kinds → colour (the desktop's inference colours)
  end: 0x22c55e, mid: 0x06b6d4, edge: 0xef4444, face: 0x3b82f6, ground: 0x9ca3af, plane: 0x9ca3af,
  'axis-x': 0xef4444, 'axis-y': 0x22c55e, 'axis-z': 0x3b82f6, push: 0xf59e0b, rect: 0xf59e0b, measure: 0xeab308, erase: 0xf43f5e, typed: 0x22c55e,
  guide: 0xe879f9, guidept: 0xe879f9, section: 0xf97316, markup: 0xef4444,
};

/** IWER, only when the page asks for it (?xremu=…). Must run before navigator.xr is read. */
async function emulator() {
  const want = new URLSearchParams(location.search).get('xremu');
  if (!want) return;
  try {
    const iwer = await import('https://esm.sh/iwer@2.5.0');
    const device = new iwer.XRDevice(want === 'quest-pro' ? iwer.metaQuestPro : iwer.metaQuest3);
    device.installRuntime({ forceInstall: true });   // desktop Chrome has a native (empty) navigator.xr
    try { const { DevUI } = await import('https://esm.sh/@iwer/devui@2.5.0'); new DevUI(device); } catch (e) { console.warn('IWER DevUI', e); }
    window.monzdrawXRDevice = device;
  } catch (e) { console.warn('WebXR emulator failed to load', e); }
}

/** A canvas-backed texture for labels and the menu. */
function canvasTex(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return { c, g: c.getContext('2d'), tex };
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

export async function installXR({ view, stage, model, host, t = (k, d) => d }) {
  await emulator();
  const renderer = view.renderer, scene = view.scene;
  const tools = new XRTools({ model, host, changed: () => host.changed() });
  const st = { scale: 1, yaw: 0, pos: new THREE.Vector3(), table: false };   // world = T(pos) · Ry(yaw) · S(scale) · Z_UP · (-centre)
  // AR: the real room hides the model behind it (menu toggle; read before the menu labels ask for it)
  let occludeOn = true;
  try { occludeOn = localStorage.getItem('monzdraw.xr.occlude') !== '0'; } catch { /* private mode */ }

  // ---- the page: Enter VR / Enter AR ----
  const bar = el('div', { className: 'mz-xr-bar', hidden: true });
  const vrBtn = el('button', { type: 'button', className: 'mz-xr-btn', hidden: true, onClick: () => enter('immersive-vr') }, t('xr.enter_vr', 'Enter VR'));
  const arBtn = el('button', { type: 'button', className: 'mz-xr-btn', hidden: true, onClick: () => enter('immersive-ar') }, t('xr.enter_ar', 'Enter AR'));
  bar.append(vrBtn, arBtn);
  stage.append(bar);

  // ---- the menu's items: the wrist menu in a headset, the bottom bar on a phone ----
  const ITEMS = [
    { id: 'select', label: t('xr.tool.select', 'Select'), tool: true },
    { id: 'line', label: t('xr.tool.line', 'Line'), tool: true },
    { id: 'arc', label: t('xr.tool.arc', 'Arc'), tool: true },
    { id: 'curve', label: t('xr.tool.curve', 'Curve'), tool: true },
    { id: 'rect', label: t('xr.tool.rect', 'Rectangle'), tool: true },
    { id: 'box', label: t('xr.tool.box', 'Box'), tool: true },
    { id: 'circle', label: t('xr.tool.circle', 'Circle'), tool: true },
    { id: 'polygon', label: t('xr.tool.polygon', 'Polygon'), tool: true },
    { id: 'push', label: t('xr.tool.push', 'Push/Pull'), tool: true },
    { id: 'paint', label: t('xr.tool.paint', 'Paint'), tool: true },
    { id: 'follow', label: t('xr.tool.follow', 'Follow me'), tool: true },
    { id: 'move', label: t('xr.tool.move', 'Move'), tool: true },
    { id: 'copy', label: t('xr.tool.copy', 'Copy'), tool: true },
    { id: 'rotate', label: t('xr.tool.rotate', 'Rotate'), tool: true },
    { id: 'offset', label: t('xr.tool.offset', 'Offset'), tool: true },
    { id: 'resize', label: t('xr.tool.resize', 'Scale'), tool: true },
    { id: 'erase', label: t('xr.tool.erase', 'Eraser'), tool: true },
    { id: 'measure', label: t('xr.tool.measure', 'Measure'), tool: true },
    { id: 'angle', label: t('xr.tool.angle', 'Angle'), tool: true },
    { id: 'hide', label: t('xr.tool.hide', 'Hide'), tool: true },
    { id: 'markup', label: t('xr.tool.markup', 'Markup pen'), tool: true },
    { id: 'unhide', label: t('xr.unhide', 'Unhide all') },
    { id: 'clearmarkup', label: t('xr.clear_markup', 'Delete markup') },
    { id: 'photo', label: t('xr.photo', 'Photo') },
    { id: 'scenes', label: t('xr.scenes', 'Scenes') },
    { id: 'occlude', label: () => (occludeOn ? t('xr.occlude_on', 'Real room hides: on') : t('xr.occlude_off', 'Real room hides: off')) },
    { id: 'tape', label: t('xr.tool.tape', 'Tape'), tool: true },
    { id: 'section', label: t('xr.tool.section', 'Section'), tool: true },
    { id: 'cuts', label: t('xr.cuts', 'Section cut on/off') },
    { id: 'clearguides', label: t('xr.clear_guides', 'Delete guides') },
    { id: 'group', label: t('xr.group', 'Make group') },
    { id: 'layers', label: t('xr.layers', 'Layers') },
    { id: 'teleport', label: t('xr.teleport', 'Teleport') },
    { id: 'scanlive', label: t('xr.scan_live', 'Live scan') },
    { id: 'scan', label: t('xr.scan', 'Scan room') },
    { id: 'turn', label: t('xr.turn', 'Turn 45°') },
    { id: 'grid', label: t('xr.grid', 'Grid') },
    { id: 'scale', label: () => (st.table ? t('xr.full', 'Full size 1:1') : t('xr.table', 'Table model')) },
    { id: 'undo', label: t('xr.undo', 'Undo') },
    { id: 'redo', label: t('xr.redo', 'Redo') },
    { id: 'exit', label: t('xr.exit', 'Exit') },
    { id: 'next', label: t('xr.more', 'More ›') },
    { id: 'prev', label: t('xr.back_page', '‹ Back') },
  ];
  // the wrist menu has two pages of 24: drawing and editing first, the room and the view on the second
  const PAGES = [
    ['select', 'line', 'arc', 'curve', 'rect', 'box', 'circle', 'push', 'follow', 'offset', 'move', 'copy',
      'rotate', 'paint', 'erase', 'tape', 'section', 'group', 'layers', 'teleport', 'undo', 'redo', 'exit', 'next'],
    ['measure', 'angle', 'polygon', 'resize', 'hide', 'unhide', 'markup', 'clearmarkup', 'photo', 'scenes', 'turn', 'grid',
      'scanlive', 'scan', 'occlude', 'cuts', 'clearguides', 'scale', 'prev'],
  ];
  let page = 0;
  const pageItems = () => PAGES[page].map((id) => ITEMS.find((it) => it.id === id)).filter(Boolean);
  let teleportOn = false;   // the next trigger moves you to where you point (instead of using the tool)
  const isOn = (it) => (it.id === 'teleport' ? teleportOn : !!it.tool && !teleportOn && tools.name === it.id);
  const labelOf = (it) => (typeof it.label === 'function' ? it.label() : it.label);
  function run(id) {
    if (ITEMS.find((it) => it.id === id)?.tool) { tools.set(id); teleportOn = false; if (id === 'paint') panel = 'paint'; }
    else if (id === 'teleport') { tools.cancel(); teleportOn = !teleportOn; }
    else if (id === 'undo') tools.undo();
    else if (id === 'redo') tools.redo();
    else if (id === 'scale') toggleScale();
    else if (id === 'turn') turnBy(-Math.PI / 4);
    else if (id === 'grid') { gridOn = !gridOn; ground.visible = gridOn; }
    else if (id === 'group') tools.makeGroup();
    else if (id === 'scan') { if (mode === 'immersive-ar') scanAsked = {}; else say(t('xr.scan_ar_only', 'Scan room works in AR: exit and choose Enter AR')); }
    else if (id === 'next') page = 1;
    else if (id === 'prev') page = 0;
    else if (id === 'cuts') { if (!tools.toggleCuts()) say(t('xr.cuts_none', 'No section yet: use the Section tool')); }
    else if (id === 'clearguides') tools.clearGuides();
    else if (id === 'unhide') { if (!tools.unhideAll()) say(t('xr.unhide_none', 'Nothing is hidden')); }
    else if (id === 'clearmarkup') tools.clearMarkup(markupNames());
    else if (id === 'photo') photoAsked = true;
    else if (id === 'scenes') panel = panel === 'scenes' ? 'menu' : 'scenes';
    else if (id === 'occlude') {
      occludeOn = !occludeOn;
      try { localStorage.setItem('monzdraw.xr.occlude', occludeOn ? '1' : '0'); } catch { /* private mode */ }
      say(mode === 'immersive-ar' ? t('xr.occlude_next', 'Takes effect the next time you enter AR') : t('xr.occlude_ar', 'Works in AR on Quest 3 (depth sensing)'));
    }
    else if (id === 'scanlive') { if (mode === 'immersive-ar') liveScan(); else say(t('xr.scan_ar_only', 'Scan room works in AR: exit and choose Enter AR')); }
    else if (id === 'layers') panel = panel === 'layers' ? 'menu' : 'layers';
    else if (id === 'exit') end();
    else if (id === 'place') { placed = false; hint.hidden = false; hint.textContent = t('xr.ar_hint', 'Point at the floor, then tap to place the model'); }
    paintMenu(); syncOverlay();
  }

  // the phone's screen during AR (dom-overlay)
  const overlay = el('div', { className: 'mz-xr-overlay', hidden: true });
  const hint = el('div', { className: 'mz-xr-hint' }, t('xr.ar_hint', 'Point at the floor, then tap to place the model'));
  const ovBtns = new Map();
  const row1 = el('div', { className: 'mz-xr-overlay-row' }), row2 = el('div', { className: 'mz-xr-overlay-row' });
  for (const it of [...ITEMS.filter((x) => x.id !== 'next' && x.id !== 'prev'), { id: 'place', label: t('xr.place', 'Place again') }]) {
    const b = el('button', { type: 'button', className: 'mz-xr-btn mz-xr-btn-sm', onClick: () => run(it.id) }, labelOf(it));
    ovBtns.set(it.id, b);
    (it.tool ? row1 : row2).append(b);
  }
  // a typed length on the phone: its own keyboard
  const typeIn = el('input', { type: 'text', className: 'mz-xr-type', inputMode: 'decimal', placeholder: t('xr.type_hint', 'Length, e.g. 2.5 or 4,3'), autocomplete: 'off' });
  const typeOk = el('button', { type: 'button', className: 'mz-xr-btn mz-xr-btn-sm', onClick: () => applyTyped() }, '✓');
  const row0 = el('div', { className: 'mz-xr-overlay-row', hidden: true }, typeIn, typeOk);
  function applyTyped() {
    if (typeIn.value && tools.typed(typeIn.value)) typeIn.value = '';
    hint.textContent = tools.tip || hint.textContent;
    syncOverlay();
  }
  typeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyTyped(); } });
  overlay.append(hint, row0, row1, row2);
  document.body.append(overlay);
  for (const ev of ['beforexrselect', 'pointerdown', 'click']) overlay.addEventListener(ev, (e) => e.stopPropagation());
  overlay.addEventListener('beforexrselect', (e) => e.preventDefault());   // taps on the buttons are not taps in the model
  function syncOverlay() {
    for (const it of ITEMS) {
      const b = ovBtns.get(it.id);
      if (!b) continue;
      b.textContent = labelOf(it);
      b.classList.toggle('is-on', isOn(it));
    }
    row0.hidden = !tools.canType();
  }

  if (navigator.xr) {
    const [vr, ar] = await Promise.all(['immersive-vr', 'immersive-ar'].map((m) => navigator.xr.isSessionSupported(m).catch(() => false)));
    vrBtn.hidden = !vr; arBtn.hidden = !ar; bar.hidden = !(vr || ar);
  }

  let session = null, mode = null, saved = null, hitSource = null, placed = true;
  const eye = new THREE.PerspectiveCamera(70, 1, 0.02, 5000);   // three.js poses it from the headset each frame
  const world = new THREE.Group();
  // the ground grid in the model's own coordinates (1 m squares, every 5 m a stronger line) and the origin's red, green
  // and blue axes; Grid on the menu shows or hides it
  const ground = new THREE.Group();
  {
    const fine = new THREE.GridHelper(40, 40, 0x94a3b8, 0x94a3b8), bold = new THREE.GridHelper(40, 8, 0xcbd5e1, 0xcbd5e1);
    for (const [g, o] of [[fine, 0.18], [bold, 0.35]]) { g.material.transparent = true; g.material.opacity = o; g.material.depthWrite = false; g.rotation.x = Math.PI / 2; ground.add(g); }
    const axis = (to, color, op) => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(...to)]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: op })); ground.add(l); };
    axis([5, 0, 0], 0xef4444, 0.95); axis([0, 5, 0], 0x22c55e, 0.95); axis([0, 0, 3], 0x3b82f6, 0.95);
    axis([-5, 0, 0], 0xef4444, 0.3); axis([0, -5, 0], 0x22c55e, 0.3);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshBasicMaterial({ color: 0xf8fafc }));
    ground.add(dot);
  }
  let gridOn = true;
  world.matrixAutoUpdate = false;
  const worldInv = new THREE.Matrix4();
  let centre = new THREE.Vector3();   // the model's anchor in its own coordinates: bottom centre of its box

  const reticle = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: TEAL }));
  reticle.matrixAutoUpdate = false; reticle.visible = false;

  function compose() {
    const m = new THREE.Matrix4().makeTranslation(st.pos.x, st.pos.y, st.pos.z)
      .multiply(new THREE.Matrix4().makeRotationY(st.yaw))
      .multiply(new THREE.Matrix4().makeScale(st.scale, st.scale, st.scale))
      .multiply(Z_UP)
      .multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z));
    world.matrix.copy(m);
    world.matrixWorldNeedsUpdate = true;
    worldInv.copy(m).invert();
    // lengths round to 1 cm at full size, coarser on a small model
    tools.grid = st.scale >= 0.5 ? 0.01 : st.scale >= 0.05 ? 0.05 : 0.1;
  }

  function measure() {
    const box = new THREE.Box3();
    world.matrix.identity(); world.updateMatrixWorld(true);
    box.setFromObject(view.root);
    if (box.isEmpty()) box.set(new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1, 1, 2));
    centre = new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.min.z);
    return box.getSize(new THREE.Vector3());
  }

  /** 1:1 → stand in the middle of the model on the floor; table → in front of you a little below eye height. */
  function layout(table) {
    const size = measure();
    st.table = table; st.yaw = 0;
    if (table) {
      st.scale = Math.min(TABLE_SCALE, TABLE_SIZE / Math.max(size.x, size.y, size.z, 0.01));
      const head = renderer.xr.getCamera(), at = head.getWorldPosition(new THREE.Vector3()), fwd = head.getWorldDirection(new THREE.Vector3());
      fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); fwd.normalize();
      st.pos.copy(at).addScaledVector(fwd, 0.7); st.pos.y = Math.max(0.6, at.y - 0.45);
      st.yaw = Math.atan2(-fwd.x, -fwd.z);
    } else { st.scale = 1; st.pos.set(0, 0, 0); }
    compose();
    paintMenu(); syncOverlay();
  }
  /** Turn the model about the vertical: about where you stand at 1:1, about the model's own anchor as a table model. */
  function turnBy(a) {
    const pivot = st.table || mode === 'immersive-ar' ? st.pos.clone() : renderer.xr.getCamera().getWorldPosition(new THREE.Vector3());
    pivot.y = 0;
    st.pos.sub(pivot).applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(pivot);
    st.yaw += a; compose();
  }
  function toggleScale() { tools.cancel(); layout(!st.table); }

  // ---- the wrist menu: a 6 × 4 panel of icons with their names under them, on the left controller, pointed at with
  // the right; Layers turns it into the layer list ----
  const MENU_W = 0.3, MENU_H = 0.2, COLS = 6, ROWS = 4;
  const menuTex = canvasTex(1200, 800);
  let panel = 'menu';   // 'menu' | 'layers' | 'paint' | 'scenes'
  // AR: the real room hides the model behind it (Quest 3 depth sensing); a choice kept on this device
  const markupNames = () => ({ name: t('xr.markup_group', 'Markup'), layer: t('xr.markup_layer', 'Markup') });
  const menu = new THREE.Mesh(new THREE.PlaneGeometry(MENU_W, MENU_H), new THREE.MeshBasicMaterial({ map: menuTex.tex, transparent: true, side: THREE.DoubleSide }));
  menu.position.set(0, 0.05, 0.03); menu.rotation.x = -Math.PI / 3;   // above the wrist, tilted towards you
  menu.visible = false;
  let menuHover = -1;
  function paintMenu() {
    if (panel === 'layers') { paintLayers(); return; }
    if (panel === 'paint') { paintSwatches(); return; }
    if (panel === 'scenes') { paintScenes(); return; }
    const { g, c, tex } = menuTex, cw = c.width / COLS, ch = c.height / ROWS;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(15, 23, 42, 0.9)'; roundRect(g, 0, 0, c.width, c.height, 36); g.fill();
    pageItems().forEach((it, i) => {
      const x = (i % COLS) * cw, y = Math.floor(i / COLS) * ch, on = isOn(it) || (it.id === 'grid' && gridOn) || (it.id === 'layers' && panel === 'layers') || (it.id === 'occlude' && occludeOn);
      g.fillStyle = on ? '#0f766e' : i === menuHover ? '#334155' : '#1e293b';
      roundRect(g, x + 8, y + 8, cw - 16, ch - 16, 22); g.fill();
      if (i === menuHover) { g.strokeStyle = '#5eead4'; g.lineWidth = 5; g.stroke(); }
      drawIcon(g, it.id, x + cw / 2 - 52, y + 22, 104, '#f8fafc', it.id === 'paint' ? swatchColor(tools.paintColor) : on ? '#ccfbf1' : '#5eead4');
      g.fillStyle = '#e2e8f0'; g.font = '500 27px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(labelOf(it), x + cw / 2, y + ch - 36, cw - 24);
    });
    tex.needsUpdate = true;
  }
  // ---- Scenes: the model's saved views; a row takes you there (1:1, standing at its eye, facing its target) ----
  const SCENE_ROWS = 8;
  let sceneHover = null;
  function paintScenes() {
    const { g, c, tex } = menuTex, rh = c.height / (SCENE_ROWS + 2);
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(15, 23, 42, 0.92)'; roundRect(g, 0, 0, c.width, c.height, 36); g.fill();
    drawIcon(g, 'scenes', 24, 8, rh - 16, '#f8fafc');
    g.fillStyle = '#f8fafc'; g.font = '600 34px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(t('xr.scenes', 'Scenes'), 24 + rh, rh / 2);
    const list = model.scenes.slice(0, SCENE_ROWS);
    if (!list.length) { g.fillStyle = '#94a3b8'; g.font = '500 30px system-ui, sans-serif'; g.fillText(t('xr.scenes_none', 'No scenes yet: Save this view makes one'), 40, rh * 1.5); }
    list.forEach((sc, i) => {
      const y = rh * (i + 1);
      g.fillStyle = sceneHover === i ? '#334155' : '#1e293b'; roundRect(g, 12, y + 6, c.width - 24, rh - 12, 16); g.fill();
      g.fillStyle = '#f8fafc'; g.textAlign = 'left'; g.font = '500 32px system-ui, sans-serif';
      g.fillText((i + 1) + '.  ' + sc.name, 40, y + rh / 2, c.width - 80);
    });
    const by = rh * (SCENE_ROWS + 1);
    [[t('xr.scene_save', '+ Save this view'), SCENE_ROWS], [t('xr.back', 'Back'), SCENE_ROWS + 1]].forEach(([txt, k], j) => {
      g.fillStyle = sceneHover === k ? '#0f766e' : '#1e293b';
      roundRect(g, 12 + j * c.width / 2, by + 6, c.width / 2 - 24, rh - 12, 16); g.fill();
      g.fillStyle = '#f8fafc'; g.textAlign = 'center'; g.font = '600 32px system-ui, sans-serif';
      g.fillText(txt, c.width / 4 + j * c.width / 2, by + rh / 2);
    });
    tex.needsUpdate = true;
  }
  /** 0..7 a scene, 8 Save, 9 Back; or null. */
  function sceneCell(h) {
    if (panel !== 'scenes' || !menu.visible || h.screen || menu.parent === h.grip) return null;
    const o = new THREE.Vector3().setFromMatrixPosition(h.c.matrixWorld), d = new THREE.Vector3(0, 0, -1).transformDirection(h.c.matrixWorld);
    raycaster.set(o, d);
    const hit = raycaster.intersectObject(menu, false)[0];
    if (!hit?.uv) return null;
    const r = Math.floor((1 - hit.uv.y) * (SCENE_ROWS + 2)) - 1;
    if (r < 0) return null;
    if (r >= SCENE_ROWS) return hit.uv.x < 0.5 ? SCENE_ROWS : SCENE_ROWS + 1;
    return r < model.scenes.length ? r : null;
  }
  function sceneClick(k) {
    if (k === SCENE_ROWS) saveScene();
    else if (k === SCENE_ROWS + 1) panel = 'menu';
    else goScene(model.scenes[k]);
    paintMenu();
  }
  /** Where you stand and look now, as a scene of the model (the desktop's scene list shows it too). */
  function saveScene() {
    const head = renderer.xr.getCamera(), at = head.getWorldPosition(new THREE.Vector3()), fwd = head.getWorldDirection(new THREE.Vector3());
    const e = at.clone().applyMatrix4(worldInv), tg = at.clone().addScaledVector(fwd, 3).applyMatrix4(worldInv);
    const name = t('xr.scene_name', 'Scene {n}').replace('{n}', model.scenes.length + 1);
    const sc = cleanScene({ name, cam: { eye: [e.x, e.y, e.z], target: [tg.x, tg.y, tg.z], fov: 60, persp: true, height: 10 }, style: view.style, vis: model.captureVis?.() });
    if (!sc) return;
    model.change('Add scene', (m) => { m.scenes = [...m.scenes, sc]; });
    host.changed();
    say(t('xr.scene_saved', 'Saved: {name}').replace('{name}', name));
  }
  /** Go to a scene: full size, its eye where your head is, its target straight ahead. */
  function goScene(sc) {
    if (!sc?.cam) return;
    if (sc.vis && model.applyVis) { model.applyVis(sc.vis); host.changed(); }
    const head = renderer.xr.getCamera(), at = head.getWorldPosition(new THREE.Vector3()), fwd = head.getWorldDirection(new THREE.Vector3());
    fwd.y = 0; if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    const E = new THREE.Vector3(...sc.cam.eye), T = new THREE.Vector3(...sc.cam.target);
    const v = T.clone().sub(E).applyMatrix4(Z_UP); v.y = 0;
    st.scale = 1; st.table = false; st.pos.set(0, 0, 0);
    st.yaw = v.lengthSq() > 1e-9 ? Math.atan2(fwd.x, fwd.z) - Math.atan2(v.x, v.z) : st.yaw;
    compose();
    const e = E.clone().applyMatrix4(world.matrix);
    st.pos.copy(at).sub(e);
    compose(); paintMenu(); syncOverlay();
    say(sc.name);
  }

  // ---- the Paint swatches: 16 colours and 8 materials, then Default, Pick (eyedropper) and Back ----
  const SWATCHES = [...PALETTE.map(([name, c]) => ({ c, name: t('app.color.' + name.toLowerCase().replace(/\s+/g, '_'), name) })),
    ...['brick-red', 'wood-oak', 'concrete', 'tile-white', 'stone-limestone', 'glass-clear', 'metal-steel', 'grass']
      .map((id) => MATERIALS.find((m) => m.id === id)).filter(Boolean).map((m) => ({ c: 'mat:' + m.id, name: t('render.mat.' + m.id, m.id), mat: m }))];
  const SW_COLS = 6, SW_ROWS = 5;   // 4 rows of swatches, then the buttons
  const swatchColor = (c) => (!c ? '#e2e8f0' : c.startsWith('mat:') ? MATERIALS.find((m) => 'mat:' + m.id === c)?.color || '#c8c4bc' : c);
  let swHover = -1;
  function paintSwatches() {
    const { g, c, tex } = menuTex, cw = c.width / SW_COLS, ch = c.height / SW_ROWS;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(15, 23, 42, 0.92)'; roundRect(g, 0, 0, c.width, c.height, 36); g.fill();
    SWATCHES.forEach((sw, i) => {
      const x = (i % SW_COLS) * cw, y = Math.floor(i / SW_COLS) * ch, on = tools.paintColor === sw.c;
      g.fillStyle = swatchColor(sw.c); roundRect(g, x + 10, y + 10, cw - 20, ch - 20, 18); g.fill();
      if (sw.mat) {   // a material: a hint of its pattern
        g.strokeStyle = 'rgba(0, 0, 0, 0.25)'; g.lineWidth = 3;
        for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x + 14, y + 10 + k * (ch - 20) / 4); g.lineTo(x + cw - 14, y + 10 + k * (ch - 20) / 4); g.stroke(); }
      }
      if (on || i === swHover) { g.strokeStyle = on ? '#5eead4' : '#f8fafc'; g.lineWidth = on ? 9 : 5; roundRect(g, x + 10, y + 10, cw - 20, ch - 20, 18); g.stroke(); }
      g.fillStyle = 'rgba(15, 23, 42, 0.7)'; g.fillRect(x + 10, y + ch - 52, cw - 20, 40);
      g.fillStyle = '#f8fafc'; g.font = '500 24px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(sw.name, x + cw / 2, y + ch - 32, cw - 28);
    });
    const by = 4 * ch, bw = c.width / 3;
    [[t('xr.paint_default', 'Default'), !tools.paintColor && !tools.picking], [t('xr.paint_pick', 'Pick colour'), tools.picking], [t('xr.back', 'Back'), false]].forEach(([txt, on], k) => {
      g.fillStyle = on ? '#0f766e' : swHover === SWATCHES.length + k ? '#334155' : '#1e293b';
      roundRect(g, k * bw + 10, by + 10, bw - 20, ch - 20, 18); g.fill();
      g.fillStyle = '#f8fafc'; g.font = '600 32px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, k * bw + bw / 2, by + ch / 2, bw - 40);
    });
    tex.needsUpdate = true;
  }
  /** Which swatch h points at: 0..23 a swatch, 24 Default, 25 Pick, 26 Back; or -1. */
  function swatchCell(h) {
    if (panel !== 'paint') return -1;
    const i = panelCell(h, menu, SW_COLS, SW_ROWS, SW_COLS * SW_ROWS);
    if (i < 0) return -1;
    if (i < SWATCHES.length) return i;
    if (i < 24) return -1;
    return SWATCHES.length + Math.min(2, Math.floor((i - 24) / 2));
  }
  function swatchClick(i) {
    if (i < SWATCHES.length) { tools.paintColor = SWATCHES[i].c; tools.picking = false; panel = 'menu'; }
    else if (i === SWATCHES.length) { tools.paintColor = null; tools.picking = false; panel = 'menu'; }
    else if (i === SWATCHES.length + 1) { tools.picking = true; panel = 'menu'; say(t('xr.paint_pick_hint', 'Point at a face and click: its colour is the one you paint with')); }
    else panel = 'menu';
    paintMenu();
  }

  // the layer list: an eye to show or hide, the name, "Put here" (the selection goes on this layer); New and Back underneath
  const LAYER_ROWS = 8;
  let layerHover = null;
  function paintLayers() {
    const { g, c, tex } = menuTex, rh = c.height / (LAYER_ROWS + 2);
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(15, 23, 42, 0.92)'; roundRect(g, 0, 0, c.width, c.height, 36); g.fill();
    drawIcon(g, 'layers', 24, 8, rh - 16, '#f8fafc');
    g.fillStyle = '#f8fafc'; g.font = '600 34px system-ui, sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(t('xr.layers', 'Layers') + (tools.selection?.length ? '  ·  ' + t('xr.layers_put_hint', 'Put here: the selection goes on that layer') : ''), 24 + rh, rh / 2, c.width - rh - 40);
    const tags = model.tags.slice(0, LAYER_ROWS);
    if (!tags.length) { g.fillStyle = '#94a3b8'; g.font = '500 30px system-ui, sans-serif'; g.fillText(t('xr.layers_none', 'No layers yet: New makes one'), 40, rh * 1.5); }
    tags.forEach((tg, i) => {
      const y = rh * (i + 1), hov = layerHover && layerHover.row === i;
      g.fillStyle = hov ? '#334155' : '#1e293b'; roundRect(g, 12, y + 6, c.width - 24, rh - 12, 16); g.fill();
      // the eye: open = shown, closed (a line) = hidden
      const ex = c.width * 0.09, ey = y + rh / 2;
      g.strokeStyle = tg.hidden ? '#64748b' : '#5eead4'; g.lineWidth = 5;
      g.beginPath(); g.ellipse(ex, ey, 30, tg.hidden ? 3 : 16, 0, 0, Math.PI * 2); g.stroke();
      if (!tg.hidden) { g.fillStyle = '#5eead4'; g.beginPath(); g.arc(ex, ey, 8, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = tg.hidden ? '#94a3b8' : '#f8fafc'; g.textAlign = 'left'; g.font = '500 32px system-ui, sans-serif';
      g.fillText(tg.name, c.width * 0.2, ey, c.width * 0.5);
      g.fillStyle = tools.selection?.length ? (hov && layerHover.col === 2 ? '#14b8a6' : '#0f766e') : '#334155';
      roundRect(g, c.width * 0.74, y + 12, c.width * 0.24, rh - 24, 14); g.fill();
      g.fillStyle = '#f8fafc'; g.textAlign = 'center'; g.font = '600 28px system-ui, sans-serif';
      g.fillText(t('xr.layers_put', 'Put here'), c.width * 0.86, ey);
    });
    const by = rh * (LAYER_ROWS + 1);
    [[t('xr.layers_new', '+ New layer'), 0], [t('xr.back', 'Back'), 1]].forEach(([txt, k]) => {
      g.fillStyle = layerHover && layerHover.row === LAYER_ROWS && layerHover.col === k ? '#0f766e' : '#1e293b';
      roundRect(g, 12 + k * c.width / 2, by + 6, c.width / 2 - 24, rh - 12, 16); g.fill();
      g.fillStyle = '#f8fafc'; g.textAlign = 'center'; g.font = '600 32px system-ui, sans-serif';
      g.fillText(txt, c.width / 4 + k * c.width / 2, by + rh / 2);
    });
    tex.needsUpdate = true;
  }
  /** Where h points on the layer list: {row (0..7 a layer, 8 the buttons), col (0 eye, 1 name, 2 put; buttons: 0 New, 1 Back)}. */
  function layerCell(h) {
    if (panel !== 'layers' || !menu.visible || h.screen || menu.parent === h.grip) return null;
    const o = new THREE.Vector3().setFromMatrixPosition(h.c.matrixWorld), d = new THREE.Vector3(0, 0, -1).transformDirection(h.c.matrixWorld);
    raycaster.set(o, d);
    const hit = raycaster.intersectObject(menu, false)[0];
    if (!hit?.uv) return null;
    const r = Math.floor((1 - hit.uv.y) * (LAYER_ROWS + 2)) - 1, u = hit.uv.x;
    if (r < 0) return null;
    if (r >= LAYER_ROWS) return { row: LAYER_ROWS, col: u < 0.5 ? 0 : 1 };
    if (r >= model.tags.length) return null;
    return { row: r, col: u < 0.18 ? 0 : u > 0.72 ? 2 : 1 };
  }
  function layerClick(cell) {
    if (cell.row === LAYER_ROWS) {
      if (cell.col === 0) tools.addLayer(t('xr.layer', 'Layer'));
      else panel = 'menu';
    } else {
      const tg = model.tags[cell.row];
      if (cell.col === 0) tools.setLayerShown(tg.name, !!tg.hidden);
      else if (cell.col === 2) tools.tagSelection(tg.name);
    }
    paintMenu();
  }
  paintMenu();

  // ---- the wrist keypad: replaces the menu while a tool waits for a length (Line, Rectangle, Push/Pull, Move) ----
  const PAD_KEYS = ['7', '8', '9', '⌫', '4', '5', '6', '-', '1', '2', '3', ',', '0', '.', 'cm', 'mm', 'x', '/', 'm', 'C', '', '', '↩', '✓'];   // x and / : 3x, /3 after a copy
  const PAD_COLS = 4, PAD_ROWS = 6, PAD_TOP = 0.17;   // the top strip shows what is typed
  const padTex = canvasTex(720, 880);
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18 * 880 / 720), new THREE.MeshBasicMaterial({ map: padTex.tex, transparent: true, side: THREE.DoubleSide }));
  pad.position.copy(menu.position); pad.rotation.copy(menu.rotation);
  pad.visible = false;
  let typed = '', padHover = -1, wristOn = true;
  function paintPad() {
    const { g, c, tex } = padTex, top = c.height * PAD_TOP, cw = c.width / PAD_COLS, ch = (c.height - top) / PAD_ROWS;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(15, 23, 42, 0.9)'; roundRect(g, 0, 0, c.width, c.height, 36); g.fill();
    g.fillStyle = '#0b1220'; roundRect(g, 16, 16, c.width - 32, top - 24, 20); g.fill();
    g.fillStyle = typed ? '#f8fafc' : '#64748b'; g.font = '600 64px system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText(typed || (tools.name === 'rect' ? 'w,h' : tools.name === 'copy' && !tools.op ? '3x · /3' : '0'), c.width - 44, 16 + (top - 24) / 2, c.width - 80);
    PAD_KEYS.forEach((k, i) => {
      if (!k) return;
      const x = (i % PAD_COLS) * cw, y = top + Math.floor(i / PAD_COLS) * ch;
      g.fillStyle = k === '✓' ? '#0f766e' : i === padHover ? '#334155' : '#1e293b';
      roundRect(g, x + 8, y + 8, cw - 16, ch - 16, 18); g.fill();
      g.fillStyle = '#f8fafc'; g.font = '600 52px system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(k === '↩' ? t('xr.cancel', 'Cancel') : k, x + cw / 2, y + ch / 2, cw - 24);
    });
    tex.needsUpdate = true;
  }
  paintPad();
  function key(k) {
    if (k === '✓') { if (typed) { if (tools.typed(typed)) typed = ''; } else if (tools.name === 'curve') tools.finishCurve(false); }
    else if (k === '⌫') typed = typed.slice(0, -1);
    else if (k === 'C') typed = '';
    else if (k === '↩') { typed = ''; tools.cancel(); tools.lastCopy = null; }
    else if (!k) return;
    else if (typed.length < 24) typed += k;
    paintPad(); paintMenu(); syncOverlay();
  }
  const padShown = () => tools.canType();

  // ---- the tools' marks (room space): cursor, preview lines, a length label ----
  const fx = new THREE.Group();
  // the snap mark: a small dot with a thin ring, so the point it marks stays visible (4 mm at arm's length)
  const cursor = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 12, 8), new THREE.MeshBasicMaterial({ color: KIND.end, depthTest: false }));
  const cursorRing = new THREE.Mesh(new THREE.RingGeometry(0.008, 0.0095, 32), new THREE.MeshBasicMaterial({ color: KIND.end, depthTest: false, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
  cursor.add(cursorRing);
  cursor.renderOrder = 999; cursorRing.renderOrder = 999;
  // the eraser: an eraser icon at the point, and the edge it would take drawn thick in red
  const eraserTex = canvasTex(128, 128);
  {
    const { g } = eraserTex;
    g.translate(64, 64); g.rotate(-Math.PI / 4);
    g.fillStyle = '#f472b6'; roundRect(g, -44, -22, 52, 44, 8); g.fill();          // the pink rubber
    g.fillStyle = '#e2e8f0'; roundRect(g, 4, -22, 40, 44, 8); g.fill();            // the sleeve
    g.strokeStyle = '#0f172a'; g.lineWidth = 6; roundRect(g, -44, -22, 88, 44, 8); g.stroke();
    eraserTex.tex.needsUpdate = true;
  }
  const eraserIcon = new THREE.Sprite(new THREE.SpriteMaterial({ map: eraserTex.tex, depthTest: false }));
  eraserIcon.scale.set(0.035, 0.035, 1); eraserIcon.renderOrder = 1001; eraserIcon.visible = false;
  const eraseBar = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 1, 8), new THREE.MeshBasicMaterial({ color: KIND.erase, depthTest: false }));
  eraseBar.renderOrder = 998; eraseBar.visible = false;
  const MAXSEG = 256;
  const segGeo = new THREE.BufferGeometry();
  segGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXSEG * 6), 3));
  segGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXSEG * 6), 3));
  const segs = new THREE.LineSegments(segGeo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
  segs.renderOrder = 998; segs.frustumCulled = false;
  // the model's guide lines (dashed, 30 m each way) and guide points (small crosses), redrawn when they or the model's
  // place in the room change
  const MAXGUIDE = 400;
  const guideGeo = new THREE.BufferGeometry();
  guideGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXGUIDE * 6), 3));
  const guideLines = new THREE.LineSegments(guideGeo, new THREE.LineDashedMaterial({ color: 0xc084fc, dashSize: 0.02, gapSize: 0.015, transparent: true, opacity: 0.85 }));
  guideLines.frustumCulled = false;
  let guideKey = '';
  function drawGuides() {
    const k = model.version + ':' + world.matrix.elements.map((x) => x.toFixed(4)).join(',');
    if (k === guideKey) return;
    guideKey = k;
    const pos = guideGeo.attributes.position, L = 30;
    let n = 0;
    const seg = (a, b) => { if (n >= MAXGUIDE) return; pos.setXYZ(n * 2, a.x, a.y, a.z); pos.setXYZ(n * 2 + 1, b.x, b.y, b.z); n++; };
    for (const g of model.guides?.values() || []) {
      if (g.kind === 'line') seg(toRoom(g.p.map((x, i) => x - g.d[i] * L)), toRoom(g.p.map((x, i) => x + g.d[i] * L)));
      else if (g.kind === 'point') {
        const c = toRoom(g.p), r = 0.012;
        for (const v of [[r, 0, 0], [0, r, 0], [0, 0, r]]) seg(c.clone().sub(new THREE.Vector3(...v)), c.clone().add(new THREE.Vector3(...v)));
      }
    }
    pos.needsUpdate = true;
    guideGeo.setDrawRange(0, n * 2);
    guideLines.computeLineDistances();
    guideLines.visible = n > 0;
  }
  const labelTex = canvasTex(512, 128);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex.tex, depthTest: false }));
  label.renderOrder = 1000; label.scale.set(0.12, 0.03, 1); label.material.opacity = 0.85; label.material.transparent = true;
  let labelText = '';
  fx.add(cursor, segs, label, eraserIcon, eraseBar, guideLines);
  const toRoom = (p) => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(world.matrix);
  function drawFx() {
    drawGuides();
    const v = tools.view();
    const erasing = tools.name === 'erase' && !teleportOn;
    cursor.visible = !!v.cursor && !menuHovered && !erasing;
    if (cursor.visible) {
      cursor.position.copy(toRoom(v.cursor.p));
      const c = KIND[v.cursor.kind] ?? KIND.end;
      cursor.material.color.setHex(c); cursorRing.material.color.setHex(c);
      cursorRing.lookAt(renderer.xr.getCamera().getWorldPosition(new THREE.Vector3()));
    }
    const target = erasing && !menuHovered ? tools.eraseTarget : null;
    eraserIcon.visible = !!(target && v.cursor);
    if (eraserIcon.visible) eraserIcon.position.copy(toRoom(v.cursor.p)).add(new THREE.Vector3(0.015, 0.02, 0));
    eraseBar.visible = !!target?.a;
    if (eraseBar.visible) {
      const a = toRoom(target.a), b = toRoom(target.b), L = a.distanceTo(b);
      eraseBar.position.copy(a).add(b).multiplyScalar(0.5);
      eraseBar.scale.set(1, Math.max(L, 1e-4), 1);
      eraseBar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    }
    const pos = segGeo.attributes.position, col = segGeo.attributes.color, c = new THREE.Color();
    const n = Math.min(MAXSEG, v.lines.length);
    for (let i = 0; i < n; i++) {
      const a = toRoom(v.lines[i].a), b = toRoom(v.lines[i].b);
      pos.setXYZ(i * 2, a.x, a.y, a.z); pos.setXYZ(i * 2 + 1, b.x, b.y, b.z);
      c.setHex(KIND[v.lines[i].kind] ?? 0xf8fafc);
      col.setXYZ(i * 2, c.r, c.g, c.b); col.setXYZ(i * 2 + 1, c.r, c.g, c.b);
    }
    segGeo.setDrawRange(0, n * 2); pos.needsUpdate = true; col.needsUpdate = true;
    label.visible = !!v.label;
    if (v.label) {
      // beside the point, not on it: up and to the right as you see it, far enough to keep the point you aim at clear
      const at = toRoom(v.label.p), cam = renderer.xr.getCamera(), q = cam.getWorldQuaternion(new THREE.Quaternion());
      const k = Math.max(0.6, at.distanceTo(cam.getWorldPosition(new THREE.Vector3())));   // the same look at any distance
      label.position.copy(at).add(new THREE.Vector3(0.09, 0.06, 0).applyQuaternion(q).multiplyScalar(k));
      label.scale.set(0.12 * k, 0.03 * k, 1);
      if (v.label.text !== labelText) {
        labelText = v.label.text;
        const { g, c: cv, tex } = labelTex;
        g.clearRect(0, 0, cv.width, cv.height);
        g.fillStyle = 'rgba(15, 23, 42, 0.85)'; roundRect(g, 0, 8, cv.width, cv.height - 16, 40); g.fill();
        g.fillStyle = '#f8fafc'; g.font = '600 60px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(labelText, cv.width / 2, cv.height / 2, cv.width - 40);
        tex.needsUpdate = true;
      }
    }
  }

  // ---- controllers ----
  const hands = [0, 1].map((i) => {
    const c = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i), hand = renderer.xr.getHand(i);
    const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: TEAL }));
    ray.scale.z = 3; c.add(ray);
    const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe2e8f0 }), JOINTS.length);
    dots.frustumCulled = false; dots.visible = false;
    const h = { c, grip, hand, dots, ray, squeeze: false, fist: false, gamepad: null, handed: '', screen: false, isHand: false, prev: [] };
    c.addEventListener('connected', (e) => {
      h.gamepad = e.data.gamepad || null; h.handed = e.data.handedness || ''; h.screen = e.data.targetRayMode === 'screen';
      h.isHand = !!e.data.hand;
      ray.visible = !h.screen;
      if (h.handed === 'left') { grip.add(menu, pad); menu.visible = true; }
      if (h.handed === 'right' || (h.screen && !pointer.gamepad)) pointer = h;
    });
    c.addEventListener('disconnected', () => { h.gamepad = null; h.isHand = false; h.dots.visible = false; if (h.fist) { h.fist = false; h.squeeze = false; startGrab(); } if (menu.parent === grip) { grip.remove(menu, pad); menu.visible = false; pad.visible = false; } });
    c.addEventListener('squeezestart', () => { h.squeeze = true; startGrab(); });
    c.addEventListener('squeezeend', () => { h.squeeze = false; startGrab(); });
    c.addEventListener('select', () => select(h));
    // the eraser sweeps while the trigger (or the pinch) is held
    c.addEventListener('selectstart', () => {
      if ((tools.name !== 'erase' && tools.name !== 'markup') || teleportOn || menuCell(h) >= 0 || padCell(h) >= 0 || h.screen || menuHovered) return;
      h.c.updateMatrixWorld(true); pointer = h; sweeping = h;
      if (tools.name === 'markup') { tools.markStep = 0.006 / st.scale; tools.markBegin(penTip(h)); } else tools.eraseBegin(rayOf(h));
    });
    c.addEventListener('selectend', () => {
      if (sweeping !== h) return;
      sweeping = null;
      if (tools.name === 'markup') tools.markCommit(markupNames()); else tools.eraseCommit();
    });
    return h;
  });
  let pointer = hands[0];   // the hand whose ray the tools follow: the last one that clicked, the right one at first
  const live = (h) => (h.gamepad || h.isHand) && !h.screen;   // a controller or a tracked hand (not a phone's tap)

  /** Tracked hands: draw the joints, and a fist (fingertips curled to the wrist) grabs the model like a grip button. */
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3();
  function handsFrame() {
    for (const h of hands) {
      const J = h.hand.joints;
      if (!h.isHand || !J?.wrist?.visible) { h.dots.visible = false; continue; }
      JOINTS.forEach((name, k) => { const j = J[name]; if (j) { j.getWorldPosition(_p); h.dots.setMatrixAt(k, _m.makeTranslation(_p.x, _p.y, _p.z)); } });
      h.dots.instanceMatrix.needsUpdate = true; h.dots.visible = true;
      const w = (J['middle-finger-metacarpal'] || J.wrist).getWorldPosition(new THREE.Vector3());   // the palm
      const tips = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip'].map((n) => J[n]).filter(Boolean);
      if (!tips.length) continue;
      const curl = Math.max(...tips.map((j) => j.getWorldPosition(_p).distanceTo(w)));   // every fingertip curled in
      h.curl = curl;
      const fist = h.fist ? curl < FIST_OPEN : curl < FIST_CLOSED;
      if (fist !== h.fist) { h.fist = fist; h.squeeze = fist; startGrab(); }
    }
  }

  /** The markup pen's tip: 6 cm ahead of the controller (or the pinch), in model coordinates. */
  function penTip(h) {
    const p = new THREE.Vector3(0, 0, -0.06).applyMatrix4(h.c.matrixWorld).applyMatrix4(worldInv);
    return [p.x, p.y, p.z];
  }
  /** A controller's ray in model coordinates. */
  function rayOf(h) {
    const o = new THREE.Vector3().setFromMatrixPosition(h.c.matrixWorld);
    const tip = new THREE.Vector3(0, 0, -1).applyMatrix4(h.c.matrixWorld);
    const mo = o.clone().applyMatrix4(worldInv), mt = tip.applyMatrix4(worldInv);
    return { o: [mo.x, mo.y, mo.z], d: [mt.x - mo.x, mt.y - mo.y, mt.z - mo.z] };
  }
  const raycaster = new THREE.Raycaster();
  /** The cell of a wrist panel h points at, or -1 (`top`: the share of the panel above the cells). */
  function panelCell(h, mesh, cols, rows, count, top = 0) {
    if (!mesh.visible || h.screen || mesh.parent === h.grip) return -1;
    const o = new THREE.Vector3().setFromMatrixPosition(h.c.matrixWorld);
    const d = new THREE.Vector3(0, 0, -1).transformDirection(h.c.matrixWorld);
    raycaster.set(o, d);
    const hit = raycaster.intersectObject(mesh, false)[0];
    if (!hit?.uv) return -1;
    const y = (1 - hit.uv.y - top) / (1 - top);
    if (y < 0) return -1;
    const col = Math.min(cols - 1, Math.floor(hit.uv.x * cols)), row = Math.min(rows - 1, Math.floor(y * rows));
    const i = row * cols + col;
    return i < count ? i : -1;
  }
  const menuCell = (h) => (panel === 'menu' ? panelCell(h, menu, COLS, ROWS, pageItems().length) : -1);
  const padCell = (h) => panelCell(h, pad, PAD_COLS, PAD_ROWS, PAD_KEYS.length, PAD_TOP);
  /** Show the menu or the keypad on the wrist (Y hides both). */
  function syncWrist() {
    const on = wristOn && !!menu.parent, p = padShown();
    if (!p && typed) { typed = ''; paintPad(); }
    if (pad.visible !== (on && p)) { pad.visible = on && p; if (pad.visible) paintPad(); }
    menu.visible = on && !p;
  }
  let menuHovered = false;

  let sweeping = null;
  function select(h) {
    if (sweeping === h || (tools.name === 'erase' && !teleportOn && tools.sweep)) return;   // selectend erases what was swept
    if (tools.name === 'markup' && !teleportOn && menuCell(h) < 0 && padCell(h) < 0 && !h.screen && panel === 'menu') return;   // the pen draws while held
    const k = padCell(h);
    if (k >= 0) { key(PAD_KEYS[k]); return; }
    const lc = layerCell(h);
    if (lc) { layerClick(lc); return; }
    const sc = swatchCell(h);
    if (sc >= 0) { swatchClick(sc); return; }
    const scn = sceneCell(h);
    if (scn !== null) { sceneClick(scn); return; }
    const cell = menuCell(h);
    if (cell >= 0) { run(pageItems()[cell].id); return; }
    if (mode === 'immersive-ar' && !placed) { place(); return; }
    pointer = h;
    h.c.updateMatrixWorld(true);
    if (teleportOn) { teleportTo(rayOf(h)); return; }
    const picking = tools.name === 'paint' && tools.picking;
    tools.trigger(rayOf(h));
    if (picking && !tools.picking) paintMenu();
    if (mode === 'immersive-ar') { hint.textContent = tools.tip || ITEMS.find((it) => it.id === tools.name)?.label || ''; syncOverlay(); }
  }

  let grab = null;
  function startGrab() {
    const on = hands.filter((h) => h.squeeze);
    if (!on.length) { grab = null; return; }
    const p = on.map((h) => h.c.getWorldPosition(new THREE.Vector3()));
    grab = { n: on.length, pos: st.pos.clone(), scale: st.scale, yaw: st.yaw, mid: p.length === 2 ? p[0].clone().add(p[1]).multiplyScalar(0.5) : p[0],
      span: p.length === 2 ? p[0].distanceTo(p[1]) : 0, ang: p.length === 2 ? flatAngle(p[0], p[1]) : 0 };
  }
  const flatAngle = (a, b) => Math.atan2(b.z - a.z, b.x - a.x);   // the direction from hand a to hand b, seen from above
  const UP = new THREE.Vector3(0, 1, 0);
  function dragFrame() {
    if (!grab) return;
    const on = hands.filter((h) => h.squeeze);
    if (on.length !== grab.n) { startGrab(); return; }
    const p = on.map((h) => h.c.getWorldPosition(new THREE.Vector3()));
    if (p.length === 2) {
      const mid = p[0].clone().add(p[1]).multiplyScalar(0.5);
      st.scale = THREE.MathUtils.clamp(grab.scale * p[0].distanceTo(p[1]) / Math.max(grab.span, 1e-3), 1 / 500, 4);
      const k = st.scale / grab.scale;
      // turning the hands round each other turns the model about the vertical (like turning a table model with both hands)
      let da = flatAngle(p[0], p[1]) - grab.ang;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      st.yaw = grab.yaw - da;
      // scale and turn about the starting midpoint, then follow the hands
      st.pos.copy(grab.pos).sub(grab.mid).applyAxisAngle(UP, -da).multiplyScalar(k).add(mid);
    } else st.pos.copy(grab.pos).add(p[0].clone().sub(grab.mid));
    compose();
  }

  /** Sticks and the A/B/X/Y buttons (xr-standard: 4 = A or X, 5 = B or Y). */
  function sticks(dt) {
    const head = renderer.xr.getCamera();
    for (const h of hands) {
      const gp = h.gamepad;
      if (!gp || h.screen) continue;
      const x = gp.axes[2] ?? gp.axes[0] ?? 0, y = gp.axes[3] ?? gp.axes[1] ?? 0;
      if (h.handed === 'left' && Math.hypot(x, y) > 0.15) {
        const fwd = new THREE.Vector3(); head.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
        const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
        // walking moves the world the other way
        st.pos.addScaledVector(fwd, y * WALK * dt).addScaledVector(right, -x * WALK * dt);
        compose();
      }
      if (h.handed === 'right') {
        if (Math.abs(x) > 0.7 && !h.turned) {
          h.turned = true;
          const a = -Math.sign(x) * TURN, pivot = head.getWorldPosition(new THREE.Vector3()); pivot.y = 0;
          st.pos.sub(pivot).applyAxisAngle(new THREE.Vector3(0, 1, 0), a).add(pivot);
          st.yaw += a; compose();
        } else if (Math.abs(x) < 0.3) h.turned = false;
      }
      const down = (k) => { const now = !!gp.buttons[k]?.pressed, was = h.prev[k]; h.prev[k] = now; return now && !was; };
      const left = h.handed === 'left';
      if (down(4)) { if (left) tools.redo(); else tools.undo(); }
      if (down(5)) { if (left) { wristOn = !wristOn; syncWrist(); } else tools.cancel(); }
    }
  }

  /** Teleport: the point the ray picks (a floor, a stair, the ground) goes under your feet; the model does not turn. */
  function teleportTo(ray) {
    const p = tools.pick(ray, {});
    if (!p) return;
    const at = new THREE.Vector3(p.p[0], p.p[1], p.p[2]).applyMatrix4(world.matrix);
    const head = renderer.xr.getCamera().getWorldPosition(new THREE.Vector3());
    st.pos.x += head.x - at.x; st.pos.z += head.z - at.z; st.pos.y -= at.y;
    compose();
  }

  function place() {
    if (mode !== 'immersive-ar' || !reticle.visible) return;
    st.pos.setFromMatrixPosition(reticle.matrix);
    compose();
    placed = true;
    hint.textContent = t('xr.ar_tools', 'Pick a tool below, then tap to use it');
  }

  let last = 0;
  // ---- Scan room (AR): the walls, floor and furniture the headset knows from Space Setup, as groups in the model ----
  let scanAsked = null;   // {mesh, replace, at}: scan on the first frame after `at`
  async function scanRoom(xrFrame, { mesh = false, replace = false } = {}) {
    const ref = renderer.xr.getReferenceSpace();
    if (!('detectedPlanes' in xrFrame) && !('detectedMeshes' in xrFrame)) { say(t('xr.scan_none', 'This headset or browser does not share the room (plane detection)')); return; }
    // real sizes: the model goes to 1:1 where it stands
    if (st.scale !== 1) { st.scale = 1; st.table = false; compose(); paintMenu(); }
    const inv = worldInv.clone();
    const items = roomItems(xrFrame, ref, ([x, y, z]) => { const v = new THREE.Vector3(x, y, z).applyMatrix4(inv); return [v.x, v.y, v.z]; }, { mesh });
    if (!items.length) {
      if (session?.initiateRoomCapture) {
        say(t('xr.scan_setup', 'No room yet: set it up (Space Setup), then press Scan room again'));
        try { await session.initiateRoomCapture(); } catch { /* the user may say no */ }
      } else say(t('xr.scan_empty', 'The headset gave no walls or furniture yet: look around the room, then try again'));
      return;
    }
    const r = buildScan(model, host.path || [], items, { replace, room: t('xr.scan_layer_room', 'Scanned room'), furniture: t('xr.scan_layer_furniture', 'Scanned furniture'), thai: /^th/.test(document.documentElement.lang) });
    host.changed();
    say(t('xr.scan_done', 'Scanned: {planes} walls and floors, {boxes} pieces of furniture').replace('{planes}', r.planes).replace('{boxes}', r.boxes)
      + (r.tris ? t('xr.scan_done_mesh', ', room surface {tris} triangles').replace('{tris}', r.tris) : ''));
  }
  // Live scan: the headset scans the room again now (you walk round and look at every surface), then the fresh
  // walls, furniture and the room's whole surface (its mesh) replace the last scan in the model.
  let liveBusy = false;
  async function liveScan() {
    if (liveBusy) return;
    if (!session?.initiateRoomCapture) { say(t('xr.scan_live_none', 'This headset or browser cannot start a room scan (room capture)')); return; }
    liveBusy = true;
    say(t('xr.scan_live_go', 'Scanning: walk round and look at the walls, floor and furniture'));
    try {
      await session.initiateRoomCapture();
      say(t('xr.scan_live_wait', 'Scan finished: building the model…'));
      scanAsked = { mesh: true, replace: true, at: performance.now() + 1200 };   // the frames need a moment to carry the new room
    } catch {
      say(t('xr.scan_live_once', 'Quest allows one live scan per AR visit: exit, enter AR again, then Live scan'));
    } finally { liveBusy = false; }
  }

  // a short message above the wrist menu (the headset has no status bar), gone after a few seconds
  const noteTex = canvasTex(1200, 120);
  const note = new THREE.Mesh(new THREE.PlaneGeometry(MENU_W, MENU_W * 0.1), new THREE.MeshBasicMaterial({ map: noteTex.tex, transparent: true, side: THREE.DoubleSide, depthTest: false }));
  note.renderOrder = 1002; note.position.set(0, MENU_H / 2 + 0.018, 0); note.visible = false;
  menu.add(note);
  let noteTimer = 0;
  function say(text) {
    const { g, c, tex } = noteTex;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(15, 118, 110, 0.95)'; roundRect(g, 0, 0, c.width, c.height, 28); g.fill();
    g.fillStyle = '#f8fafc'; g.font = '600 46px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, c.width / 2, c.height / 2, c.width - 40);
    tex.needsUpdate = true;
    note.visible = true; clearTimeout(noteTimer); noteTimer = setTimeout(() => { note.visible = false; }, 5000);
    if (mode === 'immersive-ar') hint.textContent = text;   // the phone's screen
  }

  function frame(time, xrFrame) {
    if (scanAsked && xrFrame && !(scanAsked.at > performance.now())) { const o = scanAsked; scanAsked = null; scanRoom(xrFrame, o); }
    const dt = last ? Math.min(0.1, (time - last) / 1000) : 0; last = time;
    if (xrFrame && hitSource) {
      const hit = xrFrame.getHitTestResults(hitSource)[0];
      const pose = hit && hit.getPose(renderer.xr.getReferenceSpace());
      reticle.visible = !!pose && !placed;
      if (pose) reticle.matrix.fromArray(pose.transform.matrix);
    }
    handsFrame(); sticks(dt); dragFrame();
    if (sweeping) { sweeping.c.updateMatrixWorld(true); if (tools.name === 'markup') tools.markAdd(penTip(sweeping)); else tools.eraseAdd(rayOf(sweeping)); }
    // menu or keypad hover from the hand that is not wearing it
    syncWrist();
    const other = hands.find((h) => live(h) && menu.parent !== h.grip);
    const cell = other ? menuCell(other) : -1, kc = other ? padCell(other) : -1;
    const lh = other ? layerCell(other) : null, sh = other ? swatchCell(other) : -1, ch = other ? sceneCell(other) : null;
    menuHovered = cell >= 0 || kc >= 0 || !!lh || sh >= 0 || ch !== null;
    if (ch !== sceneHover) { sceneHover = ch; if (panel === 'scenes') paintMenu(); }
    if (sh !== swHover) { swHover = sh; if (panel === 'paint') paintMenu(); }
    if (JSON.stringify(lh) !== JSON.stringify(layerHover)) { layerHover = lh; if (panel === 'layers') paintMenu(); }
    if (cell !== menuHover) { menuHover = cell; paintMenu(); }
    if (kc !== padHover) { padHover = kc; paintPad(); }
    // the tools follow the pointing hand (a phone's tap has no ray between taps)
    if (live(pointer) && !pointer.fist && !menuHovered) {
      if (teleportOn) { const p = tools.pick(rayOf(pointer), {}); tools.snap = p ? { p: p.p, kind: 'ground' } : null; }
      else tools.hover(rayOf(pointer));
    }
    else if (pointer.screen) tools.snap = tools.op ? tools.snap : null;
    drawFx();
    view.prepare();
    const cut = model.activeCut?.();
    if (cut && view.clip?.length) view.clip[0].set(new THREE.Vector3(-cut.n[0], -cut.n[1], -cut.n[2]), cut.n[0] * cut.p[0] + cut.n[1] * cut.p[1] + cut.n[2] * cut.p[2]).applyMatrix4(world.matrix);
    renderer.render(scene, eye);
    if (photoAsked) { photoAsked = false; takePhoto(); }
  }

  // ---- Photo: what you see (from your head, 4:3), kept until you leave and then offered as files ----
  let photoAsked = false;
  const photos = [];
  const photoBtn = el('button', { type: 'button', className: 'mz-xr-btn', hidden: true, onClick: () => savePhotos() }, '');
  bar.append(photoBtn);
  function takePhoto() {
    const W = 1600, H = 1200;
    const head = renderer.xr.getCamera(), cam = new THREE.PerspectiveCamera(70, W / H, 0.02, 5000);
    head.getWorldPosition(cam.position); head.getWorldQuaternion(cam.quaternion); cam.updateMatrixWorld(true);
    const rt = new THREE.WebGLRenderTarget(W, H, { samples: 4 });
    const was = { xr: renderer.xr.enabled, target: renderer.getRenderTarget(), bg: scene.background, fx: fx.visible, hands: hands.map((h) => [h.c.visible, h.grip.visible, h.hand.visible, h.dots.visible]) };
    renderer.xr.enabled = false;
    fx.visible = false;
    for (const h of hands) { h.c.visible = false; h.grip.visible = false; h.hand.visible = false; h.dots.visible = false; }
    if (!scene.background) scene.background = new THREE.Color(0xe8eef3);   // AR: the room is not in the picture
    try {
      renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam);
      const buf = new Uint8Array(W * H * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d'), img = g.createImageData(W, H);
      for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);   // GL rows run bottom up
      g.putImageData(img, 0, 0);
      cv.toBlob((b) => { if (b) { photos.push(b); say(t('xr.photo_taken', 'Photo {n} taken: saved when you leave').replace('{n}', photos.length)); } }, 'image/png');
    } catch (e) { console.warn('photo', e); say(t('xr.photo_failed', 'The photo did not work')); }
    finally {
      renderer.setRenderTarget(was.target);
      renderer.xr.enabled = was.xr;
      scene.background = was.bg; fx.visible = was.fx;
      hands.forEach((h, i) => { [h.c.visible, h.grip.visible, h.hand.visible, h.dots.visible] = was.hands[i]; });
      rt.dispose();
    }
  }
  function syncPhotoBtn() {
    photoBtn.hidden = !photos.length;
    photoBtn.textContent = t('xr.photos_save', 'Save photos ({n})').replace('{n}', photos.length);
    if (photos.length) bar.hidden = false;
  }
  function savePhotos() {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    photos.forEach((b, i) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = 'monzdraw-xr-' + stamp + '-' + (i + 1) + '.png';
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
    photos.length = 0; syncPhotoBtn();
  }

  async function enter(m) {
    if (session || !navigator.xr) return;
    const ar = m === 'immersive-ar';
    const init = { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', ...(ar ? ['hit-test', 'dom-overlay', 'plane-detection', 'mesh-detection'] : [])] };
    if (ar) init.domOverlay = { root: overlay };
    // the real room in front of the model hides it (Quest 3): three.js fills the depth buffer from the headset's depth
    if (ar && occludeOn) {
      init.optionalFeatures.push('depth-sensing');
      init.depthSensing = { usagePreference: ['gpu-optimized'], dataFormatPreference: ['luminance-alpha', 'float32'] };
    }
    try { session = await navigator.xr.requestSession(m, init); } catch (e0) {
      // a browser that does not know depth sensing may refuse the whole request: once more without it
      if (init.depthSensing) {
        delete init.depthSensing; init.optionalFeatures = init.optionalFeatures.filter((f) => f !== 'depth-sensing');
        try { session = await navigator.xr.requestSession(m, init); } catch (e) { console.warn('WebXR', e); alert(t('xr.failed', 'This device could not start XR: ') + (e.message || e)); return; }
      } else { console.warn('WebXR', e0); alert(t('xr.failed', 'This device could not start XR: ') + (e0.message || e0)); return; }
    }
    mode = m;
    saved = { children: [...scene.children], background: scene.background, draw: view.draw };
    for (const o of saved.children) world.add(o);
    world.add(ground); ground.visible = gridOn;
    scene.add(world, reticle, fx, ...hands.flatMap((h) => [h.c, h.grip, h.hand, h.dots]));
    if (ar) scene.background = null;
    view.extras.visible = false;   // the axes run to the horizon; at 1:1 they cut through the room
    bar.hidden = true;
    view.draw = () => {};   // the desktop redraw would fight the headset for the canvas
    renderer.xr.enabled = true;
    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(session);
    overlay.hidden = !ar;
    placed = !ar;
    hint.textContent = t('xr.ar_hint', 'Point at the floor, then tap to place the model');
    view.prepare();
    layout(ar);   // AR starts as a table model to place; VR starts at 1:1
    if (ar && session.requestHitTestSource) {
      try { hitSource = await session.requestHitTestSource({ space: await session.requestReferenceSpace('viewer') }); } catch { hitSource = null; }
    }
    if (ar && !hitSource) placed = true;   // nothing to aim with: keep the model where it is
    last = 0;
    renderer.setAnimationLoop(frame);
    session.addEventListener('end', ended, { once: true });
  }

  function ended() {
    renderer.setAnimationLoop(null);
    tools.cancel();
    hitSource?.cancel?.(); hitSource = null;
    scene.remove(world, reticle, fx, ...hands.flatMap((h) => [h.c, h.grip, h.hand, h.dots]));
    for (const o of saved.children) scene.add(o);
    scene.background = saved.background;
    view.extras.visible = true;
    bar.hidden = vrBtn.hidden && arBtn.hidden;
    view.draw = saved.draw;
    renderer.xr.enabled = false;
    session = null; mode = null; grab = null;
    overlay.hidden = true; reticle.visible = false;
    view.builtFor = null;   // the section cut back in model space
    syncPhotoBtn();
    view.resize();
    host.changed();
  }
  function end() { session?.end(); }

  return { enter, end, session: () => session, state: st, tools, run, key, teleportTo, menuCanvas: () => menuTex.c, paintMenu, typed: () => typed, padVisible: () => pad.visible,
    hands: () => hands.map((h) => ({ handed: h.handed, isHand: h.isHand, curl: h.curl, fist: h.fist })) };
}
