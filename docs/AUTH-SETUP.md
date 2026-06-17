# Tài khoản người dùng (email + mật khẩu) — hướng dẫn bật

Tài khoản lưu trong **cùng Cloudflare D1** đã dùng cho feedback (binding `DB`).
Không cần dịch vụ ngoài. Mật khẩu hash PBKDF2; phiên đăng nhập bằng cookie HttpOnly.

## 1. Tạo bảng (1 lần)

Mở D1 database (binding `DB`) → tab **Console** → dán toàn bộ `docs/auth-schema.sql` → Run.
(Tạo 3 bảng: `users`, `sessions`, `projects` — `projects` dành cho Phần 2 dự án đám mây.)

> Nếu chưa có D1 / chưa bind `DB`: làm trước theo `docs/FEEDBACK-SETUP.md` bước 1–3 (cùng database).

## 2. Deploy lại

Push `main` (đã có `functions/api/auth.ts`) → Cloudflare build.

## 3. Dùng

- Góc phải thanh công cụ có nút **👤 Đăng nhập** → đăng ký (email + mật khẩu ≥6 ký tự) hoặc đăng nhập.
- Đăng nhập xong hiển thị tên + **Đăng xuất**; phiên giữ 30 ngày (cookie).
- Hoạt động cả trên `pages.dev` và `localhost` (qua dev proxy).

## Ghi chú kỹ thuật
- Cookie phiên là `HttpOnly; SameSite=Lax` (cố ý **không** đặt `Secure` để chạy được qua dev proxy http://localhost trên máy này; bản production vốn chỉ chạy HTTPS).
- Endpoint: `GET /api/auth` (user hiện tại), `POST /api/auth` với `action` = signup / login / logout.
- Xoá phiên hết hạn tự động khi đăng nhập.
- **Phần 2 (sắp làm):** "Tạo dự án" + "Dự án của tôi" + Lưu/Mở đám mây theo tài khoản (bảng `projects`).
