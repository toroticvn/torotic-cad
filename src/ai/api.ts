import type { Feature } from "../features";
import type { Design } from "./design";

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/**
 * Send the conversation + current viewport image + feature tree to the
 * server-side /api/chat function (Claude). The Anthropic key stays on the
 * server — the browser only talks to /api.
 */
export async function chat(messages: ChatTurn[], image: string, features: Feature[]): Promise<string> {
  let resp: Response;
  try {
    resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages, image, features }),
    });
  } catch (e) {
    throw new Error("Không kết nối được máy chủ AI: " + (e as Error).message);
  }

  let data: { text?: string; error?: string } = {};
  try {
    data = await resp.json();
  } catch {
    // handled below
  }

  if (!resp.ok) {
    if (resp.status === 404) {
      throw new Error("Không tìm thấy /api/chat. Tính năng AI chỉ chạy trên bản đã deploy (Cloudflare Pages).");
    }
    throw new Error(data.error || `Máy chủ lỗi (${resp.status}).`);
  }
  return data.text || "(Không có nội dung.)";
}

/** Ask Claude (via /api/generate, tool use) to design a 3D part from a description. */
export async function generateDesign(prompt: string): Promise<Design> {
  let resp: Response;
  try {
    resp = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
  } catch (e) {
    throw new Error("Không kết nối được máy chủ AI: " + (e as Error).message);
  }
  let data: { design?: Design; error?: string } = {};
  try {
    data = await resp.json();
  } catch {
    // handled below
  }
  if (!resp.ok) {
    if (resp.status === 404) {
      throw new Error("Không tìm thấy /api/generate. Tính năng AI chỉ chạy trên bản đã deploy.");
    }
    throw new Error(data.error || `Máy chủ lỗi (${resp.status}).`);
  }
  if (!data.design) throw new Error("AI không trả về thiết kế.");
  return data.design;
}
