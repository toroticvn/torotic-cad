/**
 * Cloudflare Pages Function — POST /api/generate
 *
 * Turns a natural-language description into a high-level CAD "design" (a list of
 * primitive operations) using Claude tool use. The frontend then expands that
 * design into real sketches + features and rebuilds the solid.
 *
 * Same Claude plumbing as /api/chat: raw fetch to the Messages API, routed
 * through Cloudflare AI Gateway when CF_AI_GATEWAY is set (avoids the regional
 * 403). Key stays server-side.
 */

interface Env {
  ANTHROPIC_API_KEY?: string;
  CF_AI_GATEWAY?: string;
}

const MODEL = "claude-opus-4-8";

const SYSTEM_PROMPT = `Bạn là kỹ sư thiết kế CAD. Nhiệm vụ: chuyển mô tả tiếng Việt của người dùng thành một chuỗi thao tác dựng khối 3D, bằng cách GỌI công cụ "create_design".

Quy ước (rất quan trọng, tuân thủ nghiêm):
- Đơn vị: milimét (mm).
- Mặt phẳng "top" (mặc định): u = trục phải, v = trục sâu, đùn lên trên. Dùng "top" cho khối đặt trên mặt đất.
- x, y là toạ độ tâm của hình trên mặt phẳng sketch. offset là khoảng dịch mặt phẳng theo phương đùn (ví dụ đặt khối lên trên khối cao 10 thì offset = 10).
- Thao tác ĐẦU TIÊN phải tạo khối đặc: shape "box" hoặc "cylinder", op "new".
- Lỗ: shape "hole", nó tự khoét (cut). Để xuyên thủng, depth ≥ chiều cao khối. Đặt x,y vào đúng vị trí lỗ.
- Khối thêm: op "add". Bo cạnh: shape "fillet" (radius). Vát cạnh: shape "chamfer" (radius). fillet/chamfer áp dụng cho toàn bộ cạnh hiện có.
- Giữ thiết kế đơn giản, hợp lệ, kích thước hợp lý. Suy luận các kích thước/vị trí còn thiếu một cách hợp lý.`;

const DESIGN_TOOL = {
  name: "create_design",
  description: "Tạo bản thiết kế khối 3D từ chuỗi thao tác primitive.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Tên ngắn cho thiết kế" },
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

export const onRequestPost = async (context: { request: Request; env: Env }): Promise<Response> => {
  const { request, env } = context;
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "Máy chủ chưa cấu hình ANTHROPIC_API_KEY." }, 500);
  }

  let body: { prompt?: string };
  try {
    body = (await request.json()) as { prompt?: string };
  } catch {
    return json({ error: "Body JSON không hợp lệ." }, 400);
  }
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return json({ error: "Thiếu mô tả." }, 400);

  let endpoint = "https://api.anthropic.com/v1/messages";
  if (env.CF_AI_GATEWAY) {
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
        max_tokens: 3000,
        system: SYSTEM_PROMPT,
        tools: [DESIGN_TOOL],
        tool_choice: { type: "tool", name: "create_design" },
        messages: [{ role: "user", content: prompt }],
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
    content?: Array<{ type: string; name?: string; input?: unknown }>;
  };
  const toolUse = (data.content ?? []).find((b) => b.type === "tool_use" && b.name === "create_design");
  if (!toolUse || !toolUse.input) {
    return json({ error: "AI không trả về thiết kế hợp lệ." }, 502);
  }

  return json({ design: toolUse.input });
};
