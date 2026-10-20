---
title: Views, view ranges and your own sheets
summary: Find every plan, elevation, section, 3D view, schedule and sheet in the project browser, set how each plan is cut and what it shows, make callouts, draw lines and hatches in one view, keep settings in view templates, and arrange sheets of your own.
section: tasks
order: 34
keywords: callout, callout view, detail view, enlarged plan, drafting, detail lines, drafting lines, hatch, hatch region, filled region, fill pattern, reflected ceiling plan, rcp, ceiling plan, ceiling grid, light fixtures, project browser, views, view range, crop, crop region, crop view, view scale, underlay, show another level, halftone, cut plane, cut height, top, bottom, view depth, visibility, categories, hide in view, view template, templates, sheet, sheets, title block, viewport, scale, arrange sheets, layout, pdf, plan view settings, browser
---

## What you'll do

Work the way BIM projects are organized: every view in one list, each plan cut where you want it, the same settings for several plans through a template, and sheets you lay out yourself.

## The project browser

1. Turn on {{ui:Draw}}. The left panel has a {{ui:Project browser}} under the models.
2. It lists:
   - **Floor plans**: each level. Click one to see its plan. The slider button beside it sets its view range (below). A plan that follows a template shows the template's name.
   - **Ceiling plans**: each level's reflected ceiling plan (below).
   - **Callouts**: each callout with the view it is drawn on, and {{ui:New callout}}. **Missing** lists callouts whose view is gone.
   - **Elevations** and **Sections**: the four sides and every section line. Click one to open the drawing set they are drawn in.
   - **3D views**: the views you saved with {{ui:Views}}.
   - **Schedules**: click one to show it under the plan.
   - **Sheets**: the sheets you made, {{ui:New sheet}}, and {{ui:Drawing set…}} for the whole set made from the model.
   - **View templates**, with {{ui:New template}}, and **Links** (the linked models).

## Set a plan's view range

1. Click the slider button beside a level in **Floor plans**.
2. Set the heights, above that level:
   - **Cut at**: where the plan cuts through walls, doors and windows (1200 mm, about 4 ft, unless you change it).
   - **Top**: things above the cut and under the top are drawn dashed (a high cabinet, a beam). Leave it empty for the level's height.
   - **Bottom** and **Depth below the bottom**: things lower than the cut are drawn in thin lines down to the bottom, and that far under it.
3. Under **Shown in this plan**, clear what this plan leaves out: furniture, rooms, columns and so on.
4. To leave out single elements: pick them in the plan or the 3D view, open the dialog and click {{ui:Hide the selected here}}. {{ui:Show them all}} brings them back.
5. Click {{ui:Use these settings}}.

The plan is cut again at once, and the drawing set and your sheets follow it. A point cloud's slice follows the cut height too.

## Crop a plan, give it a scale, show another level under it

All three are in the same dialog (the slider button beside a level):

- **Scale**: the scale the plan prints at ({{ui:Print}} on the plan's bar) and comes onto a sheet at. **Fit** picks the largest standard scale that fits.
- **Crop region**: click {{ui:Draw on the plan…}}, then click one corner and the opposite corner on the plan ({{key:Esc}} stops). The plan outside the region is veiled on screen, and you can still work there; printed, on sheets and in the drawing set, the plan shows only what is inside. {{ui:Clear}} takes the crop away. {{ui:Fit}} fits the crop.
- **Underlay**: choose another level. Its walls, cut elements, doors and windows are drawn light under this plan, to line things up with the level below or above. You cannot pick them here, and they print light grey.

A view template carries the scale with the heights and categories. The crop region and the underlay always belong to the one plan.

## A level's ceiling plan

Every level has a reflected ceiling plan beside its floor plan: the plan seen from below, for laying out ceilings and what hangs from them.

1. Click the level under **Ceiling plans** in the browser, or choose {{ui:Ceiling plan}} beside the level on the plan's bar.
2. The walls are cut at 2300 mm (about 7'-6"). What lies above that cut and under the level's height is drawn: ceilings with their grid and a height tag (`CLG 2438`), lights, beams. Doors, windows and what lies below the cut are left out.
3. To make a ceiling, use {{ui:Ceiling}} as on the floor plan, then pick it and choose its **Pattern** in Properties. See [Rooms, floors, ceilings and roofs](topic:floors-and-roofs).
4. To hang a light from it, place the item from the library while the ceiling plan is shown: it goes in **At the ceiling**. See [Place equipment and furniture from the library](topic:place-from-library).
5. The slider button beside a ceiling plan sets its cut and top, scale, categories, crop region and underlay, as for a floor plan. Ceiling plans take no view template.

It is drawn the same way round as the floor plan (a reflected plan, not a mirror image). A ceiling lower than the cut is not drawn: lower the cut for that level's ceiling plan. Ceiling plans go on your own sheets like plans; the drawing set does not add them by itself.

## Make a callout

A callout shows part of a plan larger, at its own scale, as a view of its own: a kitchen, a stair, a wall corner.

1. Show the plan, ceiling plan or callout it belongs to.
2. Choose {{ui:Annotate}} › {{ui:Callout}} on the plan's bar (or {{ui:New callout}} in the browser), then click one corner of the area and the opposite corner. {{key:Esc}} stops.
3. The callout is made at 1:20 (1/2" = 1'-0" in feet and inches). Its rectangle and a round tag are drawn on the plan.
4. Click the tag with {{ui:Select}}, or the callout in the browser, to open it: the plan shows only that area, at the callout's scale. The bar says {{ui:Callout:}} and its name; {{ui:Up}} goes back to the view it is drawn on.
5. The slider button beside it (in the browser or on the bar) renames it, changes its scale, draws its rectangle again or deletes it.

A callout shows what its view shows: the same cut, the same categories, a ceiling plan's ceilings. A callout of a callout works the same way. Put a callout on a sheet like a plan; its tag then says where it is (`1 / A-501`: the first view on sheet A-501). {{ui:Print}} in a callout prints just that area at its scale.

Deleting a callout also deletes the callouts drawn inside it, and the lines and hatches drawn in them (you are asked first). If the level a callout is drawn on is deleted, the callout stays under **Missing** until you delete it, and the sheets it is on report it as missing.

## Draw lines and hatches in one view

Drafting is 2D work that belongs to one view only: notes in lines, a hatched area of concrete or earth, a filled region. It is never in the 3D view and never in another plan.

1. Show the floor plan, ceiling plan or callout to draw in.
2. Choose from {{ui:Annotate}} on the plan's bar:
   - {{ui:Line}}: click where it starts and where it ends. The next line starts where the last one ended; {{key:Enter}} starts afresh.
   - {{ui:Polyline}}: click its points; {{key:Enter}} or a double-click ends it, a click on its first point closes it.
   - {{ui:Rectangle}}: two opposite corners.
   - {{ui:Hatch region}}: choose the **Pattern** (Solid, Diagonal, Cross-hatch, Concrete, Insulation, Earth) and its scale on the bar, then click the corners; {{key:Enter}}, a double-click or a click on the first corner closes it. With {{ui:Fill a room}} ticked, one click in a room hatches its outline.
3. Points snap as walls do; {{key:Shift}} keeps a line square, and you can type a length as for walls. {{key:Backspace}} takes back the last point.

Pick a line or a hatch with {{ui:Select}} on the plan. Properties changes a hatch's pattern and scale and has {{ui:Move…}} (click the point to move from, then where it goes). {{key:Delete}} deletes it. Each line, hatch and change is one step.

Lines and hatches print with the plan, go onto your sheets with it and are in the drawing set. Clear **Annotations** in a view range to leave them out of that view.

## Keep the settings in a view template

1. Click {{ui:New template}} in the browser, or {{ui:Save as a template…}} in a plan's view range (that plan then uses it).
2. Give it a name, set the heights and categories, and click {{ui:Save the template}}.
3. In any plan's view range, choose the template. The plan takes its heights and categories; change the template to change every plan that uses it. Elements you hid one by one stay hidden in their own plan.
4. Click a template in the browser to change, rename or delete it. Deleting one leaves its plans with its settings as their own.

## Arrange a sheet of your own

1. Click {{ui:New sheet}}. Type its number and title and choose the paper.
2. Click {{ui:Add}} beside a plan, ceiling plan, callout, elevation, section or schedule. It lands in the middle of the sheet.
3. Drag it where it goes. With it chosen, pick a **Scale**, or leave it on the plan's own scale (when the plan has one), else the scale that fits a third of the sheet. {{ui:Take off the sheet}} removes it.
4. Click {{ui:Save the sheet}}. It is listed under **Sheets**; click it to change it later.
5. {{ui:Download as PDF}} saves that sheet as one page.

## What you should see

- Plans cut at your heights, with what is above the cut dashed and what you cleared left out.
- A cropped plan veiled outside its region on screen and cut to it on paper, at the scale you gave it.
- A ceiling plan with the ceilings' grids and height tags, and the lights at the ceiling.
- Callouts with their rectangle and tag on the plan, each opening at its own scale.
- Lines and hatches only in the view you drew them in.
- Your sheets drawn again from the model every time you open them, so they always match it. A view whose level or section line was deleted is reported, not drawn.
- Every change here is one step: {{key:Mod+Z}} takes it back.

:::note
All of this is kept in the IFC file as property sets other programs leave alone: each level's view range and ceiling plan on the level, the templates, callouts and your sheets on the project. Lines and hatches are IFC annotations in their level, so other programs see them as 2D curves and hatched areas (their own drawing of each pattern), though not which view they belong to.
:::

:::tip
Other BIM programs call the cut a view range or cut plane, templates view templates or view settings, drafting lines detail lines, and hatch regions filled regions. The ideas are the same; the view settings do not travel to them.
:::
