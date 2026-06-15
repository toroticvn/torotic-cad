# Torotic CAD — Nhật ký phát triển (cập nhật 2026‑06‑12)

> Bản tổng hợp đầy đủ tới hiện tại, **thay thế** bản 2026‑06‑11.
> **Torotic CAD** — phần mềm thiết kế 3D tham số (parametric) chạy trên trình duyệt,
> mô phỏng logic SolidWorks: Sketch 2D → ràng buộc → feature → khối B‑rep → cây lịch sử.

---

## 1. Mục tiêu & nền tảng

Sản phẩm CAD thật theo logic SolidWorks (không chỉ "vẽ 3D").

| Hạng mục | Lựa chọn |
|---|---|
| Nền tảng | **Web** (trình duyệt) |
| Khung UI | **React + TypeScript + Vite** |
| Hiển thị 3D | **three.js** (chỉ render) |
| Trạng thái | **zustand** |
| Kernel hình học | **replicad + replicad‑opencascadejs** (OpenCASCADE/WASM ~11MB) — B‑rep thật, có TypeScript types |
| Bộ giải ràng buộc | **Tự viết** (Levenberg–Marquardt) |

**Kiến trúc 4 lớp tách bạch:** UI (React) · Sketcher 2D + Feature Engine · Geometry Kernel (replicad/OCCT) · Renderer (three.js).

> ⚠️ Máy Windows này cần `NODE_OPTIONS=--use-system-ca` cho mọi lệnh node/npm.

---

## 2. Tính năng đã hoàn thành

### Sketch 2D (giống hệt SolidWorks)
- **Giao diện:** nền sáng gradient, **Ribbon CommandManager** (icon+chữ, menu xổ flyout), **PropertyManager** bên trái, **StatusBar** (Under/Fully/Over Defined).
- **Công cụ vẽ:** Line, Rectangle (theo góc / theo tâm), Circle, Polygon, **Arc 3 loại** (theo tâm / 3 điểm / tiếp tuyến), **Slot**, **Trim** (click xoá), **Sketch Fillet** (bo góc 2 đường).
- **Construction (nét đứt):** geometry tham chiếu, không bị đùn.
- **Inference:** tự bắt ngang/dọc/trùng điểm, hiện dấu vàng + tự thêm ràng buộc.
- **Ràng buộc:** ngang, dọc, song song, vuông góc, bằng nhau, trùng điểm.
- **Kích thước + công thức:** chiều dài/khoảng cách/bán kính; liên kết bằng công thức (vd `d2 = d1/2 + 5`).
- **Màu trạng thái:** xanh = chưa đủ ràng buộc, đen = đã đủ — tính bằng **DOF = biến tự do − hạng Jacobian**.

### Bộ giải ràng buộc (constraint solver)
- Levenberg–Marquardt tự viết (Jacobian số, khóa biến) — `src/sketch/solver/lm.ts`.
- Parser công thức an toàn, không `eval` — `src/sketch/solver/expr.ts`.
- Thiết kế interface "values vào → values ra" để có thể thay PlaneGCS sau này.

### Tạo khối 3D (feature tham số)
- **Extrude** (đùn) — có **chọn vùng (Selected Contours)**: PropertyManager trái + click chọn mảng vùng trong viewport.
- **Revolve** (xoay tròn) quanh trục u/v của mặt phẳng, góc tuỳ chọn.
- **Loft** (nối ≥2 biên dạng) — chọn theo thứ tự.
- **Sweep** (quét biên dạng theo đường dẫn).
- **Boolean**: mỗi feature có thao tác **Khối mới / Thêm (Boss) / Cắt (Cut)**.
- **Multi‑body**: "Khối mới" tạo body riêng; thao tác sau tác động vào body gần nhất.
- **Fillet / Chamfer cạnh 3D**: bấm công cụ → rê chuột (cạnh sáng vàng) → click chọn cạnh (sáng cam) → nhập bán kính → áp dụng; không chọn cạnh nào = áp cho tất cả. PropertyManager trái kiểu SolidWorks.

### Vùng từ giao điểm (Planar Arrangement) — `src/sketch/regions2d.ts`
- Tự tính **mọi giao điểm** giữa các đường → cắt nhỏ → dò các **mặt (faces)** bằng DCEL.
- Khi các đường **cắt nhau**, tách thành nhiều **vùng kín con** (gồm cả **vùng giao**) để chọn.
- Tự xử lý **lỗ** (hình lồng nhau) và **tái dựng cạnh cong** cho vùng giao (không gãy khúc).

### Cây feature & tiện ích
- **Rebuild tham số:** sửa kích thước/sketch/tham số feature → toàn cây dựng lại.
- **Mặt phẳng offset (datum):** vẽ sketch trên mặt phẳng song song cách gốc một khoảng.
- **Sửa sketch:** double‑click sketch trong cây để mở lại sửa → rebuild.
- **Undo / Redo** (Ctrl+Z / Ctrl+Y) mức cây feature.
- **Lưu / Mở project** (.json), **Xuất STEP / STL**.
- **Hiện sketch mờ** trong Model mode.

---

## 3. Cấu trúc mã nguồn

```
src/
  main.tsx, App.tsx, styles.css, vite-env.d.ts
  features.ts                  ← cây feature (sketch/extrude/revolve/loft/sweep/fillet/chamfer)
  state/store.ts               ← zustand: mode, sketch, features, rebuild, undo/redo, save/load,
                                  extrude session (chọn vùng), edge-select (fillet/chamfer)
  viewport/
    Viewport.ts                ← three.js: setSolids (multi-body), pick cạnh 3D + highlight,
                                  vẽ + pick vùng (region fills), overlay sketch, marker
    ViewportCanvas.tsx         ← cầu nối React; bắt click chọn cạnh / chọn vùng
  sketch/
    SketchPlane.ts             ← 3 mặt chuẩn + resolvePlane(offset) + đổi toạ độ 2D↔3D
    model.ts                   ← ParametricSketch (points/lines/circles/arcs/constraints/dimensions/offset)
    arc.ts                     ← hình học cung
    regions2d.ts               ← PLANAR ARRANGEMENT: giao điểm → DCEL → vùng (+lỗ, +arc)
    render3d.ts                ← sketch mờ trong Model mode
    SketchController.ts        ← tương tác vẽ: tools, inference, picking, render, màu DOF
    solveSketch.ts             ← dịch sketch → solver, giải, DOF
    solver/lm.ts, solver/expr.ts
    *.test.ts                  ← test (chạy bằng Node + esbuild)
  kernel/
    kernel.ts                  ← initKernel (tải WASM) + re-export
    profile.ts                 ← findRegions/buildProfile (dùng regions2d) + extractOpenPath (sweep)
    rebuild.ts                 ← rebuild cây → bodies, boolean, revolve/loft/sweep, fillet/chamfer, export
    *.runtime.test.ts          ← test kernel (Node)
  ui/
    Toolbar.tsx                ← Sketch/Extrude/Revolve/Loft/Sweep/Fillet/Chamfer/Undo/Redo/Lưu/Mở/STEP/STL
    SketchRibbon.tsx, PropertyManager.tsx, ParametersPanel.tsx, StatusBar.tsx, SketchOverlay.tsx
    FeatureTree.tsx, FeatureEditor.tsx
    ExtrudePropertyManager.tsx ← chọn vùng + tham số đùn (panel trái)
    FilletPropertyManager.tsx  ← chọn cạnh + bán kính (panel trái)
    RevolveDialog.tsx, LoftDialog.tsx, SweepDialog.tsx
```

---

## 4. Chạy / build / test

```bash
NODE_OPTIONS=--use-system-ca npm install
NODE_OPTIONS=--use-system-ca npm run dev      # http://localhost:5173
NODE_OPTIONS=--use-system-ca npm run build     # tsc + vite build
```

**Test (bundle bằng esbuild rồi chạy Node):**
- Test thuần hình học (solver, arrangement) → bundle **ESM** (.mjs).
- Test kernel (replicad/OCCT) → bundle **CJS** (.cjs) vì glue emscripten dùng `__dirname`; tạo `Plane` **sau** khi `setOC`.

```bash
# ví dụ test arrangement
node -e "require('esbuild').buildSync({entryPoints:['src/sketch/regions2d.test.ts'],bundle:true,outfile:'.t.mjs',format:'esm',platform:'node'})" && node .t.mjs
# ví dụ test kernel
node -e "require('esbuild').buildSync({entryPoints:['src/kernel/rebuild.runtime.test.ts'],bundle:true,outfile:'.t.cjs',format:'cjs',platform:'node'})" && node .t.cjs
```

**Các bộ test (đều ALL PASS):**
- `solveSketch.test.ts` — solver + DOF.
- `regions2d.test.ts` — đếm vùng (overlap→3, circle cắt rect→≥3, lồng→2 + lỗ, đơn→1).
- `profile.runtime.test.ts` — đùn biên dạng có cung (slot, nửa đĩa).
- `rebuild.runtime.test.ts` — extrude+cut, multi‑body, revolve, loft, sweep, fillet cạnh, đùn từng vùng con, export STEP/STL.

---

## 5. Lưu ý kỹ thuật quan trọng

- **Kernel tách lớp không import WASM** (`profile.ts`, `rebuild.ts`, `regions2d.ts`) để test được trong Node; `kernel.ts` chỉ lo `initKernel()`.
- `MeshData` dùng trường **`indices`** (không phải `triangles`).
- **Fillet cạnh 3D**: điểm chọn phải là **điểm thật trên cạnh B‑rep** (`edge.pointAt`); kernel khớp bằng **cạnh gần nhất + `inList`** (không dùng `containsPoint` vì nhạy sai số).
- **Arrangement (regions2d):** dò face DCEL với quy tắc next = `(idx+1)%n`; lỗ chỉ tính khi nằm trong vùng có **diện tích lớn hơn hẳn** (chặn mặt vô hạn bị nhận nhầm là lỗ).
- Cung lưu `{center, start, end, ccw}`, bán kính ngầm = |center→start|; solver tự thêm ràng buộc "hai đầu cách tâm bằng nhau" ⇒ cung tự do 5 bậc.
- Undo/Redo ở **mức cây feature** (chưa undo từng nét khi đang vẽ sketch).
- Giao điểm trong arrangement tính trên polyline lấy mẫu (64–72/đường tròn) ⇒ gần đúng, đủ dùng.

---

## 6. Lộ trình còn lại (tuỳ chọn)

- Per‑body boolean targeting (chọn body đích cho cut/add).
- Reorder feature trong cây; reference plane là feature trong cây.
- Chamfer/fillet theo tiêu chí cạnh (góc, chiều dài…).
- Undo trong lúc đang vẽ sketch.
- Tối ưu kích thước bundle (code‑split three.js / WASM).

---

*Sản phẩm: Torotic CAD · Thuộc chương trình Torotic AI · Thư mục: `Code3DCad`*
