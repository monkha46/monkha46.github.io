---
title: Open .pln and .pla project files
summary: What KHADRAW does with .pln, .pla, .tpl and .bpn files today, and how to export IFC and DWG from them so the model and drawings open here.
section: tasks
order: 72
keywords: pln, pla, tpl, bpn, project file, archive, template, backup, ifc export, dwg export, translator, zones, layouts
---

## What you'll do

Get a project saved as `.pln` (project), `.pla` (archive with its library), `.tpl` (template) or `.bpn` (backup) into KHADRAW. These are Archicad's own files.

## What opens today

- **The project files themselves do not open yet.** Their format is not published, and KHADRAW does not read it yet. When you open one, KHADRAW says so and points here.
- **KHADRAW checks the file's first bytes.** Archicad projects from version 17 on start with the same short signature, so KHADRAW can tell you for certain that a file is an Archicad project. A file with an Archicad name that does not start that way has probably been renamed, is damaged, or comes from an older version. The signature does not tell a project, an archive and a template apart.
- **An IFC export opens fully**: the model in 3D, storeys, zones as spaces, element data, property sets and classifications, with every KHADRAW tool.
- **A DWG export opens** in the 2D view, with its layers and layouts, and in {{ui:3D}}. To edit it, use {{ui:Edit in CadCraft}}.

Or bring the whole project as one zip, with its views, layouts and property groups: see [Open a project bundle](topic:open-project-bundle).

## Export IFC (the model)

1. Open the project in Archicad.
2. Choose **File > Save As**, and pick **IFC** as the file type.
3. Pick an IFC translator (Archicad's name for a set of IFC export settings). One for **IFC4 Reference View** or **IFC2X3 Coordination View 2.0** suits KHADRAW. IFC4X3 opens too.
4. Choose what to export: the entire project, or only the elements visible on the stories you are looking at.
5. Save, then click {{ui:Choose a file}} in KHADRAW and choose the `.ifc` file.

Check these in the translator's settings before you export:

- **Zones**: export them, so rooms arrive as spaces. Click {{ui:Spaces}} in KHADRAW to see them.
- **Properties and classifications**: export them, so they show in {{ui:Properties}} and can be used in {{ui:Find}}, {{ui:Color}} and {{ui:Quantity totals}}.
- **Plain `.ifc`**, not `.ifczip` or `.ifcxml`. KHADRAW opens plain `.ifc` only.

## Export DWG (the drawings)

1. Open the plan, section or layout you want.
2. Choose **File > Save As**, and pick **DWG** as the file type.
3. Pick a DXF-DWG translator, and save.
4. For a whole set of sheets, save the layouts from the Layout Book, or publish them as DWG.
5. Open the `.dwg` in KHADRAW. Drawings linked by the export open with it when they are in the same folder; see [Linked drawings and pictures](topic:dwg-linked-files).

## Troubleshooting

- **"… is an Archicad project: its first bytes say so."** Export IFC or DWG as above, and open that file.
- **"… is named like an Archicad file but does not start like one."** Check where the file came from: it may be another kind of file with a new name (try opening it under its real extension), a copy that did not finish, or a project from a version before 17. Open it in Archicad if you can, then export IFC or DWG.
- **The model opens without rooms.** Zones were not exported. Turn them on in the IFC translator and export again.
- **Openings are not cut.** KHADRAW says so under **Not drawn yet** in the {{ui:File}} panel. Export again; if it stays, open the model in the program that made it and check the openings there.
- **Text on the DWG looks different.** The export may keep fonts KHADRAW does not have; KHADRAW draws text in a plain sans-serif font.

See also [Get a project file into 3D through IFC](topic:rvt-to-ifc) and [What KHADRAW reads from each format](topic:file-formats).
