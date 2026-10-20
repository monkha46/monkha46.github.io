---
title: Grids and columns
summary: Lay out grid lines with numbered and lettered bubbles, by spacing or one by one, draw walls and columns along them, and see them on plans, elevations and sections.
section: tasks
order: 31
keywords: grid, grids, grid line, column grid, axis, axes, bubble, gridline, structural grid, 1 2 3, A B C, column, columns, pillar, post, snap, IfcGrid, IfcColumn
---

## What you'll do

Set out a building on a grid, then draw walls and place columns along its lines.

## Place a whole grid

1. Turn on {{ui:Draw}}, then choose {{ui:Build}} › {{ui:Grid}}.
2. Click {{ui:Place a grid…}}. Say how many **numbered lines** (1, 2, 3…) and **lettered lines** (A, B, C…) you want and how far apart. Type one spacing, or several separated by commas for uneven bays (for example `20', 24', 20'`). {{ui:Past the last lines}} is how far each line runs beyond the outer lines of the other kind, and {{ui:Turned (degrees)}} turns the whole grid.
3. Click {{ui:Place it}}, then click where the first crossing (1 / A) goes. The preview follows the pointer.

Numbered lines run up the plan and are spaced across it; lettered lines run across the plan and are spaced up it. Letters skip I and O, as on drawings, so they are never read as 1 and 0.

## Draw grid lines one by one

With {{ui:Grid}} on, click where a line starts and where it ends. It gets the next label of the lines it runs along (after 3 comes 4; after B comes C). Press {{key:Esc}} to stop.

## Change a grid line

With {{ui:Grid}} on, click a line to pick it. Type a new {{ui:Label}} and press {{key:Enter}}, or click {{ui:Delete this line}} (or press {{key:Delete}}). {{ui:Bubbles}} puts the bubbles at both ends, at the start or end of each line, or nowhere. Each change is one step: {{key:Mod+Z}} takes it back.

## Draw along the grid

The {{ui:Wall}} tool, the {{ui:Column}} tool and the other drawing tools snap to grid lines and to where they cross (the snap mark is a small circle with a cross).

**Columns:** choose {{ui:Build}} › {{ui:Column}}, pick the shape (rectangular or round), the size, and whether the column runs **to the level above** or to a fixed height, then click. {{ui:At every grid crossing}} places a column at each crossing that has none yet. Click a column to change its shape, size or height in {{ui:Properties}}; {{key:Delete}} removes it. Columns that run to the level above follow it when its height changes.

## What you should see

- The grid on the plan of every level, with a bubble and its label at the ends of each line.
- Grid lines on the drawing set: on the plans, and on elevations and sections where a line is seen end on, with its bubble above the building. See [Elevations, sections and sheets](topic:sheets).
- In the IFC file: one grid for the building (IfcGrid, its numbered lines in one list and its lettered lines in the other), and columns as IfcColumn with their size, height and quantities. Other BIM programs show both.

:::note
A grid that came in a file from another program is shown, and the tools snap to it, but its lines cannot be changed here.
:::
