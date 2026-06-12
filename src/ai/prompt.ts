import type { Feature } from "../features";

/** The Vietnamese evaluation instructions (kept in sync with the backend SYSTEM_PROMPT). */
export const EVAL_INSTRUCTIONS = `Bạn là kỹ sư cơ khí cao cấp, đánh giá bản vẽ/khối 3D theo tư duy SolidWorks và DFM (Design for Manufacturing).

Tôi đính kèm một ảnh render khối 3D (file torotic-banve.png vừa tải về — hãy mở/đính kèm vào khung chat này) và cây tính năng (feature tree) dạng JSON ở dưới.

Hãy đọc CẢ ảnh lẫn JSON rồi đánh giá bằng tiếng Việt, ngắn gọn, theo các mục:
## Tổng quan
## Điểm tốt
## Vấn đề & rủi ro
## Khả năng chế tạo (DFM)
## Gợi ý cải tiến (3-6 gợi ý, ưu tiên theo mức quan trọng)

Không bịa số đo không có trong dữ liệu.`;

/** Build the full prompt text (instructions + feature-tree JSON) for pasting into claude.ai. */
export function buildClaudePrompt(features: Feature[]): string {
  const json = JSON.stringify(features, null, 2);
  return `${EVAL_INSTRUCTIONS}\n\n<feature_tree>\n${json}\n</feature_tree>`;
}
