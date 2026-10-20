---
title: Floors of any shape, openings and ramps
summary: Draw a floor or slab by its outline (a balcony, a cantilever, a landing), cut openings in it, and draw ramps with their landings.
section: tasks
order: 30
keywords: floor, slab, outline, balcony, cantilever, landing, deck, floor opening, hole, shaft, void, ramp, slope, accessible ramp, wheelchair ramp, 1:12, IfcRamp, IfcSlab
---

## What you'll do

Make floors that do not follow rooms, such as a balcony beyond the walls, and draw ramps between levels.

## Draw a floor by its outline

1. Turn on {{ui:Draw}}, choose the level, then {{ui:Build}} › {{ui:Floor by outline}}.
2. In the row under the tools, choose the kind (concrete slab or wood floor), its use (floor or landing), its thickness and where its top is above the level (0 = level with the floor of the level; a negative value sets it lower).
3. Click the corners. The tool snaps to walls, grid lines and their crossings; hold {{key:Shift}} to keep an edge square. The length of each edge and the area show as you go. {{key:Backspace}} takes back the last corner.
4. Click the first corner again, double-click, or press {{key:Enter}} to finish.

## Cut an opening

Click the floor (in the 3D view, or its outline on the plan), then in {{ui:Properties}} click {{ui:Add an opening}} and click the corners of the opening inside the floor, finishing as above. The floor's {{ui:Properties}} list its openings, each with {{ui:Delete}}, and its area without them.

## Draw a ramp

1. Choose {{ui:Build}} › {{ui:Ramp}}. Set its width, and whether it goes **to the level above** or **up a rise** you type.
2. Choose how it is set: **by slope** (1:12 to start; the ramp is as long as the rise needs) or **by length** (your second click sets the length, and the slope follows).
3. Click the foot of the ramp (the middle of its bottom edge), then click the way up. The preview shows its length, its flights and its slope.

A rise of more than 30 inches (760 mm) is split into flights with a 5-foot (1525 mm) landing between them. These are common planning values, not your code: check the rules where you build. A ramp steeper than 1:12 is flagged in its {{ui:Properties}}.

## What you should see

- Each floor, opening and ramp is one step: {{key:Mod+Z}} takes it back.
- On the plan, a drawn floor's outline (an opening is drawn crossed), and a ramp's outline, flights, landings and an arrow up with its slope.
- Properties for a drawn floor (kind, use, thickness, top, area, openings) and for a ramp (width, top, rise, slope or length); {{key:Delete}} removes either.
- A ramp to the level above follows that level when its height changes.
- In the IFC file: a drawn floor is a slab (IfcSlab, a floor or a landing) with its openings cut out (IfcOpeningElement); a ramp is IfcRamp made of sloped flights (IfcRampFlight) and landing slabs, with its slope and width.

:::note
Floors drawn this way stay where you drew them. Floors made with {{ui:Floor}} follow the rooms when the walls move: see [Rooms, floors, ceilings and roofs](topic:floors-and-roofs).
:::
