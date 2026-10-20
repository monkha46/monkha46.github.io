---
title: Estimate the daylight in each room
summary: The average daylight factor of every room from its windows, its inside surfaces and the sky each window sees, with the sky angle measured in the model. An early-design estimate, not a simulation or a code check.
section: tasks
order: 48
keywords: daylight, daylight factor, average daylight factor, adf, natural light, window, glazing, sky angle, obstruction, overshadowing, balcony, overhang, reflectance, transmittance, early design, analysis, rooms, spaces
---

The {{ui:Daylight}} tab in the right panel works out each room's **average daylight factor**: how much of the light of an overcast sky outside reaches the room, on average, as a percentage. It reads the open IFC model's rooms (spaces) and windows. Nothing is changed in the model and nothing is uploaded.

:::warning
This is an early-design estimate by a published formula, **not a simulation** and **not a check against a building code or a standard**. BS EN 17037, LEED, BREEAM and energy codes ask for a daylight simulation with the climate of the place; use a daylight simulation program for those.
:::

## Work it out

1. Open an IFC model that has rooms (spaces) and windows. Models drawn here have a room inside every closed set of walls.
2. Open the {{ui:Daylight}} tab and click {{ui:Calculate}}.
3. Each room shows its daylight factor and a band: under 2 %, 2–5 %, 5 % or more. Click a room to see its surfaces and each window's area and sky angle; the room and its windows are picked in the model.

Change an input and the numbers follow at once; after changing the model, {{ui:Calculate again}}. {{ui:CSV}} saves every room with its numbers and the inputs used.

## The formula

Average daylight factor (%) = T × Ag × θ × M ÷ (A × (1 − R²)), added up over the room's windows (Littlefair's formula, used by BRE 209, BS 8206-2 and CIBSE LG10):

- **T**, the glass's light transmittance (0.7 to start: use the maker's figure).
- **Ag**, the glazed area: each window's area (its overall width × height, else its size in the model) × the **glazed share** (0.75 to start: the rest is frame).
- **θ**, the angle of sky the window sees, in degrees (below).
- **M**, the maintenance factor for dirt on the glass (1 to start).
- **A**, every inside surface of the room: floor, walls, ceiling and windows, taken from the room's own shape.
- **R**, their mean reflectance, weighted by area: floor 0.2, walls 0.5, ceiling 0.7 to start; glass counts as 0.1.

## How the sky angle is measured

For each window KHADRAW cuts the model with an upright plane square to the window, from the outside face of the glass, and looks from the horizon straight up: everything the cut meets in front of the window (a building opposite, a balcony or an overhang above, the eaves) hides part of that 90°. θ is what is left. The window itself and the wall it sits in are left out. It does this at five places across the window's width and takes the mean, so a thin post in front of the middle takes its share, not the whole sky.

A building 8.5 m above the window's centre and 9.9 m away hides 40.65° (the angle whose tangent is 8.5 ÷ 9.9), leaving θ = 49.35°.

## What it leaves out

- Roof windows (glass lying flat or sloping) are listed but not counted: the formula here is for windows in walls.
- Windows with no room behind them (a hall without a space, for example) are listed apart.
- Direct sunlight, glare, the daylight at a given point, the hours of sun and any energy figure.
- The bands are from older British guidance (BS 8206-2), shown as a guide, never as a pass or fail.
