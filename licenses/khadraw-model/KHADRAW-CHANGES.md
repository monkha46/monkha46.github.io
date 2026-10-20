# What KHADRAW changed in ModelCraft

KHADRAW Model (3D modelling for design) is a modified version of ModelCraft by The Data Design Group, Inc., under the
Apache License 2.0 (section 4(b): modified files carry a notice that they were changed). It starts from upstream
commit `b077b70` ("macOS: Studio 0.6 disk image is out"). Changed files say what changed in comments marked
"KHADRAW"; the design notes are in the KHADRAW project folder (docs/).

The main changes:

- **Name and look:** KHADRAW's own name in the app bar, page title, `devshell/app.json`, the language files and the
  help (TRADEMARKS.md); KHADRAW's icon instead of the CadCraft logo; the Graphite theme (`devshell/site/assets/css/khadraw.css`)
  and layout (`devshell/site/assets/js/khadraw-layout.js`): mode tabs, command search, a tool rail.
- **Thai:** the language files in Thai, and Thai text in PDF and DWG/DXF output.
- **VR/AR** (from MonzDraw, the KHADRAW authors' own ModelCraft 0.5 fork), the editor embedded in KHADRAW BIM,
  locked reference context.
- **Render:** depth and line passes, and photoreal pictures made by MONZ Studio on the same computer.

## Files

| | File |
|---|---|
| changed | `.gitignore` |
| added | `KHADRAW-CHANGES.md` |
| changed | `NOTICE` |
| changed | `README.md` |
| changed | `THIRD_PARTY.md` |
| changed | `android/README.md` |
| changed | `app/agents.js` |
| changed | `app/bcf.js` |
| changed | `app/help/animation.md` |
| changed | `app/help/axes.md` |
| changed | `app/help/coming-from.md` |
| changed | `app/help/dimensions.md` |
| changed | `app/help/draw-faces.md` |
| changed | `app/help/export-model.md` |
| changed | `app/help/files.md` |
| changed | `app/help/follow-me.md` |
| changed | `app/help/formats.md` |
| changed | `app/help/getting-started.md` |
| changed | `app/help/groups-components.md` |
| changed | `app/help/guides-measure.md` |
| changed | `app/help/help.js` |
| changed | `app/help/hide-isolate.md` |
| changed | `app/help/import-sketchup-files.md` |
| changed | `app/help/inference.md` |
| changed | `app/help/intersect.md` |
| changed | `app/help/keyboard.md` |
| changed | `app/help/menus-keys-and-mouse.md` |
| changed | `app/help/move-copy.md` |
| changed | `app/help/not-built-yet.md` |
| changed | `app/help/openings.md` |
| changed | `app/help/orbit-pan-zoom.md` |
| changed | `app/help/paint.md` |
| changed | `app/help/print-3d.md` |
| changed | `app/help/push-pull.md` |
| changed | `app/help/scenes.md` |
| changed | `app/help/sections.md` |
| changed | `app/help/select.md` |
| changed | `app/help/settings.md` |
| changed | `app/help/site-plan.md` |
| changed | `app/help/soften.md` |
| changed | `app/help/starter.md` |
| changed | `app/help/stretch.md` |
| changed | `app/help/styles-shadows.md` |
| changed | `app/help/tags.md` |
| changed | `app/help/terrain.md` |
| changed | `app/help/text3d.md` |
| changed | `app/help/tools.md` |
| changed | `app/help/troubleshooting.md` |
| changed | `app/help/use-with-ai-assistants.md` |
| changed | `app/help/value-box.md` |
| changed | `app/help/view-cube.md` |
| changed | `app/help/vr-review.md` |
| changed | `app/help/whats-new.md` |
| changed | `app/help/work-live.md` |
| changed | `app/help/workspace.md` |
| changed | `app/infer.js` |
| changed | `app/io.js` |
| changed | `app/lang/en.json` |
| changed | `app/lang/es-MX.json` |
| changed | `app/lang/id.json` |
| added | `app/lang/th.json` |
| changed | `app/model.js` |
| changed | `app/modelcraft.css` |
| changed | `app/modelcraft.js` |
| added | `app/render/ai-enhance.js` |
| added | `app/render/render-passes.js` |
| changed | `app/render/render-ui.js` |
| changed | `app/view3d.js` |
| added | `app/xr-icons.js` |
| changed | `app/xr-mc.js` |
| added | `app/xr-scan.js` |
| added | `app/xr-tools.js` |
| added | `app/xr.js` |
| changed | `devshell/app.json` |
| added | `devshell/build-locale.mjs` |
| changed | `devshell/index.html` |
| added | `devshell/index.th.html` |
| changed | `devshell/render.php` |
| changed | `devshell/serve.mjs` |
| added | `devshell/site/assets/css/khadraw.css` |
| added | `devshell/site/assets/fonts/sarabun/OFL.txt` |
| added | `devshell/site/assets/fonts/sarabun/Sarabun-Bold.ttf` |
| added | `devshell/site/assets/fonts/sarabun/Sarabun-Regular.ttf` |
| added | `devshell/site/assets/js/khadraw-layout.js` |
| added | `devshell/site/assets/lang/shell/th.json` |
| changed | `devshell/site/favicon-32.png` |
| changed | `devshell/site/favicon.ico` |
| changed | `devshell/site/favicon.svg` |
| changed | `ios/README.md` |
| changed | `linux/README.md` |
| removed | `linux/flathub/com.getcadcraft.modelcraft-128.png` |
| removed | `linux/flathub/com.getcadcraft.modelcraft-256.png` |
| removed | `linux/flathub/com.getcadcraft.modelcraft-512.png` |
| removed | `linux/flathub/com.getcadcraft.modelcraft-64.png` |
| removed | `linux/flathub/com.getcadcraft.modelcraft.desktop` |
| removed | `linux/flathub/com.getcadcraft.modelcraft.metainfo.xml` |
| removed | `linux/flathub/com.getcadcraft.modelcraft.svg` |
| removed | `linux/flathub/com.getcadcraft.modelcraft.yml` |
| added | `linux/flathub/io.github.monkha46.khadraw.model-128.png` |
| added | `linux/flathub/io.github.monkha46.khadraw.model-256.png` |
| added | `linux/flathub/io.github.monkha46.khadraw.model-512.png` |
| added | `linux/flathub/io.github.monkha46.khadraw.model-64.png` |
| added | `linux/flathub/io.github.monkha46.khadraw.model.desktop` |
| added | `linux/flathub/io.github.monkha46.khadraw.model.metainfo.xml` |
| R093 | `linux/flathub/io.github.monkha46.khadraw.model.mime.xml` |
| added | `linux/flathub/io.github.monkha46.khadraw.model.svg` |
| added | `linux/flathub/io.github.monkha46.khadraw.model.yml` |
| changed | `linux/flathub/shell.json` |
| changed | `macos/README.md` |
| changed | `package.json` |
| added | `tests/bin/test-xr-tools.mjs` |
| changed | `windows/README.md` |
