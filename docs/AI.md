# Tính năng AI (Claude)

Torotic CAD có trợ lý AI chạy bằng **Claude**. Hiện có:

- **💬 Trợ lý AI** — khung chat hỏi–đáp. AI tự "nhìn" ảnh render + cây tính năng (feature tree JSON) của mô hình bạn đang vẽ, nên có thể đánh giá, giải thích, gợi ý cải tiến, hướng dẫn thao tác.
- **✨ Đánh giá** — gửi sẵn câu hỏi "đánh giá bản vẽ" vào khung chat (nhanh).
- **📋 Claude.ai** — đường thủ công, **miễn phí bằng gói Pro/Max**: tải ảnh + copy nội dung + mở claude.ai để bạn dán vào chat. Không cần API key, không tốn thêm. Chạy được cả khi mở local.

> Sắp tới: cho AI **vẽ/dựng khối từ mô tả** (text → feature tree → rebuild).

## Kiến trúc

- **Frontend**: [src/ui/ChatPanel.tsx](../src/ui/ChatPanel.tsx), [src/ai/api.ts](../src/ai/api.ts) — chụp viewport thành PNG, gửi hội thoại + ảnh + feature tree tới `/api/chat`.
- **Backend** = Cloudflare **Pages Function** [functions/api/chat.ts](../functions/api/chat.ts): raw fetch tới Anthropic Messages API, model `claude-opus-4-8` (adaptive thinking + vision), đa lượt.
- **API key** chỉ ở env var server-side `ANTHROPIC_API_KEY` — không bao giờ xuống trình duyệt.

## ⚠️ Claude API ≠ gói Pro/Max

Gói **Claude Pro/Max (claude.ai)** KHÔNG dùng được cho API của app — đây là 2 sản phẩm tính tiền riêng. Để nút "💬 Trợ lý AI" / "✨ Đánh giá" chạy, cần **API key + credit** ở console.anthropic.com (nạp tối thiểu ~$5, dùng rất lâu; mỗi lượt chỉ vài cent).

## Cấu hình key (một lần)

1. https://console.anthropic.com → **Billing** → nạp credit (vd $5).
2. **API keys** → *Create Key* → copy (`sk-ant-...`).
3. dash.cloudflare.com → **Workers & Pages → torotic-cad → Settings → Variables and Secrets**.
4. Add: Name `ANTHROPIC_API_KEY`, Value = key, kiểu **Secret/Encrypt**, **Production**.
5. **Save** → **Deployments → Retry deployment**.

## Lưu ý

- AI tích hợp chỉ chạy trên **bản đã deploy** (Cloudflare Pages), không chạy ở localhost thuần Vite. (Nút "📋 Claude.ai" thì chạy mọi nơi.)
- Mỗi lượt đính kèm ảnh viewport (≤1024px) + feature tree → Claude thấy đúng mô hình hiện tại.
- Đổi model rẻ hơn: sửa hằng `MODEL` trong [functions/api/chat.ts](../functions/api/chat.ts) sang `claude-sonnet-4-6` hoặc `claude-haiku-4-5`.
