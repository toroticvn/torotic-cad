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
  selected?: string | null; // name of the feature the user currently has selected
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
- Thao tác đầu của một mô hình mới phải là "box" hoặc "cylinder" (hoặc "polygon") op "new". Lỗ dùng shape "hole" (tự cut; muốn xuyên thủng đặt depth ≥ chiều cao khối).
- Hình tự do (không phải hộp/trụ): dùng shape "polygon" với "points" = danh sách [x,y] các đỉnh theo thứ tự (khép kín, ≥3 đỉnh), kèm "h" để đùn.
- Khối TRÒN XOAY (trục, chốt, bạc, núm, cổ chai, phễu, ống bậc): shape "revolve" — biên dạng nửa mặt cắt là "points" [x,y] (khép kín, ≥3 đỉnh) nằm HẲN VỀ MỘT PHÍA của trục xoay, kèm "revolveAxis" ∈ {u,v} (trục đi qua gốc toạ độ sketch; u = trục ngang/x, v = trục dọc/y) và "totalAngle" (góc xoay, mặc định 360). Biên dạng KHÔNG được cắt qua trục. Vd trục bậc Ø20 dài 40 + Ø12 dài 20 quanh trục u: points [[0,0],[40,0],[40,10],[20,10],[20,6],[0,6]] (10 = bán kính 20/2), revolveAxis "u".
- Đa giác đều (đai ốc, đầu bu-lông lục giác, bát giác): shape "regularPolygon" (sides, diameter = đường kính qua đỉnh, x, y, h, angle).
- Rãnh / lỗ ô-van: shape "slot" (length = khoảng 2 tâm, width = bề rộng, x, y, angle; cắt thì op="cut" + depth, làm lồi thì op khác + h).
- Mặt bích nhiều lỗ (vòng lỗ bu-lông): vẽ đĩa bằng "cylinder" trước, rồi shape "boltCircle" (boltCircleDiameter = PCD, holeDiameter, count, depth) để khoét cả vòng lỗ một lần.
- Lỗ bậc / lỗ chìm (chỗ bắt bu-lông): shape "hole" với holeType="counterbore" (kèm cboreDiameter, cboreDepth) hoặc "countersink" (kèm csinkDiameter, csinkAngle). LUÔN đặt topOffset = chiều cao mặt trên của khối để phần khoét nằm đúng mặt trên.
- Bo tròn / vát cạnh theo VÙNG: shape "fillet" hoặc "chamfer" với "radius" + "edgeRegion" ∈ {all, top, bottom, vertical, horizontal} (mặc định all = bo hết). "top"=cạnh mặt trên, "bottom"=mặt dưới, "vertical"=cạnh đứng, "horizontal"=cạnh ngang. Vd "bo hết cạnh trên 3mm" → fillet radius 3 edgeRegion "top".
- Khoét rỗng (shell, làm hộp/khay): shape "shell" với "thickness" (độ dày thành) + "faceRegion" ∈ {top, bottom, front, back, left, right} = mặt để hở (mặc định top). Vd "khoét rỗng dày 2mm" → shell thickness 2 faceRegion "top".
- Gân tăng cứng (rib): dùng "polygon" tạo tiết diện tam giác/chữ nhật mỏng rồi đùn (op="add").
- Ren xoắn THẬT (bu-lông, ti ren, vít): shape "thread" — ren NGOÀI dạng helix thật. Tham số: diameter (đường kính danh nghĩa, vd M10→10), pitch (bước ren; bỏ trống sẽ tự lấy bước thô theo đường kính), length (chiều dài ren), x, y (tâm), offset (toạ độ gốc theo trục ren), axis ∈ {x,y,z} (mặc định z). Ren luôn là MỘT KHỐI RIÊNG (multi-body): muốn làm bu-lông thì tạo đầu bu-lông (regularPolygon/cylinder) rồi đặt "thread" nối tiếp ngay sau, cho chồng nhẹ vào đầu. Lưu ý hạn chế hiện tại: chưa làm được REN TRONG (lỗ taro) — nếu cần ren trong thì dùng lỗ trơn và nói rõ.
- Soi gương cả khối: shape "mirror", "mirrorPlane" ∈ {XY,XZ,YZ}, "merge" (true=gộp 1 khối, false=2 khối).
- Lặp khối: "patternLinear" (count, dx,dy,dz) hoặc "patternCircular" (count, totalAngle, axis ∈ {x,y,z}).
- ĐỔI KÍCH THƯỚC/THAM SỐ (ưu tiên cách này — sửa tham số, KHÔNG xoá rồi dựng lại): dùng mảng "modify" (mode="append"). Mỗi phần tử có "target" = tên/id feature trong feature_tree + các trường cần đổi:
  · extrude (box/cylinder/hole/profile): distance (chiều cao/sâu đùn); với lỗ/trụ thì diameter (đường kính mới); với hộp thì width/depth (kích thước tiết diện).
  · fillet/chamfer: radius. · revolve/draft: angle. · thread: diameter/pitch/length. · shell: thickness.
  · pattern: count, dx/dy/dz (thẳng), angle/axis (tròn).
  Ví dụ: "đổi đường kính lỗ thành 12" → modify:[{target:"Hole1", diameter:12}]; "làm tấm cao 20" → modify:[{target:"Box1", distance:20}]; "bo góc to hơn 5" → modify:[{target:"Fillet1", radius:5}].
- XOÁ feature: đặt tên/id vào mảng "delete" (lấy từ feature_tree). Chỉ xoá-rồi-dựng-lại khi cần đổi KIỂU hình (vd hộp→trụ); đổi số đo thì dùng "modify".
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
      delete: {
        type: "array",
        description: "Tên hoặc id các feature cần xoá trước (lấy từ feature_tree). Chỉ dùng với append.",
        items: { type: "string" },
      },
      modify: {
        type: "array",
        description: "Sửa THAM SỐ feature đã có (đổi kích thước parametric, không xoá-dựng-lại). Chỉ dùng với append.",
        items: {
          type: "object",
          properties: {
            target: { type: "string", description: "Tên hoặc id feature cần sửa (lấy từ feature_tree)" },
            distance: { type: "number", description: "extrude: chiều cao/sâu đùn mới (mm)" },
            height: { type: "number", description: "extrude: alias của distance (mm)" },
            radius: { type: "number", description: "fillet/chamfer: bán kính mới (mm)" },
            diameter: { type: "number", description: "lỗ/trụ: đường kính mới (mm); thread: đường kính danh nghĩa" },
            width: { type: "number", description: "hộp: bề rộng tiết diện theo u (mm)" },
            depth: { type: "number", description: "hộp: chiều sâu tiết diện theo v (mm)" },
            angle: { type: "number", description: "revolve/draft/pattern tròn: góc (độ)" },
            count: { type: "number", description: "pattern: số bản" },
            dx: { type: "number" }, dy: { type: "number" }, dz: { type: "number" },
            pitch: { type: "number", description: "thread: bước ren (mm)" },
            length: { type: "number", description: "thread: chiều dài ren (mm)" },
            thickness: { type: "number", description: "shell: độ dày thành (mm)" },
            axis: { type: "string", enum: ["x", "y", "z"], description: "pattern tròn: trục quay" },
          },
          required: ["target"],
        },
      },
      operations: {
        type: "array",
        description: "Danh sách thao tác, theo thứ tự dựng.",
        items: {
          type: "object",
          properties: {
            shape: { type: "string", enum: ["box", "cylinder", "hole", "fillet", "chamfer", "shell", "polygon", "revolve", "regularPolygon", "slot", "boltCircle", "thread", "mirror", "patternLinear", "patternCircular"] },
            op: { type: "string", enum: ["new", "add", "cut"], description: "Phép boolean (box/cylinder/hole/polygon/revolve)" },
            revolveAxis: { type: "string", enum: ["u", "v"], description: "revolve: trục xoay qua gốc sketch (u=ngang, v=dọc)" },
            edgeRegion: { type: "string", enum: ["all", "top", "bottom", "vertical", "horizontal"], description: "fillet/chamfer: vùng cạnh cần xử lý (mặc định all)" },
            faceRegion: { type: "string", enum: ["top", "bottom", "front", "back", "left", "right"], description: "shell: mặt để hở (mặc định top)" },
            thickness: { type: "number", description: "shell: độ dày thành (mm)" },
            plane: { type: "string", enum: ["top", "front", "right"], description: "Mặt phẳng sketch (mặc định top)" },
            offset: { type: "number", description: "Dịch mặt phẳng theo phương đùn (mm)" },
            x: { type: "number", description: "Toạ độ tâm theo trục u (mm)" },
            y: { type: "number", description: "Toạ độ tâm theo trục v (mm)" },
            w: { type: "number", description: "Chiều rộng hộp theo u (mm)" },
            d: { type: "number", description: "Chiều sâu hộp theo v (mm)" },
            h: { type: "number", description: "Chiều cao đùn của box/cylinder/polygon (mm)" },
            diameter: { type: "number", description: "Đường kính cylinder/hole (mm)" },
            depth: { type: "number", description: "Chiều sâu khoét của hole (mm)" },
            radius: { type: "number", description: "Bán kính fillet/chamfer (mm)" },
            points: {
              type: "array",
              description: "polygon: các đỉnh [x,y] theo thứ tự, khép kín (≥3).",
              items: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
            },
            length: { type: "number", description: "slot: khoảng cách 2 tâm đầu / thread: chiều dài ren (mm)" },
            width: { type: "number", description: "slot: bề rộng = đường kính đầu (mm)" },
            pitch: { type: "number", description: "thread: bước ren mỗi vòng (mm); bỏ trống tự tính theo đường kính" },
            angle: { type: "number", description: "góc trục slot / xoay đa giác đều (độ)" },
            sides: { type: "number", description: "regularPolygon: số cạnh (≥3, vd lục giác=6)" },
            boltCircleDiameter: { type: "number", description: "boltCircle: đường kính vòng chia lỗ PCD (mm)" },
            holeDiameter: { type: "number", description: "boltCircle: đường kính mỗi lỗ (mm)" },
            startAngle: { type: "number", description: "boltCircle: góc bắt đầu (độ)" },
            holeType: { type: "string", enum: ["simple", "counterbore", "countersink"], description: "hole: loại lỗ (trơn / lỗ bậc / lỗ chìm)" },
            topOffset: { type: "number", description: "hole bậc/chìm: chiều cao mặt trên nơi lỗ đi vào (mm)" },
            cboreDiameter: { type: "number", description: "counterbore: đường kính phần khoét rộng (mm)" },
            cboreDepth: { type: "number", description: "counterbore: chiều sâu phần khoét rộng (mm)" },
            csinkDiameter: { type: "number", description: "countersink: đường kính miệng loe (mm)" },
            csinkAngle: { type: "number", description: "countersink: góc côn (độ, vd 90)" },
            mirrorPlane: { type: "string", enum: ["XY", "XZ", "YZ"], description: "mirror: mặt phẳng soi gương" },
            merge: { type: "boolean", description: "mirror: gộp thành 1 khối (mặc định true)" },
            count: { type: "number", description: "pattern: tổng số bản (gồm bản gốc)" },
            dx: { type: "number", description: "patternLinear: bước theo X (mm)" },
            dy: { type: "number", description: "patternLinear: bước theo Y (mm)" },
            dz: { type: "number", description: "patternLinear: bước theo Z (mm)" },
            totalAngle: { type: "number", description: "patternCircular: tổng góc (độ)" },
            axis: { type: "string", enum: ["x", "y", "z"], description: "patternCircular: trục quay" },
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
  const selectedNote =
    typeof body.selected === "string" && body.selected.trim()
      ? `\n(Feature người dùng đang CHỌN: "${body.selected}". Nếu họ nói "cái này"/"feature này" thì hiểu là feature đó.)`
      : "";
  const contextNote = `\n\n---\n(Bối cảnh hệ thống — cây tính năng hiện tại của mô hình:)\n<feature_tree>\n${featuresJson}\n</feature_tree>${selectedNote}`;

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
