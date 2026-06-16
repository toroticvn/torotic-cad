# Tool báo lỗi / góp ý — hướng dẫn bật (Cloudflare D1)

Người dùng bấm nút **🐞 Báo lỗi** (góc dưới-phải) → điền loại + mô tả → tự đính kèm
ảnh viewport + cây tính năng + thông tin trình duyệt → lưu vào **Cloudflare D1**.
Admin xem/triệt để tại `…pages.dev/#feedback-admin`.

> Kiến trúc: web tĩnh + Pages Function `functions/api/feedback.ts` + D1. Không cần
> Supabase/Vercel (khác với README ERP — đó là dự án khác).

## 1. Tạo D1 database

Cloudflare Dashboard → **Workers & Pages → D1 → Create database**
- Tên: `torotic-cad` (tuỳ ý).

## 2. Tạo bảng

Mở database vừa tạo → tab **Console**, dán toàn bộ nội dung `docs/feedback-schema.sql` → Run.
(Hoặc CLI: `wrangler d1 execute torotic-cad --remote --file=docs/feedback-schema.sql`.)

## 3. Bind D1 vào Pages project

Pages project **torotic-cad** → **Settings → Functions → D1 database bindings → Add binding**
- Variable name: **`DB`**  (đúng chữ này — code đọc `env.DB`)
- D1 database: chọn `torotic-cad`
- Thêm cho cả **Production** và **Preview**.

## 4. Đặt admin key

Pages project → **Settings → Variables and Secrets** (Production + Preview):
- **`FEEDBACK_ADMIN_KEY`** = một chuỗi bí mật bạn tự đặt (vd 24+ ký tự ngẫu nhiên).

Key này dùng để mở trang admin và đổi trạng thái. Người dùng thường KHÔNG cần key
(gửi feedback là công khai).

## 5. Deploy lại

Push `main` (hoặc Retry deployment) để Function + binding có hiệu lực.

## 6. Dùng

- **Gửi:** mọi người mở app → nút 🐞 Báo lỗi → gửi.
- **Xem (admin):** mở `https://torotic-cad.pages.dev/#feedback-admin` → nhập
  `FEEDBACK_ADMIN_KEY` → xem danh sách, ảnh, cây tính năng; đổi trạng thái
  (Mới → Đang xem → Đang làm → Đã xong / Từ chối), ghi chú, lý do từ chối.
- Trên **localhost** (`npm run dev`): nút báo lỗi gọi `/api/feedback` qua dev proxy
  → tới Function đã deploy → cùng một D1. Hoạt động giống bản online.

## Ghi chú
- Ảnh viewport lưu base64 trong D1; ảnh > ~800KB sẽ tự bỏ (giữ text) để an toàn giới hạn D1.
- Muốn tra cứu nhanh bằng SQL: D1 Console → `select id, loai, trang_thai, mo_ta, created_at from feedback order by created_at desc;`
- Đổi nhãn module trong `src/ui/FeedbackButton.tsx` (mảng `MODULES`).
