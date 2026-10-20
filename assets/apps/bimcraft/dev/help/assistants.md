---
title: Let an AI assistant work with your model
summary: Turn on assistants in Settings so an assistant on your computer can find elements, read their properties, isolate them in the view and draw walls, doors, windows, floors, levels and grids, through CadCraft Studio. Off until you turn it on.
section: tasks
order: 60
keywords: ai, assistant, mcp, script, automation, studio, find elements, isolate, properties, permissions, disconnect, activity, draw walls, add doors, add windows, levels, grids, floors, undo, save, command line, cli, headless, use with ai assistants
---

## What you will learn

How to let an AI assistant (any assistant that speaks MCP) look into the IFC model you have open and draw in it, what it can and cannot do, and how to stop it.

## What an assistant can do in KHADRAW

| It asks to | What happens | Needs |
|---|---|---|
| Find elements | It gets a list of elements by class, storey, name or property value, as **Find** does | Read |
| Read properties | It gets one element's attributes, type, property sets and quantities, as **Properties** shows them | Read |
| Describe the model, list walls | It gets the levels, walls, doors, windows, rooms, floors, grids and columns, and each wall's ends, type and height | Read |
| Isolate, see-through, hide or show | The 3D view changes as if you had used the {{ui:Show}} menu | Change the view and draw |
| Draw walls, doors, windows, floors, levels or grid lines | The model changes as if you had used the {{ui:Draw}} tools: walls join, rooms, floors and roofs follow | Change the view and draw |
| Select elements, undo its own steps | Elements are picked in the view; its last step is taken back | Change the view and draw |
| Save | A new IFC file with every change, as {{ui:Save as IFC}} makes it (the original is never changed) | Save |

Each change an assistant makes is one step in **Changes**, named "Assistant: …" (for example "Assistant: add 4 walls"), so {{key:Mod+Z}} takes back its whole action, and you can see whose step it was. It cannot delete or move what is there, and it cannot open files: you open the model; it works with the one that is open.

## Turn it on

Assistants reach KHADRAW through CadCraft Studio on your computer; the plain browser has no way in.

1. Open {{ui:Settings}} and choose the **KHADRAW** tab.
2. Under **Assistants**, tick **Let AI assistants and scripts use KHADRAW**.
3. **Read** is ticked for you. Tick **Change the view and draw** too if the assistant may isolate and hide elements and draw, and **Save** if it may save the model as a new file.
4. Connect the assistant in Studio (Studio shows the address and the settings to paste into it).

## While an assistant is connected

A note at the top of the right panel says which assistant is connected and what it can do. Click {{ui:Disconnect}} to end its session at once; it has to connect again to continue.

**Activity**, under **Assistants** in Settings, lists every call the assistant made, newest first, with whether it worked.

:::tip
Ask in plain words, for example "isolate the external walls on Level 1", "which doors have no fire rating?" or "draw a 6 by 4 metre room on Level 1 with a door in the south wall". The assistant finds the elements and shows them in your view, or draws them.
:::

## Without a window: scripts and the command line

The same drawing tools work on IFC files in folders you name, with no window open: CadCraft's MCP server and command line can start a new building or open an IFC file, describe it, add walls, doors, windows, floors, levels and grids, undo and save it as a new `.ifc` file. You decide which folders it may use and whether it may change or save anything.

## Turn it off

Untick **Let AI assistants and scripts use KHADRAW**. Every assistant is disconnected straight away, and the setting is kept for next time.

## See also

- [Find elements by class, name or property](topic:find)
- [Hide, isolate and see through elements](topic:hide-and-isolate)
- [KHADRAW settings](topic:settings)
