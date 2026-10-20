---
title: Keep asset data and a maintenance record in the model
summary: Use the handed-over IFC model for running the building: maker, model, serial number, warranty and service life for equipment and fixtures, and a record of the maintenance done, all written into the IFC.
section: tasks
order: 47
keywords: assets, asset register, facility management, fm, operations, maintenance, service, warranty, serial number, barcode, maker, manufacturer, model, service life, handover, cobie, digital twin, overdue, due, work order
---

The {{ui:Assets}} tab in the right panel turns the open IFC model into a record of the building's equipment. Everything is written into the IFC itself, in IFC's own property sets and tasks, so the next program that opens the file reads it too. Nothing is uploaded and no server is needed: save the IFC to keep it.

## What is listed

- Equipment and fixtures: furniture, sanitary fixtures, light fixtures, appliances, air terminals, valves, pumps, fans, boilers, tanks, outlets, switchboards, lifts and other such elements, and library items with equipment data.
- Any other element you **track**: pick it in the model (a door, a wall, a pump drawn as a plain object) and click {{ui:Track picked}}.
- Anything that already has asset data or a maintenance task, written here or by another program.

What is overdue comes first, then what is due within 30 days. Filter by name, tag, maker, model or serial number, by level, or tick {{ui:Only overdue or due within 30 days}}.

## Asset data

Click an asset in the list (or pick it in the model) to open its data: maker, model, model reference, serial number, barcode, the day it was installed, the warranty number and its start and end, and its service life in years. {{ui:Save the data}} writes them in one step ({{key:Mod+Z}} undoes it). Leave a box empty to remove that value.

## The maintenance record

Under the data, {{ui:Record work done}}: the day it was done, the work, who did it, when it is next due and notes. Each entry is one step; {{ui:Edit}} and {{ui:Delete}} change it later. The newest entry's next due date decides whether the asset is overdue or due soon.

## How it is kept in the IFC

- Maker and model in `Pset_ManufacturerTypeInformation`, serial number, barcode and the installed day in `Pset_ManufacturerOccurrence`, the warranty in `Pset_Warranty`, the service life in `Pset_ServiceLife`, on the element itself. When the element's type already carries a maker or model, it shows until you type your own.
- Each maintenance entry is an IFC **task** of the maintenance kind, tied to the element, with its dates (in IFC4 also as the task's own times) and a `CadCraft_Maintenance` set with the day, who did it and the next due day.
- Values another element shares are copied first: changing one asset never changes its neighbours.
- In older IFC2X3 files the dates are written as text (YYYY-MM-DD); that version wants a separate date record there, which KHADRAW does not write.

## CSV

{{ui:CSV}} saves every asset with its data and every maintenance entry, one row each, for a spreadsheet or another maintenance program.

:::note
Sensor readings, live feeds, documents attached to an asset and a COBie spreadsheet are not built yet. See [Not built yet](topic:not-built-yet).
:::
