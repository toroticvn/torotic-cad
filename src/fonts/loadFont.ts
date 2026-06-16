import * as opentype from "opentype.js";
import fontUrl from "./Roboto-Regular.ttf?url";
import { setFont, fontReady } from "../sketch/text";

/**
 * Browser glue: fetch the bundled .ttf (Vite hashes/serves it via `?url`), parse
 * it with opentype, and hand the Font to the pure text module. Isolated here so
 * the Node test never touches Vite's `?url` import. Loads once; safe to await
 * repeatedly. The AI/text path calls this before building a text profile.
 */
let pending: Promise<void> | null = null;

export function ensureFont(): Promise<void> {
  if (fontReady()) return Promise.resolve();
  if (!pending) {
    pending = fetch(fontUrl)
      .then((r) => r.arrayBuffer())
      .then((buf) => setFont(opentype.parse(buf)))
      .catch((e) => {
        pending = null; // allow a retry
        throw new Error("Không tải được font cho công cụ Text: " + (e as Error).message);
      });
  }
  return pending;
}
