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
  /**
   * Optional Cloudflare AI Gateway base URL for Anthropic, e.g.
   * https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway>/anthropic
   * Routing through AI Gateway avoids the 403 "Request not allowed" that happens
   * when Cloudflare's edge egresses to Anthropic via a restricted region (HK).
   */
  CF_AI_GATEWAY?: string;
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

Bạn có thể làm 2 việc:
1) TƯ VẤN: đánh giá thiết kế, giải thích, trả lời câu hỏi, gợi ý cải tiến, tư vấn chế tạo (DFM), hướng dẫn thao tác.
2) TỰ VẼ / TỰ SỬA mô hình: khi người dùng yêu cầu vẽ, thêm, hay sửa hình (vd "vẽ tấm 100x60 dày 10", "khoan 4 lỗ φ8 ở góc", "thêm trụ ở giữa"), hãy GỌI công cụ "apply_design" để dựng trực tiếp trong phần mềm.

Khi gọi apply_design:
- Đơn vị milimét. Mặt phẳng mặc định "top" (u = phải, v = sâu, đùn lên trên). x,y là TÂM hình trên mặt phẳng; offset = dịch mặt phẳng theo phương đùn (đặt khối lên khối cao 10 → offset 10).
- mode="replace" để vẽ MỚI từ đầu; mode="append" để VẼ TIẾP lên mô hình hiện có (nhìn feature_tree: nếu đã có khối thì thường dùng append).
- Thao tác đầu của một mô hình mới phải là "box" hoặc "cylinder" op "new". Lỗ dùng shape "hole" (tự cut; muốn xuyên thủng đặt depth ≥ chiều cao khối).
- Suy luận hợp lý kích thước/vị trí còn thiếu. LUÔN kèm một đoạn text ngắn (tiếng Việt) giải thích các bước bạn vừa dựng.

Trả lời bằng tiếng Việt, ngắn gọn, chính xác, dùng markdown khi hợp lý. Không bịa số đo không có trong dữ liệu; nếu thiếu, nêu rõ giả định.`;

const APPLY_DESIGN_TOOL = {
  name: "apply_design",
  description:
    "Dựng hoặc sửa mô hình 3D trực tiếp trong phần mềm từ chuỗi thao tác primitive. Dùng khi người dùng muốn bạn vẽ/thêm/sửa hình.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Tên ngắn cho thiết kế/bước này" },
      mode: { type: "string", enum: ["replace", "append"], description: "replace=vẽ mới; append=vẽ tiếp lên mô hình hiện có" },
      operations: {
        type: "array",
        description: "Danh sách thao tác, theo thứ tự dựng.",
        items: {
          type: "object",
          properties: {
            shape: { type: "string", enum: ["box", "cylinder", "hole", "fillet", "chamfer"] },
            op: { type: "string", enum: ["new", "add", "cut"], description: "Phép boolean (box/cylinder/hole)" },
            plane: { type: "string", enum: ["top", "front", "right"], description: "Mặt phẳng sketch (mặc định top)" },
            offset: { type: "number", description: "Dịch mặt phẳng theo phương đùn (mm)" },
            x: { type: "number", description: "Toạ độ tâm theo trục u (mm)" },
            y: { type: "number", description: "Toạ độ tâm theo trục v (mm)" },
            w: { type: "number", description: "Chiều rộng hộp theo u (mm)" },
            d: { type: "number", description: "Chiều sâu hộp theo v (mm)" },
            h: { type: "number", description: "Chiều cao đùn của box/cylinder (mm)" },
            diameter: { type: "number", description: "Đường kính cylinder/hole (mm)" },
            depth: { type: "number", description: "Chiều sâu khoét của hole (mm)" },
            radius: { type: "number", description: "Bán kính fillet/chamfer (mm)" },
          },
          required: ["shape"],
        },
      },
    },
    required: ["operations"],
  },
};

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

  let endpoint = "https://api.anthropic.com/v1/messages";
  if (env.CF_AI_GATEWAY) {
    // Tolerate either the base (…/anthropic) or the full (…/anthropic/v1/messages) URL.
    const base = env.CF_AI_GATEWAY.replace(/\/+$/, "").replace(/\/v1\/messages$/, "");
    endpoint = `${base}/v1/messages`;
  }

  let resp: Response;
  try {
    resp = await fetch(endpoint, {
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
        tools: [APPLY_DESIGN_TOOL],
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
    content?: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
  };
  if (data.stop_reason === "refusal") return json({ error: "Claude từ chối xử lý yêu cầu này." }, 422);

  const blocks = data.content ?? [];
  const text = blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();

  // If Claude chose to draw, it called apply_design — hand the design to the client.
  const toolUse = blocks.find((b) => b.type === "tool_use" && b.name === "apply_design");
  const design = toolUse?.input ?? null;

  return json({
    text: text || (design ? "Đã cập nhật mô hình." : "(Không có nội dung trả về.)"),
    design,
  });
};
