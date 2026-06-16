# Torotic CAD — Nhật ký phát triển (2026‑06‑17 · tổng hợp đợt)

> Tiếp nối 2026‑06‑15/16. Đợt này: **mở rộng mạnh Trợ lý AI**, **liên thông file (import STEP/STL)**, và **tool báo lỗi cho bản dùng thật**.
> Trạng thái luôn‑mới ở `docs/STATUS.md`. **Torotic CAD** — CAD 3D tham số chạy trình duyệt theo logic SolidWorks, deploy Cloudflare Pages (`torotic‑cad.pages.dev`).

---

## 0. TL;DR đợt này
1. **Trợ lý AI gần đủ bộ primitive CAD** — giờ chat vẽ/sửa/giải thích được hầu hết khối cơ bản.
2. **Nhập STEP/STL** để vẽ tiếp trên mô hình có sẵn.
3. **Tool báo lỗi / góp ý** trong app (Cloudflare D1) — chuẩn bị triển khai cho mọi người.

Tất cả: build xanh · **8/8 bộ test ALL PASS** · quét selector zustand sạch · đã deploy.

---

## 1. Trợ lý AI — mở rộng (7 commit)

Mỗi tính năng đều: thêm vào `apply_design` (tool schema + system prompt trong `functions/api/chat.ts`) + xử lý trong `designToFeatures`/`applyModify` (`src/ai/design.ts`) + test runtime trong `aiDesign.runtime.test.ts`.

| Commit | Tính năng |
|---|---|
| `103e0d7` | **Sửa tham số (`modify`)** — đổi số đo feature CÓ SẴN (chiều cao, Ø lỗ/trụ, rộng/sâu hộp = resize sketch, bán kính fillet, góc revolve, pitch ren, count pattern, độ dày shell) thay vì xoá‑dựng‑lại. **+ AI biết feature đang chọn** (gửi tên feature đang chọn sang chat → hiểu "cái này"). |
| `2b3b565` | **🔍 Giải thích feature đang chọn** (nút toolbar, chỉ giải thích không vẽ). **+ Bo/vát/khoét theo VÙNG** — fillet/chamfer `edgeRegion` (all/top/bottom/vertical/horizontal), shell `faceRegion`; giải bằng hình học trong `rebuild.ts` (`edgesInRegion`/`facesInRegion`, trục lên = +Y). |
| `27ae0d0` | **Revolve** — khối tròn xoay (trục/chốt/bạc/núm/cổ chai): profile [x,y] + `revolveAxis` u/v + `totalAngle`. |
| `1dbe3e4` | **Sweep + Loft** — sweep ống/dây cong (profileDiameter + pathPoints, cố định plane front/right đã chứng minh chạy); loft nối tiết diện (`loftSections` tròn/chữ nhật/tự do theo offset). |
| `41771c9` | **Text → biên dạng đùn** — opentype.js + bundle Roboto (có dấu tiếng Việt); `src/sketch/text.ts` (glyph → tessellate → sketch, holes do region finder); nút 🔤 Text (offline) + AI shape `text`. |
| `8e183dd` | **Gân/Rib** — gusset tam giác/chữ nhật đứng, đùn midplane ôm tường, fuse vào khối. |

**Bộ vẽ được của AI giờ:** box, cylinder, hole (trơn/bậc/chìm), slot, polygon, regularPolygon, boltCircle, thread, **revolve, sweep, loft, text, rib** + fillet/chamfer/shell (theo vùng) + mirror/pattern + **modify** + giải thích.

### Bài học (gotcha)
- **Mặt `top` mặc định đùn theo +Y** → "trên/dưới" và chiều cao nằm trên trục Y (không phải Z) khi assert hình học/region.
- **opentype.js 2.0 là CJS** — dưới tsx `parse` nằm ở `.default` (test tự dò `ot.parse ?? ot.default.parse`); Vite dùng named `parse` từ bản mjs.
- Tách `text.ts` (thuần) khỏi `loadFont.ts` (có Vite `?url`) để Node test không vướng `?url`.

---

## 2. Nhập STEP/STL (`2092386`)

Nút **📥 Nhập STEP/STL** → đọc bằng OpenCASCADE (`importSTEP`/`importSTL` qua B‑rep, dựng tiếp được) thành **một khối trong cây** (`ImportFeature`, base64 → project tự chứa + save/load + export kèm). Vẽ tiếp như khối thường; panel feature đổi Khối riêng/Cộng/Trừ + Xoá.

**Điểm kỹ thuật:** `importSTEP`/`importSTL` async, nhưng `rebuildBodies` SYNC (nhiều test phụ thuộc) → KHÔNG đổi rebuild sang async. Thay vào đó **cache shape theo nội dung** (`importCache`/`importKey`); `ensureImports()` async parse các import chưa cache; `store.rebuild()` (chokepoint duy nhất) + `exportModel()` `await ensureImports()` trước → không re‑parse khi sửa feature khác.

---

## 3. Tool báo lỗi / góp ý (`b05a99a`) — cho bản dùng thật

> Phỏng theo README quy trình feedback (vốn cho stack Supabase+Vercel của **ERP**), **chuyển sang đúng kiến trúc CAD** (web tĩnh Cloudflare Pages, không Supabase): backend = Pages Function + **Cloudflare D1**.

- Nút nổi **🐞 Báo lỗi** (luôn hiện) → modal: loại (lỗi/tính năng) + mô tả + module → **tự đính kèm ảnh viewport + cây tính năng JSON + version/URL/trình duyệt** → `POST /api/feedback` lưu D1.
- **Admin** tại `…/#feedback-admin` (nhập `FEEDBACK_ADMIN_KEY`): danh sách + lọc trạng thái + ảnh + cây + đổi trạng thái (moi→dang_xem→dang_lam→da_xong/tu_choi) + ghi chú/lý do từ chối.
- File: `functions/api/feedback.ts`, `src/ui/FeedbackButton.tsx`, `src/ui/FeedbackAdmin.tsx`, schema `docs/feedback-schema.sql`.

### ⚠️ CẦN SETUP 1 LẦN trước khi dùng (xem `docs/FEEDBACK-SETUP.md`)
1. Tạo **D1 database** (Cloudflare → Workers & Pages → D1).
2. Chạy `docs/feedback-schema.sql` (D1 Console).
3. **Bind D1 tên `DB`** vào Pages project (Settings → Functions → D1 bindings, Prod+Preview).
4. Đặt env **`FEEDBACK_ADMIN_KEY`** (Prod+Preview).
5. Deploy lại.

→ Chưa làm bước này thì `/api/feedback` trả 500, nút báo lỗi sẽ báo "Không gửi được".

---

## 4. Mốc commit đợt (mới → cũ)
```
b05a99a Feature: in-app feedback / bug-report tool (Cloudflare D1)
2092386 Feature: import STEP/STL files as a body to keep modeling on
8e183dd AI: assistant can add stiffening ribs / gussets
41771c9 AI + tool: Text → extruded profile (engrave/emboss lettering)
1dbe3e4 AI: assistant can draw sweeps and lofts
27ae0d0 AI: assistant can draw revolved (turned) parts
2b3b565 AI: explain selected feature + fillet/chamfer/shell by region
103e0d7 AI: edit existing features parametrically (modify) + sees selection
```

## 5. Còn lại / nên làm tiếp
- **Test mắt thật trên trình duyệt** loạt primitive AI (revolve/sweep/loft/text/rib — hình học khó) → sửa chỗ lệch. *(Đang là việc giá trị nhất.)*
- **Hoàn tất setup D1** cho tool báo lỗi (5 bước ở trên) rồi thử end‑to‑end.
- Tinh chỉnh Text (khắc chìm tự căn mặt trên, căn lề, độ mịn nét).
- AI sửa nâng cao (di chuyển/xoay/đổi mặt phẳng feature).
- Tối ưu tải trang (bundle JS ~1.2MB + WASM 11MB + font 0.5MB → code‑split).

---

*Sản phẩm: Torotic CAD · Thuộc chương trình Torotic AI · Thư mục: `Code3DCad` · Live: torotic‑cad.pages.dev*
