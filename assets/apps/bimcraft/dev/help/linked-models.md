---
title: Link other models for coordination
summary: Show another IFC model beside yours by reference (never merged), place it by shared coordinates, map coordinates or two points, snap to it while drawing, and reload it when its file changes.
section: tasks
order: 34
keywords: link, linked model, reference, xref, coordination, federation, structure, MEP, consultant, shared coordinates, survey, map coordinates, reload, unload, document reference, IfcDocumentReference
---

## What you'll do

Draw against a consultant's model (the structure, the services, the existing building) without copying anything into your own file.

A **linked model** is shown in the 3D view and cut on your plans, but it is never changed and never saved into your model. Your model keeps only the link: the file's name and where it goes.

## Link a model

1. In the left panel's {{ui:Linked models}} section, click {{ui:Link a model…}} and choose the IFC file. It shows at once, and its row says **Shown**.
2. Choose where it goes in {{ui:Placement}}:
   - **Shared coordinates** (to start): its coordinates are yours, as when both models were set out from the same origin.
   - **Map coordinates**: both files' map coordinates line them up (both need a map conversion; KHADRAW says so when one has none).
   - **By two points…**: click a point on the linked model, then where it goes in yours; then a second pair. The link is moved and turned (about the vertical) to fit.
3. Each link and placement change is one step: {{key:Mod+Z}} takes it back.

## Work with it

- The plans show the linked model cut at the level's cut height as thin lines, and the {{ui:Wall}} tool and the other drawing tools snap to its corners and edges.
- Pick its elements in the 3D view to read their properties; a linked model is never the one you edit, so its radio button in {{ui:Models}} is off.
- **The file changed?** When the browser can watch the file (a file opened through its file picker, or in Studio), KHADRAW reloads the link by itself a few seconds after the file is saved again, and says so. Otherwise click {{ui:Reload}}.
- {{ui:Unload}} hides it and frees the memory; the link stays in your model. {{ui:Load…}} shows it again (you choose the file: a browser cannot open a file by its name on its own).
- The × removes the link from your model.

## What you should see

- In your IFC file: an IfcDocumentReference for each link (the file's name), related to the project, and where it goes in the project's property set CadCraft_Links. Opening your model again lists its links as **Not loaded** until you load them.

:::note
Clash checks, Compare and Find can use a loaded link like any other open model: see [See several IFC models together](topic:several-models).
:::
