import type { Feature } from "../features";

/**
 * Send a rendered viewport image + the feature tree to the server-side
 * /api/evaluate function (Cloudflare Pages Function) and return Claude's review.
 * The Anthropic key stays on the server — the browser only talks to /api.
 */
export async function evaluateDrawing(image: string, features: Feature[]): Promise<string> {
  let resp: Response;
  try {
    resp = await fetch("/api/evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image, features }),
    });
  } catch (e) {
    throw new Error("Không kết nối được máy chủ AI: " + (e as Error).message);
  }

  let data: { text?: string; error?: string } = {};
  try {
    data = await resp.json();
  } catch {
    // fall through — handled below
  }

  if (!resp.ok) {
    if (resp.status === 404) {
      throw new Error(
        "Không tìm thấy /api/evaluate. Tính năng AI chỉ chạy trên bản đã deploy (Cloudflare Pages), không chạy ở localhost thuần Vite.",
      );
    }
    throw new Error(data.error || `Máy chủ lỗi (${resp.status}).`);
  }
  return data.text || "(Không có nội dung.)";
}
