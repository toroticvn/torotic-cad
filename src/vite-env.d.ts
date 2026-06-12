/// <reference types="vite/client" />

declare module "replicad-opencascadejs/src/replicad_single.js" {
  /** Emscripten module factory; returns the OpenCascade instance. */
  const factory: (opts?: { locateFile?: (path: string) => string }) => Promise<unknown>;
  export default factory;
}
