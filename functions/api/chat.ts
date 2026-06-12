/**
 * Cloudflare Pages Function — POST /api/chat
 *
 * Multi-turn AI assistant for Torotic CAD, powered by Claude. The current
 * viewport image + feature-tree JSON are attached to the latest user message so
 * Claude always "sees" the model the user is working on.
 *
 * Runs on the Cloudflare Workers edge runtime → raw fetch to the Anthropic
 * Messages API (no SDK bundling). The API key lives only in the server-side
 * ANTHROPIC_API_KEY binding and is never sent to the browser.
 */

interface Env {
  ANTHROPIC_API_KEY?: string;
}

interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

interface ChatBody {
  messages?: ChatTurn[];
  image?: string; // PNG data URL of the current viewport
  features?: unknown; // current feature tree
}

const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `Bạn là trợ lý kỹ sư cơ khí tích hợp trong phần mềm CAD 3D "Torotic CAD".

Ở mỗi lượt, bạn được cung cấp ảnh render hiện tại của mô hình và cây tính năng (feature tree) dạng JSON — đó là mô hình tham số người dùng đang làm (sketch, ràng buộc, kích thước, các tính năng extrude/revolve/loft/sweep/fillet/chamfer, phép boolean).

Bạn có thể: đánh giá thiết kế, giải thích, trả lời câu hỏi, gợi ý cải tiến, tư vấn về khả năng chế tạo (DFM) và hướng dẫn thao tác trong phần mềm.

Trả lời bằng tiếng Việt, ngắn gọn, chính xác, dùng markdown (tiêu đề ##, gạch đầu dòng) khi hợp lý. Không bịa số đo không có trong dữ liệu. Nếu thiếu thông tin, nêu rõ giả định.`;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function parseDataUrl(s?: string): { mediaType: string; base64: string } | null {
  if (!s) return null;
  const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(s);
  return m ? { mediaType: m[1], base64: m[2] } : null;
}

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;

  if (!env.ANTHROPIC_API_KEY) {
    return json(
      {
        error:
          "Máy chủ chưa cấu hình ANTHROPIC_API_KEY. Tạo API key + nạp credit ở console.anthropic.com, rồi thêm biến này trong Cloudflare Pages → Settings → Variables và deploy lại.",
      },
      500,
    );
  }

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return json({ error: "Body JSON không hợp lệ." }, 400);
  }

  const turns = (body.messages ?? []).filter((m) => m.text && m.text.trim());
  if (turns.length === 0) return json({ error: "Không có nội dung." }, 400);

  const img = parseDataUrl(body.image);
  const featuresJson = JSON.stringify(body.features ?? [], null, 2);
  const contextNote = `\n\n---\n(Bối cảnh hệ thống — cây tính năng hiện tại của mô hình:)\n<feature_tree>\n${featuresJson}\n</feature_tree>`;

  // Find the last user turn so we can attach the current image + feature tree to it.
  let lastUser = -1;
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === "user") {
      lastUser = i;
      break;
    }
  }

  const messages = turns.map((m, i) => {
    if (i === lastUser) {
      const content: Array<Record<string, unknown>> = [];
      if (img) content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
      content.push({ type: "text", text: m.text + contextNote });
      return { role: m.role, content };
    }
    return { role: m.role, content: m.text };
  });

  let resp: Response;
  try {
    resp = await fetch("https://api.anthropic.com/v1/messages", {
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
        messages,
      }),
    });
  } catch (e) {
    return json({ error: "Không gọi được Claude API: " + (e as Error).message }, 502);
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    return json({ error: `Claude API lỗi (${resp.status}). ${detail.slice(0, 400)}` }, 502);
  }

  const data = (await resp.json()) as {
    stop_reason?: string;
    content?: Array<{ type: string; text?: string }>;
  };
  if (data.stop_reason === "refusal") return json({ error: "Claude từ chối xử lý yêu cầu này." }, 422);

  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();

  return json({ text: text || "(Không có nội dung trả về.)" });
};
