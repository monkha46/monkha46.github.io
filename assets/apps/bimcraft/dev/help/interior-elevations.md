---
title: Interior elevations
summary: Make one sheet that shows the four walls of a room from inside, with dimensions and tags, and save it as a PDF.
section: tasks
order: 35
keywords: interior elevation, room, wall, cabinet, kitchen, elevation, sheet, PDF, dimension, tag, space, A-501
---

## What you'll do

Pick a room and get one sheet that shows its four walls as you would see them standing inside. It is made for kitchens, baths and any room where you need to see the cabinets, doors and windows on each wall.

## Make the sheet

1. Pick the room. In the plan with {{ui:Draw}} on, click inside the room. In the 3D view or the model tree, pick the space (an IfcSpace).
2. In **Properties**, click {{ui:Interior elevations…}}.
3. The dialog opens with the sheet.
4. Click {{ui:Download PDF}} to save it. The file is named "<file> — Interior elevations — <room>.pdf" and is a vector PDF.
5. Click {{ui:Close}} when you are done.

## What the sheet shows

The sheet has four views, two by two, at one scale: the largest standard scale that fits. They are **North wall**, **East wall**, **South wall** and **West wall**. A title block carries the sheet number A-501, the title "Interior elevations — " with the room number and name, the project and the date.

Each view is cut through the middle of the room and looks at the wall on that side. The side walls, and anything cut in them such as a window, show as grey cut poché round the view. The view stops just past the face of the wall, so nothing behind the wall shows.

Each view carries:

- the room's width under it, from inside face to inside face;
- the room's height beside it, from the floor to the level above;
- a square tag on each door and a hexagon tag on each window in that wall, with its mark (D1, W1 and so on);
- a circle tag with the item number on each library item placed in front of that wall: cabinets, fixtures and equipment.

:::note
The views are made from the model each time you open the dialog, so they always match it. Move a cabinet, then open the dialog again.
:::

## On your own sheets

Each wall of each room is also a view you can put on a sheet you make: in the project browser click {{ui:New sheet}}, then under **Interior elevations** add "101 Kitchen — North wall" and the others. It comes with the same dimensions and tags.

## Not built yet

Interior elevations in the generated drawing set (they come from the room's **Properties** or your own sheets), rooms that are not mostly rectangular (the view looks square at each side of the room's box), drafting, notes or your own dimensions on them, and choosing which walls to show. See [What is not built yet](topic:not-built-yet).
