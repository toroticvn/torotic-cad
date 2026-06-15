# Torotic CAD — Nhật ký phát triển (cập nhật 2026‑06‑15)

> Tiếp nối bản 2026‑06‑12. File này ghi **những gì làm thêm** từ 12→15/06.
> Bản tổng quan trạng thái luôn‑mới ở `docs/STATUS.md`; chi tiết Mirror ở `docs/HUONG-DAN-MIRROR.md`.
> **Torotic CAD** — CAD 3D tham số chạy trình duyệt theo logic SolidWorks.

---

## 0. TL;DR đợt này
Hai trục lớn: (1) **Trợ lý AI agentic** — chat là vẽ/sửa được khối thật; (2) **bồi đắp bộ công cụ Sketch** cho giống SolidWorks (Đợt 1–9) + sửa các lỗi khiến sketch do AI vẽ không sửa/đo được.

---

## 1. Trợ lý AI agentic (điểm nhấn lớn nhất)

Trước đây AI chỉ "tư vấn" hoặc "vẽ 1 phát". Giờ **chat = vừa trả lời vừa TỰ VẼ/TỰ SỬA** ngay trong app.

- **Backend:** Cloudflare **Pages Functions** `functions/api/chat.ts`, gọi Claude `claude-opus-4-8` qua **Cloudflare AI Gateway** (env `CF_AI_GATEWAY`) để tránh 403 do định tuyến.
- **Cơ chế:** Claude có công cụ `apply_design` (tool use, `tool_choice` auto, tương thích `thinking: adaptive`). Trả về `design` JSON → client gọi `designToFeatures()` (`src/ai/design.ts`) → dựng lại cây.
- **Append vs replace:** "vẽ tiếp" thì nối vào cây hiện có (`continueSolid`, `nameStart`); op đầu thành add/cut. Có mảng `delete` để xoá feature theo tên/id (⇒ "đổi kích thước" = xoá + dựng lại).
- **Hình AI vẽ được:** box, cylinder, hole (**simple / counterbore lỗ bậc / countersink lỗ chìm**), fillet, chamfer, polygon (biên dạng tự do), **regularPolygon** (đai ốc/đầu bu‑lông), **slot**, **boltCircle** (mặt bích nhiều lỗ trên PCD), **mirror** (có merge), **patternLinear / patternCircular**.
- **AI thấy bối cảnh:** ảnh viewport + cây tính năng mỗi lượt.

> Kiểm bằng `src/ai/aiDesign.runtime.test.ts` (design → feature → khối thật, replace+append, khoan lỗ, boss, fillet, polygon, mirror, pattern, counterbore, countersink, delete).

### Bài học đã trả giá (rất quan trọng)
- **Claude API ≠ gói Pro/Max** — tính tiền riêng, phải nạp credit ở console.anthropic.com.
- **403 "Request not allowed"** khi Cloudflare gọi Anthropic = đi qua node bị chặn → chữa bằng **AI Gateway** (gateway `torotic`, tắt Authenticated Gateway).
- **Key env (Pages → Variables):** `ANTHROPIC_API_KEY` (secret) + `CF_AI_GATEWAY` (plaintext).

---

## 2. Lỗi mạng khi chạy localhost → dev proxy

Triệu chứng: trình duyệt báo **"NetworkError when attempting to fetch resource"** khi gọi `/api/*`.

- **Nguyên nhân:** phần mềm kiểm tra SSL của máy chặn HTTPS POST từ trình duyệt tới `pages.dev` (Node lại chạy được nhờ `--use-system-ca`; đã xác nhận server trả 200 bằng probe Node).
- **Cách chữa:** thêm **dev proxy** trong `vite.config.ts` — `server.proxy["/api"]` → `https://torotic-cad.pages.dev` (`changeOrigin:true, secure:true`). Localhost gọi qua proxy ⇒ chạy bình thường (user đã xác nhận).
- **Tuyệt đối KHÔNG** tắt xác minh SSL.

---

## 3. Bộ công cụ Sketch — Đợt 1–9 (clone SolidWorks)

Quy ước thêm 1 tool: (1) `SketchTool` union trong `store.ts`; (2) nút trong `SketchRibbon.tsx`; (3) entry `TOOL_INFO` trong `PropertyManager.tsx` (Record — đủ key); (4) hành vi trong `SketchController.ts`.

| Nhóm | Bổ sung đợt này |
|---|---|
| **Đối tượng** | **Slot cung (centerpoint arc slot)** — outline tessellate (4 cung thật làm region finder fail nên cắt thành đoạn); test `arcSlot.runtime.test.ts`. |
| **Sửa** | **Split** (chia line/cung tại điểm click), **Extend** (kéo tới giao điểm), **Convert entities** (chiếu cạnh khối đồng phẳng). |
| **Biến đổi** | **Dynamic Mirror** (chọn đường tâm → bật → vẽ tới đâu tự đối xứng + quan hệ symmetric); Move/Copy/Rotate/Scale cụm chọn; tất cả lên ribbon nhóm "Biến đổi". |
| **Quan hệ** | **Trên cạnh (point‑on‑edge / `pointOnLine`)**. |
| **Kích thước** | **Smart Dimension thông minh:** 1 cạnh = dài · **2 cạnh song song = khoảng cách** · **2 cạnh vuông góc = chiều dài cạnh 1** · 2 cạnh xiên = **GÓC** · tròn = **ĐƯỜNG KÍNH (Ø)**. |

### Point‑on‑edge (sửa lỗi đầu mút trôi khỏi cạnh)
Công cụ Line **tự bắt điểm vào cạnh** (snap) + thêm ràng buộc `pointOnLine` (residual cross‑product = 0 trong `solveSketch.ts`) → đầu mút bám & trượt dọc cạnh khi đổi góc, không lệch ra ngoài. Cũng thêm tay: chọn điểm + cạnh → "Trên cạnh". Test `pointOnLine.test.ts`.

### Góc dương 0–180° & badge loại kích thước
- Angle dim luôn hiện **dương 0–180°** (đảo ref / abs nếu âm) — giống SolidWorks.
- `ParametersPanel` hiện **badge loại** (∠ / Ø / R / ↔) để user nhận diện & xoá đúng kích thước.

---

## 4. Fix: "AI ra 3D nhưng vào sửa sketch không được / không đo được"

Chuỗi lỗi user gặp khi mở lại sketch do AI dựng:

1. **Sketch AI thiếu ràng buộc** ⇒ vào sửa thì hình méo/trôi, ghi kích thước bị lệch.
   → **Fix:** AI sketch giờ có ràng buộc để **parametric & sửa được**: chữ nhật = 4 góc + ngang/dọc + **neo 1 góc** (`fixed`); đường tròn = **neo tâm**. (`rectSketch`/`circleSketch` trong `design.ts`.)
2. **Over‑Defined (vd d1=208°)** khi click 2 cạnh vuông góc → tạo angle dim xung đột với quan hệ ngang/dọc sẵn có.
   → **Fix:** Smart Dimension chuyển sang **song song→khoảng cách, vuông góc→chiều dài**, chỉ xiên mới ra **góc** ⇒ không còn over‑define. Badge ∠ giúp tìm & xoá dim sai.
3. **"Chấm tròn lạ" giữa hình chữ nhật AI** (user tưởng là lỗ).
   → **Chẩn đoán:** đó là **điểm góc của sketch** (mọi đỉnh hiển thị là chấm), KHÔNG phải lỗ; trông thụt vào vì khối xám là khối 3D **cũ** (lớn hơn) còn hiển thị trong lúc sửa — bấm **Xong** sẽ dựng lại đúng. Không phải bug.

---

## 5. Mirror — logic giống SolidWorks 3 cấp (hoàn thiện đợt này)

- **Sketch Mirror:** bản copy **liên kết parametric** với gốc bằng **symmetric** + **equalRadius** (sửa gốc → mirror tự đổi), không còn copy "chết".
- **Feature/Body Mirror:** mặt phẳng soi gương chọn được trong dropdown gồm 3 mặt chuẩn **và mọi Datum plane** (`mirrorArgs()` trong `rebuild.ts` đổi datum→`.mirror(name, origin)`).
- **Body Mirror có "Gộp khối (Merge solids)"**: bật = fuse 1 khối; tắt = giữ **khối riêng** (tay trái/phải). Tham khảo GoEngineer "How to Mirror Parts in SolidWorks".
- Test: `mirrorSketch.test.ts` (parametric) + `mirror.runtime.test.ts` (3D, merge on/off, qua datum plane).

---

## 6. Kiểm thử tự động (7 bộ, không cần trình duyệt)

`NODE_OPTIONS=--use-system-ca npm test` — nạp WASM OpenCASCADE thật trong Node (helper `src/kernel/loadOC.ts` xử lý interop double‑`default` của emscripten):
- `mirrorSketch.test.ts`, `mirror.runtime.test.ts` — Mirror sketch + 3D.
- `pointOnLine.test.ts` — ràng buộc trên cạnh.
- `arcSlot.runtime.test.ts` — slot cung đùn được (90/180/270°).
- `aiDesign.runtime.test.ts` — pipeline AI vẽ.
- `rebuild.runtime.test.ts`, `profile.runtime.test.ts` — extrude/cut/revolve/loft/sweep/fillet/export/slot.
- `npm run test:mirror` chỉ chạy 2 bộ Mirror.

---

## 7. Quy trình làm việc chuẩn (đã chốt)

```
sửa code
→ NODE_OPTIONS=--use-system-ca npm run build
→ quét selector zustand (cấm trả mảng/object mới):
   grep -rnE "useViewportStore\(\(s[t]?\) =>" src | grep -E "\.filter\(|\.map\(|\.slice\(|=> \[|=> \(\{"
→ NODE_OPTIONS=--use-system-ca npm test
→ git commit + push (Cloudflare tự build & deploy main)
→ cập nhật docs/STATUS.md
```

> ⚠️ **Quy tắc vàng zustand:** KHÔNG bao giờ trả về mảng/object MỚI từ selector → vòng lặp vô hạn / màn hình trắng.

---

## 8. Còn lại (buổi sau, cần test trực tiếp trình duyệt)
- **Kiểm thử thủ công bằng mắt** toàn bộ công cụ Đợt 1–9 (build pass + đã deploy, chưa soi mắt).
- **Text** → biên dạng đùn (cần opentype.js + bundle .ttf).
- **Ren thật** (helical thread) — hiện AI coi ren là lỗ trơn.
- Tham số hoá đầy đủ **ellipse & spline** (chưa pick/select/đo được).
- Power trim kéo rê (Trim hiện là click‑xoá‑cả‑đối‑tượng).

---

## 9. Mốc commit chính của đợt (mới → cũ)
```
b44563d Sketch: smarter dimensioning to avoid over-defining rectangles
b5e4f34 AI: give generated sketches relations so they're editable/dimensionable
4502d90 AI: hole wizard — counterbore & countersink holes
36441dc Sketch: Dynamic Mirror — mirror entities live as you draw
d9b33dc Sketch: centerpoint arc slot (curved slot)
1529b4a Sketch: Split tool — cut a line or arc into two at the clicked point
131b963 Sketch: diameter dimension (Ø) for circles
f16e92f AI: assistant can draw slots, regular polygons, and bolt-circle flanges
58b304b Sketch: angle dimensions as positive 0–180°
30742ce Sketch: point-on-edge relation (fix endpoints drifting off edges)
35ca718 Sketch: Smart Dimension measures angle between two lines
c5106d3 AI: assistant can draw polygons, mirror, patterns + delete features
45d38d8 dev: proxy /api to deployed Functions (works around browser TLS block)
df9a6ba AI: agentic assistant that draws & edits the model from chat
3e9dc1f UX: surface Mirror / Pattern / Offset on the sketch ribbon
```

---

*Sản phẩm: Torotic CAD · Thuộc chương trình Torotic AI · Thư mục: `CodeRoadMap` · Live: torotic‑cad.pages.dev*
