# What KHADRAW changed in BimCraft

KHADRAW BIM (BIM, construction drawings, scans and furniture to CNC) is a modified version of BimCraft by The Data Design Group, Inc., under the
Apache License 2.0 (section 4(b): modified files carry a notice that they were changed). It starts from upstream
commit `ff1b280` ("macOS: Studio 0.6 disk image is out"). Changed files say what changed in comments marked
"KHADRAW"; the design notes are in the KHADRAW project folder (docs/).

The main changes:

- **Name and look:** KHADRAW's own name in the app bar, page title, `devshell/app.json`, the language files and the
  help (TRADEMARKS.md); KHADRAW's icon instead of the CadCraft logo; the Graphite theme (`devshell/site/assets/css/khadraw.css`)
  and layout (`devshell/site/assets/js/khadraw-layout.js`): mode tabs, command search, a tool rail.
- **Thai:** the language files in Thai, and Thai text in PDF and DWG/DXF output.
- **Free-form elements** modelled with the ModelCraft kernel, construction drawings (notes, dimensions, sections,
  elevations, drafting views, sheets, title block, revisions, DWG/DXF), AR/VR viewing and room scans, scan against
  design deviation with BCF issues, built-in furniture to cut list, nesting, DXF and G-code.
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
| changed | `app/addons/bimcraft-api.js` |
| changed | `app/agents.js` |
| changed | `app/bcf.js` |
| changed | `app/bim-agent.js` |
| changed | `app/bimcraft.js` |
| changed | `app/cloud-ui.js` |
| added | `app/cnc.js` |
| added | `app/detailviews.js` |
| added | `app/deviation-ui.js` |
| added | `app/deviation.js` |
| changed | `app/drafting.js` |
| added | `app/dwg/container-write.js` |
| added | `app/dwg/lz-r2004-write.js` |
| added | `app/dwg/mleader-write.js` |
| added | `app/dwg/nongraphic-write.js` |
| added | `app/dwg/r2007-write.js` |
| added | `app/dwg/solid-write.js` |
| added | `app/dwg/surface-write.js` |
| added | `app/dwg/table-write.js` |
| added | `app/dwg/write.js` |
| added | `app/fonts/.gitignore` |
| added | `app/fonts/OFL.txt` |
| added | `app/fonts/Sarabun-Bold.ttf` |
| added | `app/fonts/Sarabun-Regular.ttf` |
| added | `app/fonts/fonts.json` |
| added | `app/freeform-model.js` |
| added | `app/freeform-ui.js` |
| added | `app/furniture-ui.js` |
| added | `app/furniture.js` |
| changed | `app/glb-bim.js` |
| changed | `app/help/assets-and-maintenance.md` |
| changed | `app/help/assistants.md` |
| changed | `app/help/check-folder-health.md` |
| changed | `app/help/coming-from.md` |
| changed | `app/help/coordinates.md` |
| changed | `app/help/copy-paste.md` |
| changed | `app/help/daylight-factor.md` |
| changed | `app/help/draw-walls.md` |
| changed | `app/help/dwg-in-3d.md` |
| changed | `app/help/dwg-layers-sheets.md` |
| changed | `app/help/dwg-linked-files.md` |
| changed | `app/help/edit-ifc-properties.md` |
| changed | `app/help/equipment-schedule.md` |
| changed | `app/help/families.md` |
| changed | `app/help/file-formats.md` |
| changed | `app/help/files.md` |
| changed | `app/help/folder-roles.md` |
| changed | `app/help/foundations.md` |
| changed | `app/help/framing.md` |
| changed | `app/help/getting-started.md` |
| changed | `app/help/help.js` |
| changed | `app/help/inspect-element.md` |
| changed | `app/help/issues-bcf.md` |
| changed | `app/help/keyboard.md` |
| changed | `app/help/library-credits.md` |
| changed | `app/help/linked-models.md` |
| changed | `app/help/measure.md` |
| changed | `app/help/menus-keys-and-mouse.md` |
| changed | `app/help/model-for-rendering.md` |
| changed | `app/help/not-built-yet.md` |
| changed | `app/help/online-offline.md` |
| changed | `app/help/open-ifc-model.md` |
| changed | `app/help/open-in-another-app.md` |
| changed | `app/help/open-project-bundle.md` |
| changed | `app/help/open-project-folder.md` |
| changed | `app/help/paint-materials.md` |
| changed | `app/help/pipes-and-ducts.md` |
| changed | `app/help/place-from-library.md` |
| changed | `app/help/plan-schedules-and-pdf.md` |
| changed | `app/help/platforms.md` |
| changed | `app/help/pln-project-files.md` |
| changed | `app/help/point-cloud-formats.md` |
| changed | `app/help/point-clouds.md` |
| changed | `app/help/print-view.md` |
| changed | `app/help/properties-panel.md` |
| changed | `app/help/read-rvt-file.md` |
| changed | `app/help/roofs.md` |
| changed | `app/help/rvt-to-ifc.md` |
| changed | `app/help/section-plane.md` |
| changed | `app/help/settings.md` |
| changed | `app/help/several-models.md` |
| changed | `app/help/site-building-and-levels.md` |
| changed | `app/help/start-a-new-building.md` |
| changed | `app/help/storeys-and-spaces.md` |
| changed | `app/help/takeoff.md` |
| changed | `app/help/terrain.md` |
| changed | `app/help/touch-screens.md` |
| changed | `app/help/trim-extend-walls.md` |
| changed | `app/help/troubleshooting.md` |
| changed | `app/help/two-bim-programs.md` |
| changed | `app/help/type-vs-instance.md` |
| changed | `app/help/view-dwg.md` |
| changed | `app/help/walls-from-a-drawing.md` |
| changed | `app/help/whats-new.md` |
| changed | `app/help/work-live.md` |
| changed | `app/help/workspace.md` |
| changed | `app/lang/en.json` |
| changed | `app/lang/es-MX.json` |
| changed | `app/lang/id.json` |
| added | `app/lang/th.json` |
| added | `app/mc/bvh.js` |
| added | `app/mc/camera.js` |
| added | `app/mc/collide.js` |
| added | `app/mc/earcut.js` |
| added | `app/mc/infer.js` |
| added | `app/mc/model.js` |
| added | `app/mc/tools.js` |
| added | `app/mc/units.js` |
| added | `app/mc/vec.js` |
| changed | `app/model-pdf.js` |
| changed | `app/model-planview.js` |
| changed | `app/model-write.js` |
| changed | `app/new-model.js` |
| added | `app/notes-ui.js` |
| added | `app/notes.js` |
| added | `app/pdf-font.js` |
| added | `app/pens.js` |
| changed | `app/prop-map.js` |
| added | `app/render/ai-enhance.js` |
| added | `app/render/render-passes.js` |
| changed | `app/render/render-ui.js` |
| changed | `app/res-sheets.js` |
| changed | `app/res-terrain.js` |
| changed | `app/res-ui.js` |
| added | `app/scan-cloud.js` |
| added | `app/sectionview-ui.js` |
| added | `app/sheet-cad.js` |
| added | `app/sheetset-ui.js` |
| added | `app/sheetset.js` |
| added | `app/view-extra.js` |
| changed | `app/views-model.js` |
| changed | `app/views-ui.js` |
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
| removed | `linux/flathub/com.getcadcraft.bimcraft-128.png` |
| removed | `linux/flathub/com.getcadcraft.bimcraft-256.png` |
| removed | `linux/flathub/com.getcadcraft.bimcraft-512.png` |
| removed | `linux/flathub/com.getcadcraft.bimcraft-64.png` |
| removed | `linux/flathub/com.getcadcraft.bimcraft.desktop` |
| removed | `linux/flathub/com.getcadcraft.bimcraft.metainfo.xml` |
| removed | `linux/flathub/com.getcadcraft.bimcraft.svg` |
| removed | `linux/flathub/com.getcadcraft.bimcraft.yml` |
| added | `linux/flathub/io.github.monkha46.khadraw.bim-128.png` |
| added | `linux/flathub/io.github.monkha46.khadraw.bim-256.png` |
| added | `linux/flathub/io.github.monkha46.khadraw.bim-512.png` |
| added | `linux/flathub/io.github.monkha46.khadraw.bim-64.png` |
| added | `linux/flathub/io.github.monkha46.khadraw.bim.desktop` |
| added | `linux/flathub/io.github.monkha46.khadraw.bim.metainfo.xml` |
| R095 | `linux/flathub/io.github.monkha46.khadraw.bim.mime.xml` |
| added | `linux/flathub/io.github.monkha46.khadraw.bim.svg` |
| added | `linux/flathub/io.github.monkha46.khadraw.bim.yml` |
| changed | `linux/flathub/shell.json` |
| changed | `macos/README.md` |
| changed | `package.json` |
| added | `tests/freeform-test.mjs` |
| added | `tests/furniture-test.mjs` |
| added | `tests/notes-test.mjs` |
| added | `tests/pdf-font-test.mjs` |
| added | `tests/scan-test.mjs` |
| added | `tests/sheetcad-test.mjs` |
| added | `tests/sheetset-test.mjs` |
| added | `tests/views2d-test.mjs` |
| changed | `windows/README.md` |
