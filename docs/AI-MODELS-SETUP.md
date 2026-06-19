# Trợ lý AI 2 tầng: DeepSeek (đơn giản) + Claude (phức tạp)

`/api/chat` tự định tuyến:
- **DeepSeek** (`deepseek-chat`, OpenAI-compatible, rẻ/nhanh) — cho tác vụ **đơn giản**: vẽ/thêm/khoan, hướng dẫn nhanh.
- **Claude** (`claude-opus-4-8`, qua AI Gateway, suy luận sâu + nhìn được ảnh) — cho tác vụ **phức tạp**.

## Quy tắc định tuyến (server, `functions/api/chat.ts` → `isComplexTask`)
Chuyển sang **Claude** nếu câu hỏi:
- chứa từ khoá: đánh giá, phân tích, tối ưu, so sánh, vì sao, tại sao, kiểm tra, review, DFM, chế tạo, cải tiến, gợi ý, tư vấn, giải thích, lắp ráp, dung sai, **"nghĩ kỹ"**, **"phức tạp"**, **"claude"**; hoặc
- có **đính kèm ảnh** + nhắc tới ảnh ("nhìn", "ảnh", "hình này", "bản vẽ"…); hoặc
- mô tả **dài > 280 ký tự**.

Còn lại → **DeepSeek**. (Muốn ép Claude: thêm chữ "nghĩ kỹ" hoặc "Claude" vào câu.)

Có **fallback**: nếu provider chính lỗi mà còn key kia → tự gọi provider còn lại.
Chat hiển thị model đã trả lời (⚡ DeepSeek / 🧠 Claude) dưới mỗi câu.

## Cấu hình (Cloudflare Pages → Settings → Variables, account torotic.vn)
- **`DEEPSEEK_API_KEY`** = key từ https://platform.deepseek.com (nạp ít tiền, rất rẻ).
- **`ANTHROPIC_API_KEY`** + **`CF_AI_GATEWAY`** — đã có sẵn (Claude).
- Cần ≥1 trong 2 key. Có cả hai = định tuyến đầy đủ. Chỉ DeepSeek → mọi việc dùng DeepSeek (không có vision). Chỉ Claude → như trước.
- Nhớ **Retry deployment** sau khi thêm biến.

## Ghi chú kỹ thuật
- DeepSeek **không có vision** → tác vụ cần "nhìn" mô hình tự đi Claude (đã nằm trong luật).
- Tool `apply_design` dùng chung; với DeepSeek nó được chuyển sang định dạng OpenAI function calling, parse `tool_calls[].function.arguments`.
- AI vẫn **bắt buộc đăng nhập** (cả 2 provider) — chặn ở server.
- `/api/generate` (nút 🪄 AI vẽ) hiện vẫn dùng Claude; có thể chuyển sang DeepSeek sau nếu muốn.
