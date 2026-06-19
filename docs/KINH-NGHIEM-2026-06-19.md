# Kinh nghiệm triển khai tài khoản + đám mây (đúc kết 2026-06-17→19)

> Những bài học "trả giá" khi dựng đăng nhập + dự án đám mây + feedback trên Cloudflare, để sau khỏi vấp lại.

## 1. Đúng TÀI KHOẢN Cloudflare là quan trọng nhất
- App `torotic-cad.pages.dev` + repo GitHub + ANTHROPIC_API_KEY + AI Gateway nằm ở account **torotic.vn@gmail.com** (id `2ad68ba0…`).
- Có lúc đăng nhập nhầm account cá nhân **kaidant1234@gmail.com** (id `20ee393e…`, trống) → tạo D1 ở đó vô dụng.
- **Bài học:** mọi tài nguyên (D1, R2, binding, biến môi trường) phải ở **cùng account sở hữu project Pages**. Binding KHÔNG nối được qua account khác. Khi bí, kiểm account ID trên URL dashboard.

## 2. Binding nằm ở PROJECT, không ở trang D1
- Tạo D1 + chạy SQL ở trang D1, nhưng **gắn binding** thì vào **Workers & Pages → project → Settings → Bindings** (Variable name `DB`).
- **Phải Retry deployment** sau khi thêm binding/biến — binding chỉ có hiệu lực ở **bản deploy MỚI**. Quên bước này = vẫn lỗi y cũ.

## 3. D1 không cần thẻ; R2 cần thẻ
- Ban đầu định lưu file dự án ở **R2** (S3-like) → R2 bắt **thêm thẻ thanh toán** dù free tier.
- **Bài học:** **D1 free tier KHÔNG cần thẻ.** Đã chuyển lưu dự án thẳng vào D1 (cột `data`), giới hạn ~900KB/dự án. File nặng (nhúng STEP/STL) → dùng "💾 Lưu file" ra máy.

## 4. Footgun NODE_OPTIONS → đã bake vào script
- `npm run dev` thiếu `NODE_OPTIONS=--use-system-ca` → Vite dev proxy (`/api`→pages.dev) **500 / treo** trên máy này (SSL inspection), dù server vẫn tốt.
- **Bài học:** thứ máy-này-mới-cần thì **nhúng thẳng vào script** (đã thêm `cross-env NODE_OPTIONS=--use-system-ca` vào `dev`/`preview`) → khỏi nhớ. Giờ chỉ cần `npm run dev`.

## 5. Đừng probe bằng dữ liệu thật
- Lúc test endpoint signup, lỡ probe bằng **email thật của user** → tạo nhầm tài khoản với mật khẩu tạm. Phải làm thêm tính năng "đổi mật khẩu" + SQL dọn.
- **Bài học:** chẩn đoán endpoint dùng **email/throwaway** (`probe123@example.com`), không dùng dữ liệu thật của người dùng.

## 6. Phân biệt lỗi qua mã trạng thái khi probe
- `GET /api/projects`: **500** = D1 chưa bound / chưa deploy; **401** = đã bound, chỉ thiếu đăng nhập (tức là OK). Probe được giúp khoanh vùng nhanh "lỗi setup" hay "lỗi code".

## 7. Auth tự xây trên D1 — chốt kỹ thuật
- Mật khẩu hash **PBKDF2-SHA256** (Web Crypto); phiên = token ngẫu nhiên trong bảng `sessions` + cookie.
- Cookie cố ý **KHÔNG `Secure`** để chạy được qua localhost dev proxy (http); production vẫn HTTPS nên an toàn. `HttpOnly` + `SameSite=Lax`.

## 8. Chặn AI/Xuất ở SERVER, không chỉ client
- Tính năng tốn tiền (AI gọi Claude) phải chặn **server-side** (`/api/chat`,`/api/generate` trả 401 nếu chưa đăng nhập) — chặn client dễ bị lách. Client gate chỉ để UX (nhắc đăng nhập).

## 9. UI gọn dần khi tính năng nhiều
- Toolbar 30 nút 1 hàng → tràn → gom **menu thả xuống** (Dựng hình / Sửa / Mảng / Tệp / AI).
- Nút nổi (🐞 Báo lỗi) đè panel docked phải (chat) → cho **né vị trí** theo trạng thái panel.

---

## Trạng thái cuối ngày
- Đăng nhập + dự án đám mây (auto-save) + feedback + AI (gated) + đổi mật khẩu: **chạy thật** trên torotic-cad.pages.dev (account torotic.vn).
- Setup Cloudflare đã xong: D1 bound `DB` + `FEEDBACK_ADMIN_KEY`. (R2 không dùng.)
- Còn lại: đổi mật khẩu cho tài khoản `kaidant1234` (đang `checkonly000`); cân nhắc onboarding người mới; test mắt loạt khối AI.
