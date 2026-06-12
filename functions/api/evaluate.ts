/**
 * Cloudflare Pages Function — POST /api/evaluate
 *
 * Receives a rendered image of the viewport + the parametric feature-tree JSON
 * and asks Claude (vision) to review the 3D design. The Anthropic API key lives
 * only in the server-side env binding ANTHROPIC_API_KEY — it is never sent to
 * the browser.
 *
 * We call the Messages API over raw fetch (not the SDK) on purpose: this runs on
 * the Cloudflare Workers edge runtime, where a dependency-free request is the most
 * robust choice and avoids bundling the SDK into the function. The JSON wire shape
 * below is the documented Messages API format.
 */

interface Env {
  ANTHROPIC_API_KEY: string;
}

interface EvaluateBody {
  image?: string; // PNG data URL: "data:image/png;base64,...."
  features?: unknown; // the feature-tree array from the store
}

const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `Bạn là kỹ sư cơ khí cao cấp, chuyên đánh giá bản vẽ/khối 3D theo tư duy SolidWorks và DFM (Design for Manufacturing).

Bạn nhận được:
1. Một ảnh render khối 3D từ phần mềm CAD "Torotic CAD".
2. Cây tính năng (feature tree) dạng JSON — đây là mô hình tham số thật: sketch, ràng buộc (constraints), kích thước (dimensions), và các tính năng extrude/revolve/loft/sweep/fillet/chamfer cùng phép boolean.

Hãy đọc CẢ ảnh lẫn JSON rồi đánh giá. Trả lời bằng tiếng Việt, ngắn gọn, có cấu trúc rõ ràng theo các mục sau (dùng tiêu đề markdown):

## Tổng quan
1-2 câu mô tả khối đang là gì và mục đích có thể.

## Điểm tốt
Gạch đầu dòng những gì thiết kế đã làm đúng (ràng buộc đầy đủ, đối xứng, tham số hợp lý...).

## Vấn đề & rủi ro
Gạch đầu dòng các vấn đề: sketch chưa ràng buộc đủ (dof), kích thước thiếu/không nhất quán, bo/vát thiếu, thành mỏng, góc nhọn tập trung ứng suất, khó gá đặt...

## Khả năng chế tạo (DFM)
Nhận xét về gia công/in 3D: hốc sâu, undercut, bán kính bo tối thiểu, độ dày thành, hướng rút khuôn/đỡ.

## Gợi ý cải tiến
3-6 gợi ý cụ thể, ưu tiên theo mức quan trọng.

Nếu thông tin chưa đủ để kết luận, nói rõ giả định của bạn. Không bịa số đo không có trong dữ liệu.`;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export const onRequestPost = async (context: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  const { request, env } = context;

  if (!env.ANTHROPIC_API_KEY) {
    return json(
      { error: "Máy chủ chưa cấu hình ANTHROPIC_API_KEY. Thêm biến môi trường này trong Cloudflare Pages → Settings → Environment variables rồi deploy lại." },
      500,
    );
  }

  let body: EvaluateBody;
  try {
    body = (await request.json()) as EvaluateBody;
  } catch {
    return json({ error: "Body JSON không hợp lệ." }, 400);
  }

  const content: Array<Record<string, unknown>> = [];

  if (body.image) {
    const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(body.image);
    if (m) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: m[1], data: m[2] },
      });
    }
  }

  const featuresJson = JSON.stringify(body.features ?? [], null, 2);
  content.push({
    type: "text",
    text: `Đây là cây tính năng (feature tree) của khối:\n\n<feature_tree>\n${featuresJson}\n</feature_tree>\n\nHãy đánh giá thiết kế dựa trên ảnh render ở trên và cây tính năng này.`,
  });

  let apiResp: Response;
  try {
    apiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      }),
    });
  } catch (e) {
    return json({ error: "Không gọi được Anthropic API: " + (e as Error).message }, 502);
  }

  if (!apiResp.ok) {
    const detail = await apiResp.text().catch(() => "");
    return json(
      { error: `Anthropic API lỗi (${apiResp.status}). ${detail.slice(0, 500)}` },
      502,
    );
  }

  const data = (await apiResp.json()) as {
    stop_reason?: string;
    content?: Array<{ type: string; text?: string }>;
  };

  if (data.stop_reason === "refusal") {
    return json({ error: "Mô hình từ chối xử lý yêu cầu này." }, 422);
  }

  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();

  return json({ text: text || "(Không có nội dung trả về.)" });
};
