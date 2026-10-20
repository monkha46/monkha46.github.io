---
title: Point cloud formats: what opens, and what to export
summary: Which laser scan files open in the 3D view, which are a scanner maker's own format, and what to export from the scanner's software so the scan opens here.
section: reference
order: 28
keywords: point cloud, laser scan, scan, formats, e57, las, laz, ply, pcd, ptx, pts, xyz, rcp, rcs, fls, lgs, tzf, zfs, export, can't open, not read
---

## What opens here

Open these with {{ui:Open}} or by dropping them on the page (see the topic on showing a point cloud beside the model):

| Format | Extension | What is read |
|---|---|---|
| LAS, LAZ | `.las`, `.laz` | LAS 1.0–1.4: points, colors, intensity, LiDAR classes, the coordinate system. LAZ up to 1 GB. |
| E57 | `.e57` | Every scan in the file, each placed by its pose; colors, or intensity when the file has no colors. Pictures in the file are left out (said). Up to 6 million points and 512 MB for now: export bigger scans as LAS or LAZ. |
| PLY | `.ply` | Text and binary (both byte orders): the vertices' x y z, colors and intensity. Faces are left out (said). |
| PCD | `.pcd` | Text and binary: x y z, packed or separate colors, intensity. Compressed PCD files are not read yet: save them as binary or text. |
| PTX | `.ptx` | One or more scans, each placed by its own transform; points the scanner did not measure are left out. Meters. |
| PTS, XYZ | `.pts`, `.xyz` | Text: x y z, with intensity and colors when the columns are there. |

## Files that only the scanner's software reads

Some scan files are a scanner maker's own format, with no published description and no open reader. KHADRAW can't read them, and opening one shows a card that says what it is and what to do. Export the scan from the maker's software as E57 or LAS (or PTX, PTS), then open the exported file.

| File | Extension | Export it from |
|---|---|---|
| ReCap project | `.rcp` | ReCap: open the project and export it. The project only points to its scans, so copying the `.rcp` alone gives no points. |
| ReCap scan | `.rcs` | ReCap: open the project the scan belongs to and export it. |
| FARO scan | `.fls` | FARO SCENE. |
| Leica scan | `.lgs` | Leica Cyclone REGISTER 360. |
| Trimble scan | `.tzf` | Trimble RealWorks or Trimble Business Center. |
| Z+F scan | `.zfs` | Z+F LaserControl. |

:::tip
When the export asks for a format, LAS or LAZ keeps everything KHADRAW shows (colors, intensity, classes and the coordinate system) in the smallest file.
:::

## Why these files are not read

Those formats are not published, and the only way to read them is each maker's own software library, under its own terms. KHADRAW only reads formats it can read with its own code on your computer, so a scan never has to be sent anywhere to open.
