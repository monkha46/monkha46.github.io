---
title: What's new in 0.6
summary: KHADRAW adds grids and columns, wall trim, floors of any shape and ramps, linked models, a project browser with view ranges, ceiling plans, callouts, drafting in a view and your own sheets, pipes and ducts, door, window and furniture families, frame analysis, points for the field, VR review, asset and daylight tabs, and more point cloud formats.
section: start
order: 5
keywords: whats new, what's new, release notes, changelog, changes, 0.6, version, new features, coordinates, trim, extend, corner, grids, columns, floor by outline, ramps, site, levels, point cloud, scan, traced drawing, linked models, project browser, view range, view template, sheets, plan scale, crop region, underlay, ceiling plan, callout, hatch, drafting, assistants, pipes, ducts, valves, families, family editor, frame analysis, setting out points, as-built, vr, headset, glb, rendering, assets, maintenance, daylight, 4d schedule, stages, ply, pcd, ptx, e57
---

This is what changed in KHADRAW 0.6, compared with 0.5. Most of it answers what BIM users asked for: grids, trim and corners, views and sheets the BIM way, and pipes and ducts, all saved as plain IFC.

## New

### Draw a building

- **Where you are working.** The pointer's X, Y and Z (and map eastings and northings when the model has them) show with the level it is on, over the 3D view and the plan. The project origin and the site's survey point are drawn as markers. See [Coordinates in KHADRAW](topic:coordinates).
- **Trim, extend and corner walls.** {{ui:Modify}} › {{ui:Trim / extend}} runs a wall to another wall, and {{ui:Corner}} joins two walls where they meet. Rooms, floors and roofs follow. See [Trim, extend and join walls](topic:trim-extend-walls).
- **Grids and columns.** {{ui:Build}} › {{ui:Grid}} lays out numbered and lettered grid lines by spacing or one by one; they show on every plan and on the drawing set, and the drawing tools snap to them. {{ui:Build}} › {{ui:Column}} places rectangular or round columns, one by one or at every grid crossing. See [Grids and columns](topic:grids-and-columns).
- **Floors of any shape, and ramps.** {{ui:Build}} › {{ui:Floor by outline}} draws floors and slabs of any shape with openings cut in them. {{ui:Build}} › {{ui:Ramp}} draws a straight ramp by slope or by length, with landings where the rise needs them. See [Floors of any shape, openings and ramps](topic:floors-by-outline-and-ramps).
- **The site and levels as tools.** {{ui:Build}} › {{ui:Site}} draws the site's outline and places and turns the building on it. {{ui:Add levels…}} adds levels at given heights or splits the building's height into equal levels. See [The site, the building on it, and its levels](topic:site-building-and-levels).
- **Draw on a point cloud.** With a scan open, the plan shows its slice at the level's cut height and every drawing tool snaps to the scanned points. The {{ui:Scan}} menu sets the slice's thickness, aligns the scan's floor to the level and turns it square to the building. See [Model from a scan](topic:model-from-a-scan).
- **Walls from a traced drawing.** {{ui:Build}} › {{ui:From a drawing…}} turns a DWG or DXF plan into walls, doors and windows in one step, and keeps the drawing under the plan as a reference. See [Walls from a traced drawing](topic:walls-from-a-drawing).
- **The ground from CivilCraft.** {{ui:Build}} › {{ui:Terrain}} reads LandXML surfaces, such as CivilCraft's export, keeping their own points and triangles. With several surfaces in the file, KHADRAW asks which one is the ground. See [The site's ground, the building pad and paving](topic:terrain#bring-the-ground-in).
- **Pipes and ducts.** {{ui:Build}} › {{ui:Pipe}} and {{ui:Duct}} draw runs at a height, and the elbows, tees, reducers and transitions are made for you; {{ui:Valve}} puts a valve on a pipe. Pipe sizes come from public standards, ducts can be sized from their airflow, and drains start at the minimum slope. Each run is saved as one connected system that other programs read, and it appears in the schedules and the takeoff. See [Pipes and ducts](topic:pipes-and-ducts).
- **Assistants that can draw.** An AI assistant or script you connect can now draw walls, doors and windows, floors, levels and grid lines. Each change is one step that {{key:Mod+Z}} takes back. Saving stays off until you turn it on in {{ui:Settings}} › {{ui:KHADRAW}} › {{ui:Assistants}}. See [Let an AI assistant work with your model](topic:assistants).

### Doors, windows and furniture in families

- **Families and their sizes.** A family is one kind of door, window or piece of furniture in several sizes; KHADRAW shows it once, with its sizes under it. The Door and Window tools pick a family and a size, and a new width and height becomes a new size. In the file each size is a plain IFC type, so other programs read it. See [Families and their sizes](topic:families).
- **Place furniture from a family.** {{ui:Place family}} puts furniture on a floor (a table, a shelf unit and a base cabinet to start from); {{key:R}} turns it. See [Families and their sizes](topic:families#place-furniture).
- **A family editor.** Parameters with formulas, yes or no parameters that show or hide parts, extrusions, revolves, sweeps and Booleans, with handles in a 3D preview. Saving remakes every element of the family. See [Edit a family](topic:family-editor).
- **Family files.** Save a family as its own file or as an IFC library, and open either in another model. See [Families and their sizes](topic:families#family-files).

### Drawing comforts

- **Curved walls.** Set {{ui:Wall}} › {{ui:Shape}} to Curved and click where the wall starts, where it ends, then a point on its arc (or type the arc height). A curved wall joins the walls at its ends, holds doors and windows along its arc, makes rooms and is saved as a real arc in IFC.
- **A wall keeps the line it was drawn on.** Draw on the outside or inside face and it stays there when the wall gets thicker or its outside is flipped; {{ui:Location line}} in Properties changes which line that is.
- **Move and turn library items.** Drag a cabinet or anything placed from the library in the plan, turn it with its round grip or R, or type X, Y and Rotation in Properties.
- **Dormers and spiral stairs.** {{ui:Build}} › {{ui:Dormer}} puts a gable or shed dormer on a roof face and cuts the roof below it; {{ui:Stair}} › Spiral draws wedge treads round a center post.
- **Interior elevations.** A room's Properties › {{ui:Interior elevations…}} shows its four walls from inside on one sheet, with the room's width and height and tags on its doors, windows and cabinets, and downloads as a PDF. Elevations and sections on your sheets also carry level marks, heights and tags.
- **From a community contributor.** A wall's drawing reference (centerline, inside or outside face), alignment guides while drawing walls, and a basement egress window with a well. These are modeling defaults, not a check of egress rules.

### Views and sheets

- **Views the BIM way.** A project browser lists every plan, elevation, section, saved 3D view, schedule, sheet, view template and link. Each floor plan has its own view range and can leave out categories or elements, and view templates carry those settings to several plans. See [Views, view ranges and your own sheets](topic:views-and-sheets).
- **Your own sheets.** Drag plans, elevations, sections and schedules onto a sheet at the scale you pick; the sheet is saved in the model and downloads as a PDF. See [Arrange a sheet of your own](topic:views-and-sheets#arrange-a-sheet-of-your-own).
- **Plan scale, crop region and underlay.** Each floor plan has a scale it prints at, a crop region that cuts it on paper and sheets, and an underlay that draws another level lightly under it. See [Crop a plan, give it a scale, show another level under it](topic:views-and-sheets#crop-a-plan-give-it-a-scale-show-another-level-under-it).
- **Reflected ceiling plans.** Every level has a ceiling plan beside its floor plan, with ceilings and their grid, a height tag, lights and beams. Items placed from the library while it is shown hang from the ceiling. See [A level's ceiling plan](topic:views-and-sheets#a-levels-ceiling-plan).
- **Callouts.** {{ui:Annotate}} › {{ui:Callout}} and two corners make a view of part of a floor plan or ceiling plan at its own scale (1:20 to start): a kitchen, a stair, a wall corner. Its rectangle and tag are drawn on the plan; click the tag to open it, and {{ui:Up}} goes back. A callout goes on your sheets and prints like a plan. See [Make a callout](topic:views-and-sheets#make-a-callout).
- **Lines and hatches in one view.** Draw lines, polylines, rectangles and hatch regions (by their corners, or {{ui:Fill a room}}) in six patterns, in one floor plan, ceiling plan or callout only. They never show in 3D or another view, and they print and go on sheets with their view. See [Draw lines and hatches in one view](topic:views-and-sheets#draw-lines-and-hatches-in-one-view).

### Analysis, field and review

- **Frame analysis.** The {{ui:Analysis}} tab works out forces, moments, reactions and deflections for a model's beams, columns and braces, with load cases and combinations, the deflected shape on the model, and a report as PDF and CSV. It is an analysis aid, not a code check. See [Analyse the structural frame](topic:frame-analysis).
- **Points for the field.** The {{ui:Points}} tab writes setting-out points (column centers, wall ends, anchor bolts or any elements you pick) for a total station as CSV or TXT, then reads the crew's as-built points back and shows which are within your tolerance. See [Points for setting out, and as-built checks](topic:field-points).
- **Review in a VR headset.** {{ui:VR}} on the toolbar puts you inside the model at full size: jump between floors, measure, cut walls open and place issues with a picture of what you saw. In a live session everyone in VR sees the others. Nothing is uploaded. See [Review the model in a VR headset](topic:vr-review).
- **Assets and maintenance.** The {{ui:Assets}} tab keeps each piece of equipment's maker, model, serial number, warranty and service life, and a maintenance record with what is overdue or due soon first. It is all written into the IFC, so other programs read it too. See [Keep asset data and a maintenance record in the model](topic:assets-and-maintenance).
- **Daylight.** The {{ui:Daylight}} tab estimates each room's average daylight factor from its windows, its inside surfaces and the sky each window sees, measured in the model. It is an early-design estimate, not a simulation or a code check. See [Estimate the daylight in each room](topic:daylight-factor).
- **A model for rendering programs.** {{ui:For rendering}} on the toolbar saves what the 3D view shows as a .glb file with its materials, textures and lights, for rendering programs that read glTF, such as Twinmotion. See [Send the model to a rendering program](topic:model-for-rendering).

### Models you receive and other programs

- **Linked models.** Link other IFC models for coordination: they are shown and cut on the plans but never merged, placed by shared or map coordinates or two picked points, snapped to while drawing, and reloaded when their file changes. See [Link other models for coordination](topic:linked-models).
- **Four more point cloud formats.** PLY, PCD, Leica PTX and E57 now open as well as LAS, LAZ, XYZ and PTS, and a card for scanner makers' own formats says how to export E57 or LAS. See [Point cloud formats: what opens, and what to export](topic:point-cloud-formats).
- **Project bundles.** KHADRAW opens a project bundle exported from Archicad: the model, its views, its layouts (as PDF and DWG), the picked element's properties in the project's own groups, and the project's standards. See [Open a project bundle](topic:open-project-bundle).
- **Between two BIM programs.** KHADRAW writes the files that set Revit and Archicad up for the same properties, and makes a round-trip report of what came back, was changed or was lost when a model went out and came back as IFC. See [Working between two BIM programs](topic:two-bim-programs).
- **Project files told apart.** KHADRAW recognizes an Archicad project file (.pln, .pla) for certain by its first bytes, and says when a file with that name doesn't start like one. See [Open .pln and .pla project files](topic:pln-project-files).
- **4D stages and packages.** The 4D schedule groups tasks into stages and work packages: pick one and it plays on its own dates, with everything else see-through, and {{ui:Select its elements}} picks the whole group. See [Play a construction schedule on the model](topic:4d-schedule#stages-and-work-packages).
- **Library items in your language.** An item's name, description and type show in your language when the item carries them, and it is placed under that name. See [Place equipment and furniture from the library](topic:place-from-library#items-in-your-language).

## Changed

- **A building turned in its site is shown square.** Fit, Top, Front, Side, the view cube's faces and every new section follow its walls, and the view cube's compass still points to north. {{ui:Settings}} › {{ui:KHADRAW}} › {{ui:A building turned in its site}} › {{ui:As placed in the site}} keeps the file's axes. See [A building turned in its site](topic:section-plane#a-building-turned-in-its-site).
- **Doors and windows come in families.** The 18 starter doors and windows are drawn exactly as before. Files from before 0.6 open unchanged; a door or window moves onto a size of its family the first time it is changed. Doors and windows drawn here are now typed in IFC2X3 files too.

## Fixed

- An automatic roof, foundation or building pad followed every wall. It now follows only the walls that enclose the building, so posts, a garden wall and inside walls no longer add facets to it.
- Fixed, hung and picture windows and double doors offered {{ui:Hinges: Flip}}. They no longer do, and sliding, pocket, barn and bifold doors say {{ui:Opens to}}.
- The sun's date and time boxes in Render were hard to read in the model theme while {{ui:Use another date and time}} was off.
- "Updating the model…" stayed on screen after the model had reloaded.
- Paint, Views and Render from the plan-only layout now switch to Split, so the 3D view they work in shows.
- A painted wall the drawing tools reshape keeps its color, in other programs too.
- A section left elements made of parts in different colors (a frame with its glass) looking hollow. Their cut faces are filled now.
- The section bar hid under the drawing bar. It now sits at the top of the 3D view it cuts and stays above the view cube, and in a narrow window Split puts the plan above the 3D view.

## In every app

- **The toolbar can't get lost.** While full screen hides the bars, a small {{ui:Show bars}} tab stays at the top of the window. {{ui:Settings}} › {{ui:General}} › {{ui:Reset the layout}} puts the toolbar, panels, screen mode and menu style back to how the app starts (your interface size and panel text size stay). In CadCraft Studio, its own {{ui:Settings}} has {{ui:Reset the layout in every app}}. See [Where did my toolbar go?](common:lost-toolbar).
- **A menu on the toolbar.** Right-click the toolbar, or press and hold it, to arrange it, lock it so nothing moves by accident, or reset it. Ribbon menu styles collapse to their tab names: a tab opens its tools for one command; double-click a tab or use the pin to keep the ribbon open. See [The toolbar's own menu](common:lost-toolbar#the-toolbars-own-menu).
- **Interface size.** {{ui:Settings}} › {{ui:General}} › {{ui:Interface size}} makes the bars, toolbars, panels and dialogs 80 % to 140 % of normal, for this app only, so two apps side by side on one monitor both fit. The drawing keeps its own zoom. See [Everything is too big or too small](common:lost-toolbar#everything-is-too-big-or-too-small).
- **Pen and touch.** On a tablet or a touch-screen laptop with a pen, your palm is ignored while you draw, fingers can be left to moving the view, a two-finger tap undoes and a three-finger tap redoes, and the pen's side button and eraser end can undo or redo. {{ui:Settings}} › {{ui:General}} › {{ui:Pen and touch}}. See [Draw with a pen on a tablet](common:pen-and-touch).
- **Live sessions can grow past 20 people.** In CadCraft Studio, when more people knock than the usual 20, Studio tells you what to expect and you choose {{ui:Allow anyway}} for this session or {{ui:Keep it at 20}}. {{ui:Recent edits}} in the Live panel shows who changed what. See [Work together live](common:work-together-live#when-many-people-join).
- **Bahasa Indonesia** is new in {{ui:Settings}} › {{ui:General}} › {{ui:Language}}: a machine-made draft of every word, not yet reviewed by a native speaker. **Spanish (Mexico)** is still a draft too. Help topics are in English.
- **Installers are still not signed** (signing comes next, in 0.7), and CadCraft Studio is not in an app store yet. Check the SHA-256 beside each file on getcadcraft.com/download. On Windows, if SmartScreen stops the installer, choose {{ui:More info}}, then {{ui:Run anyway}}. On a Mac, the first time, right-click CadCraft Studio and choose {{ui:Open}}. There is no iPad or iPhone build yet.
- **Fixed:** with the bars hidden, {{ui:Arrange the toolbar…}} in Settings was grayed out, and from the keyboard it lost its place after the first move.

## Not in this version yet

- Project bundles and the two-program kit have been tested against stand-ins only, not yet with Archicad or Revit themselves.
- Rendering a recorded walkthrough as a video isn't built in KHADRAW (KHADRAW Model renders videos from its scenes).
- View ranges and view templates are for floor plans only, and sheets are redrawn from the model each time. A set-of-sheets PDF, detail views and legends aren't built. Ceiling plans cut at one height (2300 mm).
- The .glb for rendering has one object per level and material, no saved views or walkthroughs as cameras and no bump maps; there is no FBX, plug-in or live link. It hasn't been opened in Twinmotion or Enscape themselves yet.
- Assets: documents, COBie, sensor feeds and a hosted twin aren't built; in IFC2X3 files the dates are kept as text. Daylight gives the average daylight factor only, with no solar gain or energy simulation.
- Ramps are straight, drawn floors don't follow walls, and columns are rectangular or round only (no steel or beams). Assistants can't delete or move elements.
- Pipes and ducts: fittings and valves are generic; equipment such as air handlers, fans and pumps, pressure losses, balancing, sprinklers and cable trays aren't built; drains aren't sized by fixture units; a run's corners can't be dragged.
- VR has been tested with a headset emulator, not yet with a real headset; inside CadCraft Studio it shows only where the system's web view offers it. Typing in VR isn't built: an issue placed in VR gets its words afterwards.
- E57 files up to 6 million points and 512 MB; compressed binary PCD files are refused; {{ui:Open a folder}} doesn't list point clouds yet.
- {{ui:Add a model…}} can place an extra model wrongly after the model is rebuilt.
- Families: one family inside another, arrays of solids, a material as a parameter, sizes from a spreadsheet, detail levels, a family's own plan lines, families in the library, and editing other programs' types as families. Models with families haven't been opened in other BIM programs yet.
- Library item pages on the site still show English names.

Everything else is in [What is not built yet](topic:not-built-yet).
