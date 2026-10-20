---
title: Working between two BIM programs
summary: Send a model from one BIM program to another through IFC with KHADRAW in the middle, keep its GlobalIds, property sets and classifications, set both programs up for the same properties, and see what came back.
section: switching
order: 40
keywords: ifc, round trip, interoperability, globalid, guid, property sets, psets, classifications, shared parameters, property mapping, translator, bcf, coordination, exchange
---

## What you'll do

Move a model between two BIM programs, for example from Revit to Archicad and back, through IFC, with KHADRAW in the middle to check it, add to it and report what survived. Neither program's own file format is read: everything travels as IFC.

## What KHADRAW keeps

When you change a model in KHADRAW and click {{ui:Save as IFC}}, every line you did not change is written back exactly as it was. So:

- **GlobalIds** stay the same, and the other program can match each element to the one it sent.
- **Property sets** and their values stay, apart from the values you changed.
- **Classifications** stay attached to their elements.

## Set both programs up for the same properties

1. Open the model in KHADRAW (and the project bundle, if you have one: its property groups are added).
2. In the left panel, open {{ui:Between two BIM programs}}.
3. Under **Property mapping**, download what each program needs:
   - {{ui:Shared parameters}}: a shared parameter file. In Revit, load it with Manage › Shared Parameters and add the parameters to the categories that need them.
   - {{ui:IFC export property sets}}: a user-defined property set file. In Revit's IFC export settings, choose it under user-defined property sets, so the exported IFC carries the same set and property names.
   - {{ui:Mapping table (CSV)}}: every property with its IFC set and name, its type, and the matching names in each program. Archicad's mapping files are not a published format, so set up its IFC translator and property manager from this table by hand.
   - {{ui:Mapping file}}: the whole mapping as one file, to keep with the project.

Standard sets (Pset_ and Qto_) are left out of the shared parameter file: both programs write those from their own data.

## Send the model and bring it back

1. Export IFC from the first program with GlobalIds kept (Revit: "Store the IFC GUID in an element parameter after export" on).
2. Open it in KHADRAW, check it ({{ui:Model checks}}, {{ui:Clash check}}), add issues ({{ui:Issues}}, BCF), change values if you need to, and {{ui:Save as IFC}}.
3. Open the saved IFC in the second program, work on it, and export IFC from there with GlobalIds kept (Archicad's translator: "Global Unique Identifiers: Keep existing").
4. Back in KHADRAW, open the model that went out, then add the one that came back ({{ui:Add a model}} under Models).
5. In {{ui:Between two BIM programs}}, choose **Went out** and **Came back**, and click {{ui:Make the report}}.

## Read the report

- **Elements**: how many came back with the same GlobalId, how many are missing, and how many are new. Elements with a new GlobalId show as one missing and one new: the other program did not keep it.
- **IFC class changed**: elements that came back as another kind of element.
- **Property values kept**: the share of values that came back unchanged. The list below shows the properties with the most changed or missing values.
- **Classifications**: kept, changed (same system, another code) or missing.

{{ui:Download the report (CSV)}} gives every property with its counts. To see which elements moved or changed shape, use {{ui:Compare versions}} on the same two models.

:::note
KHADRAW runs neither program. Which settings carry a value through depends on each program's IFC settings: the report shows what actually came back, so try a setting, export again and compare.
:::

## Issues travel as BCF

Issues you raise in KHADRAW export as BCF ({{ui:Issues}}), which both programs can read with their BCF tools, so a question about an element reaches the person working in the other program with its viewpoint.

See also [Open a project bundle](topic:open-project-bundle), [From a project file to KHADRAW through IFC](topic:rvt-to-ifc) and [Compare two versions of a model](topic:compare-versions).
