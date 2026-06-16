# Torotic CAD — Tổng quan trạng thái dự án

> File này tóm tắt tình trạng dự án để đọc nhanh khi quay lại. Cập nhật lần cuối: **2026-06-16** (Trợ lý AI sửa tham số feature có sẵn + biết feature đang chọn).

## 1. Dự án là gì
**Torotic CAD** — web app CAD 3D tham số kiểu SolidWorks (sketch → ràng buộc → feature → khối B-rep → cây tính năng). Thư mục: `c:\Users\Admin\Desktop\Code3DCad`.

- **Stack:** React 18 + TypeScript + Vite 5.4 + three.js + zustand + replicad (OpenCASCADE WASM, bản single-thread ~11MB).
- **Build:** `npm run build` (`tsc -b && vite build`) → thư mục `dist`.

## 2. Triển khai (deploy)
- **Live:** https://torotic-cad.pages.dev
- **Hạ tầng:** Cloudflare **Pages** (KHÔNG phải Worker — Workers Builds cần Vite 6, ta dùng Vite 5), git-connected, tự deploy mỗi lần `git push` lên `main`.
- **Repo:** github.com/toroticvn/torotic-cad (tác giả commit: `torotic.vn@gmail.com`).
- Cấu hình: build command `npm run build`, output `dist`, Node ghim bằng `.nvmrc=20`, `public/_headers` cache `/assets/*`.

## 3. Tính năng AI (Claude)
Backend = **Cloudflare Pages Functions** (`functions/api/*.ts`), gọi Claude `claude-opus-4-8`. Có 3 nút trên thanh công cụ + 1 nút thủ công:
- **💬 Trợ lý AI (agentic)** (`/api/chat`) — **vừa tư vấn vừa TỰ VẼ/TỰ SỬA**. Claude có công cụ `apply_design` (tool use, `tool_choice` auto): hỏi → trả lời/hướng dẫn; bảo "vẽ…/khoan lỗ…/thêm trụ…" → tự dựng ngay trong app kèm giải thích. AI thấy ảnh viewport + cây tính năng mỗi lượt.
  - Chế độ **append** (vẽ tiếp): nếu đã có khối, design mới được nối vào cây hiện tại (op đầu thành add/cut thay vì new). Xem `designToFeatures(design, { continueSolid, nameStart })` + `sendChat` trong store.
  - **Sửa tham số (parametric `modify`) — mới 2026-06-16:** thay vì xoá-dựng-lại, AI sửa thẳng số đo của feature đã có qua mảng `modify[]` (`{ target: tên/id feature, … }`): extrude `distance/height`, lỗ/trụ `diameter`, hộp `width`/`depth` (tự resize sketch tiết diện), fillet/chamfer `radius`, revolve/draft `angle`, thread `diameter`/`pitch`/`length`, shell `thickness`, pattern `count`/`dx`/`dy`/`dz`/`angle`/`axis`. Hàm thuần `applyModify(features, modify)` trong `src/ai/design.ts` (`resizeSketch`: đường tròn → r=Ø/2, chữ nhật → scale bbox quanh tâm). System prompt dạy AI **ưu tiên `modify`** khi chỉ đổi số đo; chỉ xoá-dựng-lại khi đổi KIỂU hình.
  - **Biết feature đang chọn:** store gửi TÊN feature đang chọn sang `/api/chat` (`chat(messages, image, features, selected)`) → AI hiểu "cái này"/"feature này" là feature đó.
  - **Hình vẽ được:** box, cylinder, hole (**simple / counterbore lỗ bậc / countersink lỗ chìm** — `holeType` + topOffset), fillet, chamfer, **polygon (biên dạng tự do theo [x,y])**, **regularPolygon (lục giác/bát giác — đai ốc, đầu bu-lông)**, **slot (rãnh / lỗ ô-van)**, **boltCircle (mặt bích nhiều lỗ trên PCD)**, **mirror (cả khối, có merge)**, **patternLinear / patternCircular**. Gân tăng cứng = polygon mỏng; ren = tạm coi lỗ trơn. Có thể **xoá feature** qua mảng `delete` (theo tên/id, để "đổi kích thước" = xoá + dựng lại).
- **🪄 AI vẽ** (`/api/generate`, tool use ép buộc) — hộp thoại mô tả 1 lần → dựng khối mới (đường tắt; chat làm được nhiều hơn).
- **✨ Đánh giá** — gửi câu hỏi đánh giá vào chat.
- **📋 Claude.ai** — đường thủ công, miễn phí bằng gói Pro/Max (tải ảnh + copy prompt + mở claude.ai).

> Pipeline "AI vẽ" được kiểm bằng `src/ai/aiDesign.runtime.test.ts` (design → feature → khối thật, cả replace lẫn append + khoan lỗ + boss + fillet).
>
> **Sketch AI có ràng buộc để sửa/đo được:** chữ nhật AI có quan hệ ngang/dọc + neo 1 góc (fixed); đường tròn AI neo tâm. Nhờ vậy khi vào Sửa sketch + ghi kích thước (width/height/Ø), hình giữ đúng dạng (parametric) thay vì bị méo/trôi do thiếu ràng buộc.

### ⚠️ Điều quan trọng về AI (đã trả giá để học)
- **Claude API ≠ gói Claude Pro/Max** — tính tiền riêng. Phải nạp credit API ở console.anthropic.com (đã nạp $5).
- **Lỗi 403 "Request not allowed"** khi Cloudflare gọi Anthropic = Cloudflare định tuyến qua node bị chặn (Hong Kong). **Cách chữa đã áp dụng:** dùng **Cloudflare AI Gateway** (gateway tên `torotic`, đã **tắt Authenticated Gateway**) + biến env `CF_AI_GATEWAY` trong Pages.
- **Key env (Cloudflare Pages → Settings → Variables):** `ANTHROPIC_API_KEY` (secret) + `CF_AI_GATEWAY` (plaintext, = `https://gateway.ai.cloudflare.com/v1/<account>/torotic/anthropic`).
- Đổi model rẻ hơn: sửa hằng `MODEL` trong `functions/api/chat.ts` / `generate.ts`.

## 4. Công cụ Sketch đã clone từ SolidWorks
Kiến trúc thêm 1 tool: (1) `SketchTool` union trong `store.ts`; (2) nút trong `SketchRibbon.tsx`; (3) entry trong `PropertyManager.tsx` `TOOL_INFO` (Record — bắt buộc đủ key); (4) hành vi trong `SketchController.ts` (`handleDraw`/`drawXxx` + preview, hoặc click-tool thêm nhánh trong `onPointerDown` + danh sách `noDraw`). Multi-click dùng `this.chain`.

| Nhóm | Đã có |
|---|---|
| **Đối tượng** | Đường, Đường tâm, Điểm, Chữ nhật (góc/tâm/3 điểm), Hình bình hành, Tròn (tâm / 3 điểm), Ellipse, Spline, Đa giác, Cung (tâm/3 điểm/tiếp tuyến), Slot thẳng, **Slot cung (centerpoint arc slot — outline tessellate, test `arcSlot.runtime.test.ts`)** |
| **Sửa** | Trim, Extend, **Split (chia line/cung tại điểm click)**, Fillet, Chamfer, Convert entities (chiếu cạnh khối đồng phẳng) |
| **Biến đổi** | Offset (chọn cạnh + chiều ra/vào), Mirror, **Dynamic Mirror (chọn đường tâm → bật → vẽ tới đâu tự đối xứng tới đó, có quan hệ symmetric)**, Pattern thẳng, Pattern tròn, Move, Copy, Rotate, Scale — nút trên ribbon (nhóm "Biến đổi"); tham số ở panel trái |
| **Quan hệ** | Ngang, Dọc, Song song, Vuông góc, Thẳng hàng, Bằng nhau, Trùng điểm, Trung điểm, **Trên cạnh (point-on-edge)**, Đối xứng, Đồng tâm, Tiếp tuyến, Cố định/Bỏ cố định, Đổi nét dựng |
| **Kích thước** | Smart Dimension: **1 cạnh = dài, 2 cạnh = GÓC, tròn = ĐƯỜNG KÍNH (Ø), 2 điểm = khoảng cách** (thước tự nhận, giống SolidWorks; bán kính R vẫn có trong model) |

> **Point-on-edge:** công cụ Line **tự bắt điểm vào cạnh** (snap) và thêm ràng buộc `pointOnLine` → đầu mút bám trên cạnh, trượt dọc cạnh khi đổi góc (không còn lệch ra ngoài). Cũng thêm thủ công: chọn 1 điểm + 1 cạnh → nút "Trên cạnh". Test: `src/sketch/pointOnLine.test.ts`.

### Feature 3D (khối)
Ngoài Extrude / Revolve / Loft / Sweep / Fillet / Chamfer (đã có từ trước):
- **Extrude end conditions:** Blind, **Mid Plane** (đối xứng), **Đảo chiều** (cắt vào mặt).
- **Shell** (khoét rỗng — chọn mặt để hở, đặt độ dày thành) — nút "▢ Shell".
- **Draft** (vát mặt nghiêng cho khuôn — chọn mặt + góc + mặt phẳng gốc) — nút "◹ Draft".
- **Mirror khối** + **Pattern thẳng/tròn cả khối** (nút trên thanh công cụ).
- **Pattern theo Feature** (▦/🔄) và **Mirror theo Feature** (🪞) — lặp/soi gương MỘT feature (vd 1 lỗ → vòng lỗ). Bấm trên panel khi chọn 1 extrude/revolve.
- **Mirror — logic giống SolidWorks (3 cấp):**
  - *Sketch Mirror* (chọn đối tượng + 1 đường tâm → Mirror): bản copy **liên kết parametric** với bản gốc bằng quan hệ **symmetric** (đối xứng) + **equalRadius** cho đường tròn — sửa bản gốc thì bản mirror tự đổi theo (đúng như SW), không còn là copy "chết".
  - *Feature Mirror* (🪞) & *Body Mirror* (Mirror khối): mặt phẳng soi gương chọn được trong dropdown gồm 3 mặt chuẩn **và mọi Datum plane** trong cây (`mirrorArgs()` trong `rebuild.ts` đổi datum→`.mirror(planeName, origin)`).
  - *Body Mirror* có tùy chọn **"Gộp khối" (Merge solids)** giống SW: bật = fuse thành 1 khối; tắt = giữ **khối riêng** (multi-body → làm phiên bản đối xứng tay trái/phải). Tham khảo: GoEngineer "How to Mirror Parts in SolidWorks".
- **Ren xoắn THẬT (🌀 Ren):** ren ngoài dạng helix thật — lõi đường kính chân + gân ren xoắn (genericSweep dọc `makeHelix` với `auxiliarySpine` + `forceProfileSpineOthogonality`) đùn tới đường kính đỉnh. Tham số ở panel: đường kính, bước ren (pitch), chiều dài, vị trí X/Y/Z, trục (x/y/z). AI gọi được qua shape `"thread"`.
  - **Là KHỐI RIÊNG (multi-body):** ren luôn tạo body riêng (vd bu-lông = đầu + thân ren cạnh nhau). Lý do: trong OCC WASM đơn luồng, **boolean fuse/cut với khối ren xoắn bị treo hoặc cho khối lỗi** — nên không gộp/khoét vào khối khác.
  - **Hạn chế đã biết (v1):** chưa làm **ren trong / lỗ taro** (cần phép cut — đang treo); mép ren thừa ~1 bước (thread lead) ở 2 đầu vì cắt phẳng đầu ren cũng làm boolean nghẹn. Kiểm bằng `src/kernel/thread.runtime.test.ts` (ren theo Z & X, đường kính đỉnh, chiều dài, multi-body).
- **Reference geometry:** Datum plane (▭ Mặt phẳng) — mặt phẳng song song + offset, sketch được lên đó.

Cơ chế: các feature này nằm trong cây tính năng, sửa số trong panel "Thuộc tính Feature" → tự dựng lại. Trong `rebuild.ts` chúng biến đổi khối hiện hành bằng `clone()` + `mirror/translate/rotate` + `fuse` (Mirror/Pattern) hoặc `shell(thickness, f=>f.inList(faces))` (Shell, khớp mặt bằng `matchFaces` theo điểm chọn).

### File chính của sketch
- `src/sketch/model.ts` — kiểu dữ liệu sketch (points/lines/circles/arcs/ellipses/splines/constraints/dimensions).
- `src/sketch/SketchController.ts` — vẽ, chọn, preview, render 2D.
- `src/sketch/solveSketch.ts` + `src/sketch/solver/` — bộ giải ràng buộc (Levenberg–Marquardt).
- `src/sketch/transform.ts` — mirror / pattern / offset (cloneEntities, reflectAcross, rotateAbout, offsetEntities).
- `src/sketch/curves.ts` — lấy mẫu ellipse + spline (Catmull-Rom).
- `src/kernel/profile.ts` — `expandForProfile()` chia nhỏ ellipse/spline thành đoạn trước khi tìm vùng để đùn.

## 5. CHƯA làm (khó hơn — buổi sau, cần test)
- **Text** — chữ → biên dạng đùn. Cần thư viện font (opentype.js) + bundle 1 file .ttf + chuyển glyph outline → đoạn/đường trong sketch. Là việc nhiều bước, nên làm khi có thể test trực tiếp trên trình duyệt (không làm "mù" được).
- **Slot biến thể** (centerpoint arc slot, 3-point arc slot).
- **Power trim kéo rê** (hiện Trim là click-xoá-cả-đối-tượng).
- Gán **kích thước/ràng buộc cho ellipse & spline** (hiện chỉ vẽ + đùn, chưa tham số hoá đầy đủ); ellipse/spline cũng **chưa pick/select được**.

## 6. Kiểm thử tự động (không cần thao tác trình duyệt)
Chạy `NODE_OPTIONS=--use-system-ca npm test` — nạp WASM OpenCASCADE thật trong Node và kiểm tra logic dựng hình:
- `src/sketch/mirrorSketch.test.ts` — **Sketch Mirror parametric**: sửa bản gốc → bản mirror đi theo (symmetric), đổi kích thước → mirror bằng bán kính (equalRadius), mirror qua trục nghiêng.
- `src/kernel/mirror.runtime.test.ts` — **Body/Feature Mirror 3D**: merge on/off (1 khối vs 2 khối tách), mirror qua YZ/XZ, mirror feature qua **datum plane** — kiểm bằng bounding box.
- `src/kernel/rebuild.runtime.test.ts`, `profile.runtime.test.ts` — extrude/cut/revolve/loft/sweep/fillet/export/slot.
- Helper nạp WASM: `src/kernel/loadOC.ts` (xử lý interop double-`default` của emscripten; bị loại khỏi `tsc` build vì dùng node API).
- `npm run test:mirror` chỉ chạy 2 bộ Mirror.

## 7. Tình trạng kiểm thử thủ công
Tất cả công cụ Đợt 1–9 **build pass + đã deploy**, nhưng **chưa kiểm bằng mắt trên trình duyệt**. Cần test thực tế từng tool: đặc biệt Offset (chiều ra/vào), Mirror/Pattern, Move/Rotate/Scale (tâm = trọng tâm cụm chọn), Ellipse/Spline đùn khối, Extend (kéo tới giao điểm), Convert (chiếu cạnh đồng phẳng — nên dùng khi sketch trên một mặt khối), quan hệ Tiếp tuyến/Đồng tâm, và kích thước Góc.

## 8. Gotcha môi trường máy (Windows này)
- Phần mềm kiểm tra SSL/mạng gây lỗi: Node/npm cần `NODE_OPTIONS=--use-system-ca`; git cần `http.sslBackend schannel`; Chrome lỗi `ERR_QUIC_PROTOCOL_ERROR` (dùng Firefox hoặc tắt QUIC); dashboard Cloudflare thỉnh thoảng 500/404 (tải lại / Firefox).
- KHÔNG dùng cách tắt bảo mật (`strict-ssl false`, `sslVerify false`).

## 9. Lệnh hay dùng
```powershell
# Build (máy này cần --use-system-ca)
$env:NODE_OPTIONS = "--use-system-ca"; npm run build

# Test logic dựng hình (không cần trình duyệt)
$env:NODE_OPTIONS = "--use-system-ca"; npm test

# Deploy = chỉ cần push, Cloudflare tự build
git add -A; git commit -m "..."; git push origin main
```
