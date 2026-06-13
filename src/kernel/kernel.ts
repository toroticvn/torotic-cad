import { setOC } from "replicad";
import ocFactory from "replicad-opencascadejs/src/replicad_single.js";
import ocWasmUrl from "replicad-opencascadejs/src/replicad_single.wasm?url";

/**
 * Kernel entry point: loads the OpenCASCADE WASM once, then exposes the rebuild
 * engine. The actual geometry logic lives in rebuild.ts/profile.ts (WASM-url
 * free) so it can be unit tested in Node.
 */

export { ExtrudeError } from "./profile";
export { rebuildBodies, rebuildSolids, exportSolid, solidEdges, type MeshData, type Triple } from "./rebuild";

let ocReady: Promise<void> | null = null;

/** Load the WASM kernel once (idempotent). */
export function initKernel(): Promise<void> {
  if (!ocReady) {
    ocReady = ocFactory({ locateFile: () => ocWasmUrl }).then((oc) => {
      setOC(oc as Parameters<typeof setOC>[0]);
    });
  }
  return ocReady;
}
