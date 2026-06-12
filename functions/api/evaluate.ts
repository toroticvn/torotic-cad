/**
 * Cloudflare Pages Function — POST /api/evaluate
 *
 * Receives a rendered image of the viewport + the parametric feature-tree JSON
 * and asks an AI (vision) to review the 3D design. Runs on the Cloudflare Workers
 * edge runtime, so we call provider REST APIs with raw fetch (no SDK bundling).
 *
 * Provider is chosen by which key is configured (keys stay server-side, never
 * sent to the browser):
 *   - ANTHROPIC_API_KEY set -> Claude (claude-opus-4-8, paid, best quality)
 *   - else GEMINI_API_KEY set -> Google Gemini (gemini-2.0-flash, free tier)
 * Add ANTHROPIC_API_KEY later to upgrade with no code change.
 */

interface Env {
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
}

interface EvaluateBody {
  image?: string; // PNG data URL: "data:image/png;base64,...."
  features?: unknown; // the feature-tree array from the store
}

const CLAUDE_MODEL = "claude-opus-4-8";
const GEMINI_MODEL = "gemini-2.0-flash";

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

/** Parse a data URL into { mediaType, base64 }, or null. */
function parseDataUrl(s?: string): { mediaType: string; base64: string } | null {
  if (!s) return null;
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(s);
  return m ? { mediaType: m[1], base64: m[2] } : null;
}

async function callClaude(
  key: string,
  img: { mediaType: string; base64: string } | null,
  userText: string,
): Promise<string> {
  const content: Array<Record<string, unknown>> = [];
  if (img) {
    content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
  }
  content.push({ type: "text", text: userText });

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Claude API lỗi (${resp.status}). ${detail.slice(0, 400)}`);
  }
  const data = (await resp.json()) as {
    stop_reason?: string;
    content?: Array<{ type: string; text?: string }>;
  };
  if (data.stop_reason === "refusal") throw new Error("Claude từ chối xử lý yêu cầu này.");
  return (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();
}

async function callGemini(
  key: string,
  img: { mediaType: string; base64: string } | null,
  userText: string,
): Promise<string> {
  const parts: Array<Record<string, unknown>> = [];
  if (img) parts.push({ inlineData: { mimeType: img.mediaType, data: img.base64 } });
  parts.push({ text: userText });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "x-goog-api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts }],
      generationConfig: { maxOutputTokens: 4000 },
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`Gemini API lỗi (${resp.status}). ${detail.slice(0, 400)}`);
  }
  const data = (await resp.json()) as {
    promptFeedback?: { blockReason?: string };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  };
  if (data.promptFeedback?.blockReason) {
    throw new Error("Gemini chặn yêu cầu: " + data.promptFeedback.blockReason);
  }
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  return text;
}

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;

  const hasClaude = !!env.ANTHROPIC_API_KEY;
  const hasGemini = !!env.GEMINI_API_KEY;
  if (!hasClaude && !hasGemini) {
    return json(
      {
        error:
          "Máy chủ chưa cấu hình API key. Thêm GEMINI_API_KEY (miễn phí, aistudio.google.com) hoặc ANTHROPIC_API_KEY trong Cloudflare Pages → Settings → Variables rồi deploy lại.",
      },
      500,
    );
  }

  let body: EvaluateBody;
  try {
    body = (await request.json()) as EvaluateBody;
  } catch {
    return json({ error: "Body JSON không hợp lệ." }, 400);
  }

  const img = parseDataUrl(body.image);
  const featuresJson = JSON.stringify(body.features ?? [], null, 2);
  const userText = `Đây là cây tính năng (feature tree) của khối:\n\n<feature_tree>\n${featuresJson}\n</feature_tree>\n\nHãy đánh giá thiết kế dựa trên ảnh render ở trên và cây tính năng này.`;

  try {
    const text = hasClaude
      ? await callClaude(env.ANTHROPIC_API_KEY as string, img, userText)
      : await callGemini(env.GEMINI_API_KEY as string, img, userText);
    return json({ text: text || "(Không có nội dung trả về.)", provider: hasClaude ? "claude" : "gemini" });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
};
