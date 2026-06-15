> ⚠️ **Bản này đã cũ — xem bản đầy đủ mới nhất: [NHATKY-PHATTRIEN-2026-06-12.md](NHATKY-PHATTRIEN-2026-06-12.md)** (bổ sung offset plane, Loft, Sweep, Multi-body, Fillet/Chamfer cạnh 3D, chọn vùng Extrude, planar arrangement).

# Torotic CAD — Nhật ký phát triển (2026‑06‑11)

> Tài liệu lưu trữ tổng hợp toàn bộ những gì đã xây dựng cho **Torotic CAD** — phần mềm
> thiết kế 3D tham số (parametric) chạy trên trình duyệt, mô phỏng logic làm việc của
> **SolidWorks** (Sketch 2D → ràng buộc → feature → khối B‑rep → cây lịch sử).

---

## 1. Mục tiêu & quyết định nền tảng

**Mục tiêu:** sản phẩm CAD thật để dùng/bán, theo đúng logic SolidWorks chứ không chỉ "vẽ 3D".

| Hạng mục | Quyết định | Lý do |
|---|---|---|
| Nền tảng | **Web** (trình duyệt) | Dễ phân phối, hợp định hướng SaaS/AI |
| Khung UI | **React + TypeScript + Vite** | Nhanh, gọn, type‑safe |
| Hiển thị 3D | **three.js** | Chỉ render — KHÔNG phải kernel CAD |
| Trạng thái | **zustand** | Store đơn giản, không boilerplate |
| Kernel hình học | **replicad** + **replicad‑opencascadejs** (OpenCASCADE/WASM ~11MB) | B‑rep thật, có TypeScript types để `tsc` kiểm tra; chọn thay cho `opencascade.js` 1.1.1 (không types) và 2.0‑beta |
| Bộ giải ràng buộc | **Tự viết** (Levenberg–Marquardt) | Hiểu sâu, gọn, có interface để sau thay PlaneGCS |

**Triết lý kiến trúc:** tách bạch 4 lớp, mỗi lớp độc lập để thay thế được.

```
┌─────────────────────────────────────────────┐
│  UI (React)  — ribbon, PropertyManager, cây  │
├─────────────────────────────────────────────┤
│  Sketcher 2D     │   Feature Engine          │
│  - vẽ, inference │   - extrude/revolve/cut   │
│  - constraint    │   - rebuild theo cây      │
│    solver (LM)   │   - boolean, fillet       │
├──────────────────┴──────────────────────────┤
│  Geometry Kernel  (replicad / OpenCASCADE)   │
│  - profile, solid, boolean, tessellate, STEP │
├─────────────────────────────────────────────┤
│  Renderer (three.js) — viewport, camera, pick │
└─────────────────────────────────────────────┘
```

---

## 2. Các mốc đã hoàn thành

### M0 — Khung dự án + Viewport 3D
- Scaffold Vite + React + TS + three.js; nền gradient sáng kiểu SolidWorks.
- Viewport: lưới sàn, trục toạ độ màu, OrbitControls (xoay/pan/zoom có damping).
- `Viewport` tách hẳn khỏi React, có `modelGroup` + `setSolid()` làm điểm bàn giao kernel→render.

### M1 — Sketch mode (vẽ 2D)
- Chọn 1 trong 3 mặt phẳng chuẩn (Front/Top/Right), camera tự xoay vuông góc, khoá xoay.
- Công cụ Line / Rectangle / Circle, snap lưới 5 mm.
- **Điểm mấu chốt:** entity lưu ở **toạ độ 2D plane‑local** (không phải 3D) — nền cho solver & extrude.

### M3 — Bộ giải ràng buộc (làm trước M2 theo yêu cầu)
> Đây là "trái tim" của CAD tham số.
- **Solver số tự viết** (Levenberg–Marquardt, Jacobian số, khoá biến cho điểm cố định/đang kéo) — `src/sketch/solver/lm.ts`.
- **Mô hình điểm**: line/circle tham chiếu các *điểm chung*; khi vẽ tự gộp điểm trùng (auto‑coincident).
- **Ràng buộc hình học:** ngang, dọc, song song, vuông góc, bằng nhau (độ dài/bán kính), trùng điểm.
- **Kích thước số:** chiều dài đoạn, khoảng cách 2 điểm, bán kính.
- **Liên kết kích thước bằng công thức** (vd `d2 = d1/2 + 5`) — parser an toàn tự viết, không `eval`, giải theo thứ tự phụ thuộc.
- Sửa số → hình tự co giãn (parametric thật sự).

### M2 — Tích hợp OpenCASCADE + Extrude
- `initKernel()` tải WASM một lần (lazy).
- `buildProfile()` dựng biên dạng kín từ sketch (line/arc loop hoặc circle).
- `sketchOnPlane(plane).extrude(distance)` → khối solid B‑rep; tessellate → mesh + cạnh sắc cho three.js.
- `Plane` của replicad dựng khớp đúng SketchPlane (origin, u, normal) → khối hiện đúng chỗ đã vẽ.

### "Giống hệt SolidWorks" — Đợt 1 (giao diện & cảm giác)
- **Theme sáng** toàn app + nền gradient viewport.
- **Ribbon CommandManager**: nhóm icon+chữ, menu xổ (flyout) chọn biến thể.
- **PropertyManager** bên trái (thay Feature Tree khi vẽ): tên công cụ, hướng dẫn, ô *For construction*, số cạnh polygon, *Add Relations*.
- **StatusBar**: Under / Fully / Over Defined.
- **Inference**: tự bắt ngang/dọc/trùng điểm, hiện dấu vàng, tự thêm ràng buộc khi click.
- **Màu trạng thái**: xanh = chưa đủ ràng buộc, đen = đã đủ — tính bằng **DOF = biến tự do − hạng Jacobian**.
- **Nét đứt (construction)** + công cụ **Rectangle theo tâm**, **Polygon**.

### "Giống hệt SolidWorks" — Đợt 2 (đủ bộ công cụ vẽ)
- **Cung tròn (Arc) 3 loại:** theo tâm, 3 điểm, tiếp tuyến.
- **Slot** (2 đường + 2 nửa cung).
- **Trim** (click để xoá đối tượng) + dọn điểm mồ côi.
- **Sketch Fillet** (click góc chung 2 đường → bo cung tiếp tuyến, cắt lại 2 đường).
- Kernel `extractLoop` xử lý biên dạng **hỗn hợp line + arc** (dùng `threePointsArcTo`).

### M4 — Cây feature tham số: Cut / Revolve / Boolean + Rebuild + Export
- **Feature tham số** (`src/features.ts`): SketchFeature, ExtrudeFeature, RevolveFeature, FilletFeature, ChamferFeature; mỗi solid feature có `operation: new | add | cut`.
- **Rebuild engine** (`src/kernel/rebuild.ts`): duyệt cây theo thứ tự, dựng từng khối, ghép bằng boolean `fuse`/`cut`.
- **Revolve** quanh trục u/v của mặt phẳng sketch, góc tuỳ chọn.
- **Sửa tham số/sketch → toàn cây tự dựng lại** (parametric rebuild).
- **Xuất STEP / STL** (`blobSTEP` / `blobSTL`).

### Nhóm "đời thường"
- **Undo / Redo** (Ctrl+Z / Ctrl+Y) ở mức cây feature.
- **Lưu / Mở project** dạng JSON.
- **Hiện sketch mờ trong Model mode**.
- **Fillet / Chamfer cạnh 3D** (áp cho *toàn bộ* cạnh — chưa chọn cạnh riêng).

---

## 3. Cấu trúc mã nguồn

```
src/
  main.tsx, App.tsx, styles.css, vite-env.d.ts
  features.ts                  ← kiểu cây feature (sketch/extrude/revolve/fillet/chamfer)
  state/
    store.ts                   ← zustand: mode, sketch, features, rebuild, undo/redo, save/load, export
  viewport/
    Viewport.ts                ← three.js (scene/camera/render), setSolid, overlay, frameModel
    ViewportCanvas.tsx         ← cầu nối React, gắn SketchController
  sketch/
    SketchPlane.ts             ← 3 mặt chuẩn + đổi toạ độ 2D↔3D
    model.ts                   ← ParametricSketch (points/lines/circles/arcs/constraints/dimensions)
    arc.ts                     ← hình học cung (góc, lấy mẫu, via‑point, circumcenter, distToArc)
    SketchController.ts         ← tương tác vẽ: tools, inference, picking, render, màu trạng thái
    render3d.ts                ← dựng sketch mờ trong Model mode
    solveSketch.ts             ← dịch sketch → bài toán solver, giải, ghi toạ độ + DOF
    solver/
      lm.ts                    ← Levenberg–Marquardt + Jacobian số + computeDof (hạng)
      expr.ts                  ← parser công thức an toàn (không eval)
    solveSketch.test.ts        ← test solver + DOF (chạy bằng Node)
  kernel/
    kernel.ts                  ← initKernel (tải WASM) + re-export rebuild
    profile.ts                 ← dựng biên dạng kín line+arc (không import WASM → test được)
    rebuild.ts                 ← rebuild cây, boolean, revolve, mesh, export (không import WASM)
    profile.runtime.test.ts    ← test đùn biên dạng có cung (slot, nửa đĩa)
    rebuild.runtime.test.ts    ← test rebuild: extrude+cut, revolve, fillet, export STEP/STL
  ui/
    Toolbar.tsx                ← Sketch/Extrude/Revolve/Fillet/Chamfer/Undo/Redo/Lưu/Mở/STEP/STL
    SketchRibbon.tsx           ← CommandManager (flyout)
    PropertyManager.tsx        ← panel trái khi sketch
    ParametersPanel.tsx        ← bảng kích thước & công thức (Equations)
    FeatureTree.tsx            ← cây feature (double‑click sketch để sửa)
    FeatureEditor.tsx          ← panel phải khi model: sửa tham số feature
    StatusBar.tsx              ← trạng thái Under/Fully/Over Defined
    SketchOverlay.tsx          ← hộp chọn mặt phẳng
    ExtrudeDialog.tsx / RevolveDialog.tsx
```

---

## 4. Cách chạy / build / test

> ⚠️ Máy Windows này cần `NODE_OPTIONS=--use-system-ca` cho mọi lệnh node/npm (vấn đề chứng chỉ SSL).

```bash
# Cài đặt
NODE_OPTIONS=--use-system-ca npm install

# Chạy dev (mở http://localhost:5173)
NODE_OPTIONS=--use-system-ca npm run dev

# Build production (tsc kiểm tra type + vite build)
NODE_OPTIONS=--use-system-ca npm run build
```

**Chạy test (bundle bằng esbuild rồi chạy Node):**
```bash
# Test solver (ESM được)
NODE_OPTIONS=--use-system-ca node -e "require('esbuild').buildSync({entryPoints:['src/sketch/solveSketch.test.ts'],bundle:true,outfile:'.t.mjs',format:'esm',platform:'node'})" && node .t.mjs

# Test kernel (PHẢI dùng CJS vì glue emscripten dùng __dirname)
NODE_OPTIONS=--use-system-ca node -e "require('esbuild').buildSync({entryPoints:['src/kernel/rebuild.runtime.test.ts'],bundle:true,outfile:'.t.cjs',format:'cjs',platform:'node'})" && node .t.cjs
```

---

## 5. Tình trạng kiểm chứng

| Hạng mục | Trạng thái |
|---|---|
| `tsc` type‑check toàn bộ | ✅ sạch |
| Solver + DOF (đường tự do=4, hình CN ràng buộc=0) | ✅ ALL PASS |
| Đùn biên dạng có cung (slot, nửa đĩa) | ✅ ALL PASS |
| Rebuild: extrude + boolean cut, revolve 360°, fillet, export STEP/STL | ✅ ALL PASS |
| Luồng click thật trên trình duyệt | ⏳ cần người dùng nghiệm thu bằng mắt |

> Lõi kernel & solver được test end‑to‑end trong Node (không cần trình duyệt). Phần *giao diện/thao tác chuột* và *chiều cong của cung* cần xác nhận trực quan.

---

## 6. Lưu ý kỹ thuật quan trọng

- **Solver có thể thay thế**: interface "values vào → values ra" → sau này có thể đổi sang **PlaneGCS** mà không đập UI.
- **Kernel tách 2 lớp không import WASM** (`profile.ts`, `rebuild.ts`) để **test được trong Node**; `kernel.ts` chỉ lo `initKernel()` (import `?url` WASM) + re‑export.
- Test kernel phải bundle dạng **CJS** (glue emscripten dùng `__dirname`); tạo replicad `Plane` **sau** khi `setOC`.
- `MeshData` dùng trường **`indices`** (không phải `triangles`).
- Cung lưu `{center, start, end, ccw}`; bán kính ngầm = |center→start|; solver tự thêm ràng buộc "hai đầu cách tâm bằng nhau" ⇒ cung tự do = 5 bậc.
- Construction (nét đứt) bị **loại khỏi extrude**.
- Undo/Redo ở **mức cây feature** (chưa undo từng nét trong lúc đang vẽ sketch).
- Boolean hiện gộp về **một khối** (chưa multi‑body).

---

## 7. Lộ trình còn lại (đợt sau — nặng)

- **Fillet/Chamfer cạnh riêng lẻ** (cần chọn cạnh 3D → ánh xạ sang edge finder của replicad).
- **Mặt phẳng offset/tham chiếu** → mở đường cho **Loft** (sketch đồng phẳng không loft được).
- **Sweep** (quét theo đường dẫn — cần spine wire).
- **Multi‑body** (nhiều khối rời + chọn khối đích cho boolean).
- Undo trong lúc đang vẽ sketch; loft/sweep; chamfer cạnh theo tiêu chí.

---

*Sản phẩm: Torotic CAD · Thuộc chương trình Torotic AI · Thư mục: `Code3DCad`*
