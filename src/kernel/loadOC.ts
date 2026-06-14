// Shared OpenCASCADE WASM loader for the Node runtime tests. The emscripten
// module double-wraps its factory under ESM `.default` interop, so we unwrap
// nested defaults until we reach the callable factory, then init replicad.
import { setOC } from "replicad";
import * as ocNs from "replicad-opencascadejs/src/replicad_single.js";
import path from "node:path";

function unwrap(m: unknown): (o: unknown) => Promise<unknown> {
  let cur = m;
  for (let i = 0; i < 4 && cur && typeof cur !== "function"; i++) cur = (cur as { default?: unknown }).default;
  return cur as (o: unknown) => Promise<unknown>;
}

export async function loadOC(): Promise<void> {
  const wasmPath = path.resolve("node_modules/replicad-opencascadejs/src/replicad_single.wasm");
  const ocFactory = unwrap(ocNs);
  setOC((await ocFactory({ locateFile: () => wasmPath })) as Parameters<typeof setOC>[0]);
}
