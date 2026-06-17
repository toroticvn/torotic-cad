# Dự án đám mây — hướng dẫn bật (D1 + R2)

Sau khi đã có **tài khoản** (xem `docs/AUTH-SETUP.md`), bật lưu dự án lên đám mây:
- **D1** (binding `DB`) giữ metadata dự án (bảng `projects` — đã nằm trong `docs/auth-schema.sql`).
- **R2** (binding `BUCKET`) giữ **nội dung dự án** (JSON cây tính năng, key `proj/<user_id>/<id>.json`) — chịu được file nặng (nhúng STEP/STL).

## 1. Bảng projects
Đã tạo khi bạn chạy `docs/auth-schema.sql`. Nếu trước đó chạy bản cũ (có cột `data`), chạy thêm:
```sql
alter table projects add column size_bytes integer not null default 0;
```

## 2. Tạo R2 bucket
Cloudflare → **R2 → Create bucket** → tên ví dụ `torotic-cad-projects`.

## 3. Bind R2 vào Pages
Pages project **torotic-cad** → **Settings → Functions → R2 bucket bindings → Add binding**
- Variable name: **`BUCKET`**  (đúng chữ này — code đọc `env.BUCKET`)
- R2 bucket: chọn bucket vừa tạo
- Thêm cho cả **Production** và **Preview**.

## 4. Deploy lại
Push `main` (đã có `functions/api/projects.ts`) → Cloudflare build.

## 5. Dùng
- Đăng nhập → thanh công cụ bấm **☁ Dự án**.
- **＋ Tạo dự án mới** (đặt tên) → model trống gắn với dự án đó.
- Vẽ → **☁ Lưu** (lưu mô hình hiện tại lên dự án đang mở; nếu chưa có thì hỏi tên rồi tạo).
- Danh sách dự án: **Mở / Đổi tên / Xoá**.
- Lưu file `.json` ra máy vẫn còn (nút **💾 Lưu file**) — độc lập với đám mây.

## Ghi chú
- Giới hạn 30MB/ dự án (chặn lạm dụng). Dự án nhúng nhiều STEP/STL sẽ nặng → cân nhắc.
- Nội dung dự án nằm ở R2; muốn xoá sạch của một user thì xoá theo prefix `proj/<user_id>/`.
- Endpoint: `GET /api/projects` (list), `GET /api/projects?id=N` (mở), `POST` action = create/save/rename/delete. Tất cả cần đăng nhập (cookie phiên).
