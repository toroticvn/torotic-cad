# Kinh nghiệm: AI 2 tầng (DeepSeek + Claude) & gỡ lỗi định tuyến (2026-06-20)

> Đúc kết khi thêm định tuyến model 2 tầng và debug vụ "đánh giá" không nhảy Claude.

## 1. Kiến trúc định tuyến 2 tầng
- **DeepSeek** (`deepseek-chat`, OpenAI-compatible, rẻ/nhanh) cho tác vụ **đơn giản** (vẽ/thêm/khoan/hướng dẫn).
- **Claude** (opus, qua AI Gateway, suy luận sâu + vision) cho tác vụ **phức tạp** (đánh giá/tối ưu/phân tích/cần nhìn ảnh/mô tả dài/"nghĩ kỹ").
- Quyết định ở **server** (`isComplexTask`: từ khoá + độ dài + có ảnh). Có **fallback**: provider chính lỗi → tự gọi provider còn lại.
- **Tool dùng chung:** `apply_design` (Anthropic) được convert sang **OpenAI function** cho DeepSeek; parse `tool_calls[].function.arguments`. Một tool, hai định dạng.
- DeepSeek **không có vision** → tác vụ cần "nhìn" tự đi Claude (nằm trong luật).

## 2. ⚠️ BÀI HỌC LỚN NHẤT: PowerShell làm hỏng UTF-8 tiếng Việt khi probe
- Test endpoint bằng `Invoke-WebRequest -Body (… | ConvertTo-Json)` với chuỗi **có dấu** → server nhận **mojibake** → "đánh giá" không khớp từ khoá → tưởng lỗi code. Mất nhiều lần probe đuổi theo một **bug không tồn tại**.
- **Cách đúng:** gửi body dưới dạng **byte UTF-8 tường minh**:
  ```powershell
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  Invoke-WebRequest ... -Body $bytes -ContentType "application/json; charset=utf-8"
  ```
- **Quy tắc:** khi probe API có ký tự non-ASCII (tiếng Việt), LUÔN encode UTF-8 bytes. Đừng tin encoding mặc định của PowerShell. (Trình duyệt thật luôn gửi UTF-8 chuẩn nên người dùng không dính.)

## 3. Kỹ thuật khoanh vùng bằng "control probe"
Để tách biến khi nghi ngờ chỗ nào sai, probe các trường hợp đối chứng:
- `"danh gia"` (KHÔNG dấu) vs `"đánh giá"` (CÓ dấu) → cô lập được vấn đề là **dấu/encoding**, không phải logic.
- từ ASCII (`"review"`) + câu **dài >280** (luật độ dài, không phụ thuộc dấu) → xác nhận routing + Claude vẫn chạy.
- → Kết luận: chỉ chuỗi-có-dấu trượt ⇒ vấn đề ở tầng truyền/encoding, không phải server.

## 4. So khớp từ khoá tiếng Việt phải BỎ DẤU
- `includes("đánh giá")` lệ thuộc chuẩn hoá Unicode (NFC/NFD) → dễ trượt.
- Chuẩn: `text.normalize("NFD").replace(/\p{M}/gu,"").replace(/đ/g,"d")` rồi so với từ khoá đã bỏ dấu ("danh gia"). `\p{M}` (cần cờ `u`) bền hơn dải ký tự literal.

## 5. Deploy Cloudflare Pages có độ trễ
- Sửa Function → vài phút mới lên (npm install + vite build + WASM 11MB). Trang Deployments báo **Success** mới chắc live.
- Khi nghi ngờ, **probe** phân biệt được "chưa deploy" vs "lỗi logic" (vd câu chỉ-khác-ở-chỗ-deploy-mới).

## 6. Fallback im lặng che lỗi khi debug
- Logic `provider lỗi → fallback provider kia` tốt cho người dùng, nhưng khi debug nó **giấu** việc Claude lỗi (báo model=deepseek). Phải dùng control probe để loại trừ (đã xác nhận Claude KHÔNG lỗi).

## 7. Đừng probe bằng dữ liệu thật + nhớ dọn
- Probe tạo nhiều `probe…@example.com`. Dọn:
  ```sql
  delete from sessions where user_id in (select id from users where email like 'probe%@example.com');
  delete from users where email like 'probe%@example.com';
  ```

---

## Cấu hình đang chạy (account torotic.vn)
- `DEEPSEEK_API_KEY` (DeepSeek) + `ANTHROPIC_API_KEY` + `CF_AI_GATEWAY` (Claude) + `DB` (D1) + `FEEDBACK_ADMIN_KEY`.
- AI bắt buộc đăng nhập (chặn server-side). Chat hiện badge ⚡ DeepSeek / 🧠 Claude.
