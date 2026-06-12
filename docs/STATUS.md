# Torotic CAD — Tổng quan trạng thái dự án

> File này tóm tắt tình trạng dự án để đọc nhanh khi quay lại. Cập nhật lần cuối: **2026-06-13**.

## 1. Dự án là gì
**Torotic CAD** — web app CAD 3D tham số kiểu SolidWorks (sketch → ràng buộc → feature → khối B-rep → cây tính năng). Thư mục: `c:\Users\Admin\Desktop\CodeRoadMap`.

- **Stack:** React 18 + TypeScript + Vite 5.4 + three.js + zustand + replicad (OpenCASCADE WASM, bản single-thread ~11MB).
- **Build:** `npm run build` (`tsc -b && vite build`) → thư mục `dist`.

## 2. Triển khai (deploy)
- **Live:** https://torotic-cad.pages.dev
- **Hạ tầng:** Cloudflare **Pages** (KHÔNG phải Worker — Workers Builds cần Vite 6, ta dùng Vite 5), git-connected, tự deploy mỗi lần `git push` lên `main`.
- **Repo:** github.com/toroticvn/torotic-cad (tác giả commit: `torotic.vn@gmail.com`).
- Cấu hình: build command `npm run build`, output `dist`, Node ghim bằng `.nvmrc=20`, `public/_headers` cache `/assets/*`.

## 3. Tính năng AI (Claude)
Backend = **Cloudflare Pages Functions** (`functions/api/*.ts`), gọi Claude `claude-opus-4-8`. Có 3 nút trên thanh công cụ + 1 nút thủ công:
- **🪄 AI vẽ** (`/api/generate`, tool use) — mô tả bằng lời → dựng khối 3D.
- **💬 Trợ lý AI** (`/api/chat`) — chat hỏi đáp, AI thấy ảnh viewport + cây tính năng.
- **✨ Đánh giá** — gửi câu hỏi đánh giá vào chat.
- **📋 Claude.ai** — đường thủ công, miễn phí bằng gói Pro/Max (tải ảnh + copy prompt + mở claude.ai).

### ⚠️ Điều quan trọng về AI (đã trả giá để học)
- **Claude API ≠ gói Claude Pro/Max** — tính tiền riêng. Phải nạp credit API ở console.anthropic.com (đã nạp $5).
- **Lỗi 403 "Request not allowed"** khi Cloudflare gọi Anthropic = Cloudflare định tuyến qua node bị chặn (Hong Kong). **Cách chữa đã áp dụng:** dùng **Cloudflare AI Gateway** (gateway tên `torotic`, đã **tắt Authenticated Gateway**) + biến env `CF_AI_GATEWAY` trong Pages.
- **Key env (Cloudflare Pages → Settings → Variables):** `ANTHROPIC_API_KEY` (secret) + `CF_AI_GATEWAY` (plaintext, = `https://gateway.ai.cloudflare.com/v1/<account>/torotic/anthropic`).
- Đổi model rẻ hơn: sửa hằng `MODEL` trong `functions/api/chat.ts` / `generate.ts`.

## 4. Công cụ Sketch đã clone từ SolidWorks
Kiến trúc thêm 1 tool: (1) `SketchTool` union trong `store.ts`; (2) nút trong `SketchRibbon.tsx`; (3) entry trong `PropertyManager.tsx` `TOOL_INFO` (Record — bắt buộc đủ key); (4) hành vi trong `SketchController.ts` (`handleDraw`/`drawXxx` + preview, hoặc click-tool thêm nhánh trong `onPointerDown` + danh sách `noDraw`). Multi-click dùng `this.chain`.

| Nhóm | Đã có |
|---|---|
| **Đối tượng** | Đường, Đường tâm, Điểm, Chữ nhật (góc/tâm/3 điểm), Hình bình hành, Tròn (tâm / 3 điểm), Ellipse, Spline, Đa giác, Cung (tâm/3 điểm/tiếp tuyến), Slot |
| **Sửa** | Trim, Fillet, Chamfer |
| **Biến đổi** | Offset (chọn cạnh + chiều ra/vào), Mirror, Pattern thẳng, Pattern tròn |
| **Quan hệ** | Ngang, Dọc, Song song, Vuông góc, Thẳng hàng, Bằng nhau, Trùng điểm, Trung điểm, Đối xứng, Đồng tâm, Tiếp tuyến, Cố định/Bỏ cố định, Đổi nét dựng |
| **Kích thước** | Smart Dimension (khoảng cách, bán kính) |

### File chính của sketch
- `src/sketch/model.ts` — kiểu dữ liệu sketch (points/lines/circles/arcs/ellipses/splines/constraints/dimensions).
- `src/sketch/SketchController.ts` — vẽ, chọn, preview, render 2D.
- `src/sketch/solveSketch.ts` + `src/sketch/solver/` — bộ giải ràng buộc (Levenberg–Marquardt).
- `src/sketch/transform.ts` — mirror / pattern / offset (cloneEntities, reflectAcross, rotateAbout, offsetEntities).
- `src/sketch/curves.ts` — lấy mẫu ellipse + spline (Catmull-Rom).
- `src/kernel/profile.ts` — `expandForProfile()` chia nhỏ ellipse/spline thành đoạn trước khi tìm vùng để đùn.

## 5. CHƯA làm (khó hơn — buổi sau)
- **Convert entities** — chiếu cạnh khối 3D lên sketch (cần ghép picking cạnh 3D + chiếu).
- **Text** — chữ → biên dạng đùn (cần thư viện font, vd opentype.js).
- **Move/Rotate/Scale tại chỗ, Extend, kích thước góc.**
- Gán **kích thước/ràng buộc cho ellipse & spline** (hiện chỉ vẽ + đùn, chưa tham số hoá đầy đủ).

## 6. Tình trạng kiểm thử
Tất cả công cụ Đợt 1–5 **build pass + đã deploy**, nhưng **chưa kiểm bằng mắt trên trình duyệt**. Cần test thực tế: vẽ thử từng tool, kiểm hình ra đúng; đặc biệt Offset (chiều ra/vào với hình hở), Mirror/Pattern, Ellipse/Spline đùn khối.

## 7. Gotcha môi trường máy (Windows này)
- Phần mềm kiểm tra SSL/mạng gây lỗi: Node/npm cần `NODE_OPTIONS=--use-system-ca`; git cần `http.sslBackend schannel`; Chrome lỗi `ERR_QUIC_PROTOCOL_ERROR` (dùng Firefox hoặc tắt QUIC); dashboard Cloudflare thỉnh thoảng 500/404 (tải lại / Firefox).
- KHÔNG dùng cách tắt bảo mật (`strict-ssl false`, `sslVerify false`).

## 8. Lệnh hay dùng
```powershell
# Build (máy này cần --use-system-ca)
$env:NODE_OPTIONS = "--use-system-ca"; npm run build

# Deploy = chỉ cần push, Cloudflare tự build
git add -A; git commit -m "..."; git push origin main
```
