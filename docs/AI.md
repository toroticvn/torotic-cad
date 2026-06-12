# Tính năng AI — "Đọc & đánh giá bản vẽ"

Nút **✨ AI đánh giá** trên thanh công cụ gửi ảnh render của viewport + cây tính năng (feature tree JSON) lên máy chủ, để Claude (vision) nhận xét thiết kế: điểm tốt, vấn đề/rủi ro, khả năng chế tạo (DFM) và gợi ý cải tiến.

## Kiến trúc

- **Frontend** ([src/ui/AiPanel.tsx](../src/ui/AiPanel.tsx), [src/ai/api.ts](../src/ai/api.ts)): chụp viewport thành PNG, POST `/api/evaluate`.
- **Backend** = Cloudflare **Pages Function** [functions/api/evaluate.ts](../functions/api/evaluate.ts): chạy trên edge cùng project Pages, gọi Anthropic Messages API bằng model `claude-opus-4-8` (adaptive thinking, vision).
- **API key** chỉ nằm ở biến môi trường server-side `ANTHROPIC_API_KEY` — **không bao giờ** gửi xuống trình duyệt.

## Cấu hình (một lần)

1. Lấy API key tại https://console.anthropic.com → **API keys** → *Create Key*.
2. Vào **dash.cloudflare.com → Workers & Pages → torotic-cad → Settings → Variables and Secrets** (Environment variables).
3. Thêm biến cho **Production** (và cả **Preview** nếu muốn bản preview chạy được):
   - Name: `ANTHROPIC_API_KEY`
   - Value: dán key vừa tạo
   - Nên chọn kiểu **Secret** (Encrypt) để ẩn giá trị.
4. **Save**, rồi **deploy lại** (Deployments → Retry deployment, hoặc push 1 commit mới) để function nhận biến mới.

## Lưu ý

- Tính năng chỉ chạy trên **bản đã deploy** (Cloudflare Pages). Chạy `npm run dev` thuần Vite ở localhost sẽ KHÔNG có `/api/evaluate`. Muốn thử local: `npx wrangler pages dev dist` (sau khi `npm run build`) và đặt `ANTHROPIC_API_KEY` trong môi trường wrangler.
- Mỗi lần đánh giá tốn chi phí API (vision + thinking). Opus 4.8 = $5/$25 mỗi 1M token. Muốn rẻ hơn, đổi `MODEL` trong [functions/api/evaluate.ts](../functions/api/evaluate.ts) sang `claude-sonnet-4-6` ($3/$15) hoặc `claude-haiku-4-5` ($1/$5).
- Ảnh được thu nhỏ còn ≤1024px trước khi gửi để giảm token.

## Bước sau (chưa làm)

- **Thiết kế từ mô tả**: dùng structured output (`output_config.format`) để Claude sinh ra feature-tree JSON theo schema, rồi `rebuild` dựng khối.
- Streaming kết quả để UX mượt hơn (hiện đang chờ trọn gói).
- Giới hạn tần suất gọi (rate limit) nếu mở công khai cho nhiều người.
