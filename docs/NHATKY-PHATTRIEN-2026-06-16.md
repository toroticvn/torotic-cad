# Torotic CAD — Nhật ký phát triển (2026‑06‑16)

> Tiếp nối bản 2026‑06‑15. File này ghi **những gì làm thêm** trong ngày 16/06.
> Bản tổng quan trạng thái luôn‑mới ở `docs/STATUS.md`.
> **Torotic CAD** — CAD 3D tham số chạy trình duyệt theo logic SolidWorks.

---

## 0. TL;DR đợt này
Mở rộng **Trợ lý AI agentic** theo đúng định hướng đã chốt (chat là cách dùng chính, UI thủ công khó):
1. **Sửa tham số thật (`modify`)** — AI đổi số đo của feature ĐANG CÓ thay vì xoá‑dựng‑lại.
2. **AI biết feature đang chọn** — nói "cái này" là hiểu đúng.

---

## 1. Sửa tham số parametric (`modify`)

Trước đây "đổi kích thước" = AI bỏ feature cũ (`delete`) rồi dựng lại từ đầu — mất tính parametric, dễ lệch tên/thứ tự. Giờ AI **vá thẳng tham số**.

- **Schema:** `apply_design` có thêm mảng `modify[]` (song song với `operations`/`delete`). Mỗi mục `{ target: tên|id feature, … }`.
- **Trường sửa được theo loại feature:**
  - **extrude** (box/cylinder/hole/profile): `distance`/`height` (chiều cao đùn); lỗ‑trụ thêm `diameter`; hộp thêm `width`/`depth`.
  - **fillet/chamfer:** `radius` · **revolve/draft:** `angle` · **thread:** `diameter`/`pitch`/`length` · **shell:** `thickness`.
  - **pattern (thẳng/tròn, cả body lẫn feature):** `count`, `dx`/`dy`/`dz`, `angle`, `axis`.
- **Resize tiết diện** (đường kính lỗ, bề rộng hộp) chạm vào **sketch** mà extrude tiêu thụ — `resizeSketch()` trong `src/ai/design.ts`: đường tròn → `r = Ø/2`; chữ nhật → **scale bbox quanh tâm** theo `width`/`depth` (giữ quan hệ ngang/dọc nên vẫn là chữ nhật).
- **Hàm thuần** `applyModify(features, modify)` (test được, không cần WASM): khớp feature theo **id hoặc tên** (không phân biệt hoa/thường), clone feature thay đổi, trả `{ features, applied }`.
- **store.sendChat** áp `applyModify` lên cây nền (sau bước `delete`) khi append, báo lại "✅ sửa N feature".
- **System prompt** dạy Claude **ƯU TIÊN `modify`** khi chỉ đổi số đo; chỉ xoá‑dựng‑lại khi đổi KIỂU hình (vd hộp→trụ).

Ví dụ:
- "đổi đường kính lỗ thành 12" → `modify:[{target:"Hole1", diameter:12}]`
- "làm tấm cao 20" → `modify:[{target:"Box1", distance:20}]`
- "bo góc to hơn, 5mm" → `modify:[{target:"Fillet1", radius:5}]`

## 2. AI biết feature đang chọn

`store.sendChat` lấy **tên feature đang chọn** (`selectedFeatureId` → name) và gửi sang `/api/chat` (`chat(messages, image, features, selected)`). Backend gắn vào context note: *"Feature người dùng đang CHỌN: …"*. Nhờ vậy "cái này / feature này" được hiểu đúng.

---

## 2b. Giải thích feature đang chọn (🔍)

Nút **🔍 Giải thích** trên toolbar (bật khi đang ở Model mode + có feature được chọn) → `store.explainSelected()`: mở chat, gửi prompt nhờ Claude **giải thích feature đang chọn** (loại gì, ý nghĩa tham số, vai trò, gợi ý/DFM) và **CHỈ giải thích, không vẽ**. Tận dụng context selection vừa thêm (tên feature đang chọn đã được gửi sang `/api/chat`). Nếu chưa chọn gì → báo lỗi nhẹ trong chat.

## 2c. Bo / vát / khoét theo VÙNG (mô tả lời)

Trước đây fillet/chamfer chỉ "bo hết cạnh" hoặc phải **pick từng cạnh trong viewport**; shell phải pick mặt. Giờ AI làm theo **mô tả lời**:

- `features.ts`: thêm `EdgeRegion` = {all, top, bottom, vertical, horizontal} cho `FilletFeature`/`ChamferFeature.region`; `FaceRegion` = {top, bottom, front, back, left, right} cho `ShellFeature.region`.
- `rebuild.ts`: `edgesInRegion()` / `facesInRegion()` giải vùng bằng **hình học** (so sánh với bounding box `shapeBounds`), trả filter `inList`. Trục "lên" = **+Y** (sketch mặt `top` đùn theo +Y nên "trên/dưới" = mặt Y lớn/nhỏ nhất; "vertical" = cạnh trải dài theo Y; "horizontal" = cạnh Y gần như không đổi). fillet/chamfer ưu tiên `edges` (đã pick) → `region` → all; shell ưu tiên `faces` → `region`.
- `design.ts`: thêm shape `"shell"` + trường `edgeRegion`/`faceRegion`/`thickness`; `designToFeatures` tạo `ShellFeature` (default open top) và gắn `region` cho fillet/chamfer (default all).
- `chat.ts`: thêm `"shell"` vào enum shape + `edgeRegion`/`faceRegion`/`thickness` trong tool schema + hướng dẫn trong system prompt ("bo hết cạnh trên 3mm", "khoét rỗng dày 2mm").

Test (trong `aiDesign.runtime.test.ts`, dùng part mặt `top` để Y là trục lên): fillet "all" vs "top" đổi hình học khác nhau (top bo ít cạnh hơn); shell mở mặt trên/dưới đều dựng 1 khối và khoét rỗng (nhiều đỉnh hơn khối đặc).

## 3. File đụng tới
- `src/ai/design.ts` — `ModifyOp`, `Design.modify`, `applyModify`, `resizeSketch`; shape `"shell"` + `edgeRegion`/`faceRegion`/`thickness`.
- `src/ai/api.ts` — `chat()` nhận thêm tham số `selected`, gửi trong body.
- `src/state/store.ts` — `sendChat` áp `applyModify` + gửi tên feature đang chọn; `explainSelected`; import `applyModify`.
- `src/features.ts` — `EdgeRegion`/`FaceRegion`; `region` trên Fillet/Chamfer/Shell.
- `src/kernel/rebuild.ts` — `shapeBounds`/`edgesInRegion`/`facesInRegion`; fillet/chamfer/shell dùng region khi không pick.
- `src/ui/Toolbar.tsx` — nút 🔍 Giải thích.
- `functions/api/chat.ts` — `body.selected` → context; `modify` + `shell`/region trong tool schema; hướng dẫn trong system prompt.
- `src/ai/aiDesign.runtime.test.ts` — 5 case `modify` + 6 case region (fillet top/all, shell top/bottom).

## 4. Kiểm thử
`NODE_OPTIONS=--use-system-ca npm test` → **8/8 bộ ALL PASS**. Case modify mới: đổi chiều cao box, đổi Ø lỗ (resize sketch), nới rộng box, khớp theo id + bỏ qua target lạ, đổi bán kính fillet.

> ⚠️ **Lưu ý hệ trục trên mặt `top`:** chiều cao đùn nằm theo **Y** (bbox dy), `w` theo X (dx), `d` theo Z (dz) — nhớ khi assert hình học trong test.

Build xanh · quét selector zustand sạch (không selector nào trả mảng/object mới).

---

## 5. Còn lại (như cũ)
- Text → biên dạng đùn (opentype.js + .ttf).
- Tham số hoá + pick/đo ellipse & spline.
- Power‑trim kéo rê.
- Ren trong / lỗ taro (boolean với khối ren xoắn còn nghẹn trong OCC đơn luồng).
- **Kiểm thử mắt thủ công** toàn bộ trên trình duyệt.

---

*Sản phẩm: Torotic CAD · Thuộc chương trình Torotic AI · Thư mục: `Code3DCad` · Live: torotic‑cad.pages.dev*
