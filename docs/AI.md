# Tính năng AI — "Đọc & đánh giá bản vẽ"

Nút **✨ AI đánh giá** trên thanh công cụ gửi ảnh render của viewport + cây tính năng (feature tree JSON) lên máy chủ, để Claude (vision) nhận xét thiết kế: điểm tốt, vấn đề/rủi ro, khả năng chế tạo (DFM) và gợi ý cải tiến.

## Kiến trúc

- **Frontend** ([src/ui/AiPanel.tsx](../src/ui/AiPanel.tsx), [src/ai/api.ts](../src/ai/api.ts)): chụp viewport thành PNG, POST `/api/evaluate`.
- **Backend** = Cloudflare **Pages Function** [functions/api/evaluate.ts](../functions/api/evaluate.ts): chạy trên edge cùng project Pages, gọi Anthropic Messages API bằng model `claude-opus-4-8` (adaptive thinking, vision).
- **API key** chỉ nằm ở biến môi trường server-side `ANTHROPIC_API_KEY` — **không bao giờ** gửi xuống trình duyệt.

## Hai cách dùng AI

### Cách 1 — Nút "✨ AI đánh giá" (tự động, qua backend)
Backend tự chọn nhà cung cấp theo key đã cấu hình:
- Có `ANTHROPIC_API_KEY` → dùng **Claude** (`claude-opus-4-8`, trả phí, chất lượng cao nhất).
- Không có thì dùng `GEMINI_API_KEY` → **Google Gemini** (`gemini-2.0-flash`, **free tier**).

Thêm `ANTHROPIC_API_KEY` sau là tự nâng cấp lên Claude, không phải sửa code.

### Cách 2 — Nút "📋 Hỏi Claude.ai" (thủ công, dùng gói Pro/Max, $0 thêm)
Bấm nút → app tải ảnh `torotic-banve.png` + copy sẵn câu hỏi (kèm feature JSON) vào clipboard + mở claude.ai. Bạn dán nội dung, đính ảnh, gửi. Không cần API key, không tốn thêm — dùng đúng gói Claude.ai bạn đã có. Chạy được cả khi mở web local. (Chỉ phục vụ chính bạn, vì gói cá nhân.)

## Cấu hình key cho Cách 1 (một lần)

**Miễn phí (Gemini):**
1. Vào https://aistudio.google.com/apikey → *Create API key* (miễn phí, không cần thẻ).
2. **dash.cloudflare.com → Workers & Pages → torotic-cad → Settings → Variables and Secrets**.
3. Add variable: Name `GEMINI_API_KEY`, Value = key, kiểu **Secret/Encrypt**, áp dụng **Production**.
4. **Save** → **Deployments → Retry deployment**.

**Trả phí, chất lượng cao hơn (Claude):** làm y hệt nhưng Name = `ANTHROPIC_API_KEY`, key lấy ở https://console.anthropic.com → API keys. Khi có cả hai, backend ưu tiên Claude.

## Lưu ý

- Tính năng chỉ chạy trên **bản đã deploy** (Cloudflare Pages). Chạy `npm run dev` thuần Vite ở localhost sẽ KHÔNG có `/api/evaluate`. Muốn thử local: `npx wrangler pages dev dist` (sau khi `npm run build`) và đặt `ANTHROPIC_API_KEY` trong môi trường wrangler.
- Mỗi lần đánh giá tốn chi phí API (vision + thinking). Opus 4.8 = $5/$25 mỗi 1M token. Muốn rẻ hơn, đổi `MODEL` trong [functions/api/evaluate.ts](../functions/api/evaluate.ts) sang `claude-sonnet-4-6` ($3/$15) hoặc `claude-haiku-4-5` ($1/$5).
- Ảnh được thu nhỏ còn ≤1024px trước khi gửi để giảm token.

## Bước sau (chưa làm)

- **Thiết kế từ mô tả**: dùng structured output (`output_config.format`) để Claude sinh ra feature-tree JSON theo schema, rồi `rebuild` dựng khối.
- Streaming kết quả để UX mượt hơn (hiện đang chờ trọn gói).
- Giới hạn tần suất gọi (rate limit) nếu mở công khai cho nhiều người.
