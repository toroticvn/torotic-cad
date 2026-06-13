import { useEffect, useRef } from "react";
import { Viewport } from "./Viewport";
import { SketchController } from "../sketch/SketchController";
import { useViewportStore } from "../state/store";

/** React wrapper that mounts a Viewport + SketchController and exposes them. */
export function ViewportCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const setViewport = useViewportStore((s) => s.setViewport);

  useEffect(() => {
    if (!hostRef.current) return;
    const viewport = new Viewport(hostRef.current);
    const sketch = new SketchController(viewport);
    setViewport(viewport);

    // 3D edge picking for fillet/chamfer: a click (not a drag) while an
    // edge-select session is active selects the nearest solid edge.
    const dom = viewport.renderer.domElement;
    let downX = 0;
    let downY = 0;
    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const onUp = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const st = useViewportStore.getState();
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return; // was a drag
      if (st.edgeSelect) {
        const p = viewport.pickEdgePoint(e.clientX, e.clientY);
        if (p) st.addEdgePoint(p);
      } else if (st.shellSession) {
        const f = viewport.pickFace(e.clientX, e.clientY);
        if (f) st.addShellFace(f.o);
      } else if (st.extrudeSession) {
        const idx = viewport.pickRegion(e.clientX, e.clientY);
        if (idx !== null) st.toggleExtrudeRegion(idx);
      } else if (st.mode === "sketch" && !st.sketch) {
        // Choosing a sketch plane: click a solid face to sketch on it.
        const f = viewport.pickFace(e.clientX, e.clientY);
        if (f) st.startSketchOnFace(f.o, f.n);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (useViewportStore.getState().edgeSelect) viewport.updateHover(e.clientX, e.clientY);
      else viewport.clearHover();
    };
    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointermove", onMove);

    return () => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointermove", onMove);
      setViewport(null);
      sketch.dispose();
      viewport.dispose();
    };
  }, [setViewport]);

  return <div ref={hostRef} className="viewport" />;
}
