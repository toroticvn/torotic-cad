# Dự án đám mây — hướng dẫn bật (chỉ D1, KHÔNG cần R2/thẻ)

Sau khi đã có **tài khoản** (xem `docs/AUTH-SETUP.md`), dự án được lưu **thẳng trong Cloudflare D1** (cột `projects.data`) — không cần R2, không cần thẻ thanh toán.

## 1. Bảng projects
Đã tạo khi chạy `docs/auth-schema.sql`. Nếu bạn lỡ chạy bản trước (projects thiếu cột `data`), chạy thêm trong D1 Console:
```sql
alter table projects add column data text not null default '{"version":1,"features":[]}';
```

## 2. Bind D1
Chỉ cần binding **`DB`** (D1) trên project Pages — đã làm cho auth/feedback rồi thì dùng chung.

## 3. Dùng
- Đăng nhập → **☁ Dự án** → **＋ Tạo dự án mới** / **☁ Lưu** / Mở / Đổi tên / Xoá.
- Lưu file `.json` ra máy (💾/📂) vẫn còn, độc lập.

## Giới hạn
- Mỗi dự án lưu đám mây **≤ ~900KB** (an toàn cho 1 bản ghi D1). Cây tính năng bình thường chỉ vài chục KB → thoải mái.
- Dự án **nhúng file STEP/STL nặng** có thể vượt 900KB → dùng **💾 Lưu file** ra máy cho loại này (hoặc nâng cấp lên R2 sau nếu cần lưu đám mây bản nặng).
