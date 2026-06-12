import * as THREE from "three";
import type { Viewport } from "../viewport/Viewport";
import { useViewportStore, uid, type SelRef, type SketchTool } from "../state/store";
import { SketchPlane, type Point2 } from "./SketchPlane";
import { planeForSketch, type ParametricSketch, type SketchPoint } from "./model";
import { sampleArc, circumcenter, isCcwThrough, distToArc } from "./arc";

const SNAP = 5;
const PICK_TOL = 6;
const MERGE_TOL = 3;
const HV_TOL = 4; // world units within which horizontal/vertical inference triggers
const CIRCLE_SEGMENTS = 64;
const CAM_DISTANCE = 220;

// SolidWorks-like colors on a light background.
const C_UNDER = 0x2f6fea; // under-defined geometry (blue)
const C_DEFINED = 0x1f2328; // fully-defined geometry (near black)
const C_CONSTRUCTION = 0x9aa3ad; // construction (dashed gray)
const C_SELECTED = 0xff8c00;
const C_POINT = 0x33373c;
const C_PREVIEW = 0x7f8a99;
const C_DIM = 0x3a4047;
const C_PLANE = 0x2f6fea;

const snap = (n: number) => Math.round(n / SNAP) * SNAP;

type Inference = "horizontal" | "vertical" | "coincident";

interface SnapResult {
  p: Point2;
  infer: Inference | null;
}

/**
 * Drives the SolidWorks-style parametric sketcher: drawing tools (line, corner
 * & center rectangle, circle, polygon), inference (auto horizontal/vertical/
 * coincident with on-screen glyphs and auto-added relations), construction
 * geometry, picking, and status-based coloring (blue = under-defined, black =
 * fully defined).
 */
export class SketchController {
  private readonly group = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly unsub: () => void;

  private plane: SketchPlane | null = null;
  private tool: SketchTool = "line";

  private pendingPointId: string | null = null;
  /** Accumulated point ids for multi-click tools (arcs, slot). */
  private chain: string[] = [];
  private dimFirstPoint: string | null = null;
  private cursor: Point2 | null = null;
  private activeInfer: Inference | null = null;

  constructor(private readonly viewport: Viewport) {
    this.group.name = "sketch";
    viewport.scene.add(this.group);

    const dom = viewport.renderer.domElement;
    dom.addEventListener("pointerdown", this.onPointerDown);
    dom.addEventListener("pointermove", this.onPointerMove);
    dom.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("keydown", this.onKeyDown);

    let prev = useViewportStore.getState();
    this.unsub = useViewportStore.subscribe((s) => {
      if (s.mode !== "sketch" && prev.mode === "sketch") this.deactivate();
      if (s.sketch !== prev.sketch) this.onSketchChanged(s.sketch);
      if (s.sketchTool !== prev.sketchTool) {
        this.tool = s.sketchTool;
        this.resetPending();
      }
      if (s.sketchVersion !== prev.sketchVersion || s.selection !== prev.selection) this.redraw();
      prev = s;
    });
  }

  private get sketch(): ParametricSketch | null {
    return useViewportStore.getState().sketch;
  }

  // ---- Camera / plane -------------------------------------------------------

  private onSketchChanged(sketch: ParametricSketch | null) {
    if (!sketch) {
      this.plane = null;
      this.pendingPointId = null;
      this.redraw();
      return;
    }
    this.plane = planeForSketch(sketch);
    this.tool = useViewportStore.getState().sketchTool;
    this.orientCamera();
    this.redraw();
  }

  private orientCamera() {
    if (!this.plane) return;
    const { camera, controls } = this.viewport;
    const frame = this.plane.cameraFrame(CAM_DISTANCE);
    camera.up.copy(frame.up);
    camera.position.copy(frame.position);
    controls.target.copy(this.plane.origin);
    controls.enableRotate = false;
    camera.lookAt(this.plane.origin);
    controls.update();
  }

  private deactivate() {
    this.plane = null;
    this.resetPending();
    this.cursor = null;
    this.activeInfer = null;
    const { camera, controls } = this.viewport;
    controls.enableRotate = true;
    camera.up.set(0, 1, 0);
    this.redraw();
  }

  // ---- Pointer --------------------------------------------------------------

  private pointerToPlane(e: PointerEvent): Point2 | null {
    if (!this.plane) return null;
    const rect = this.viewport.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.viewport.camera);
    const hit = this.raycaster.ray.intersectPlane(this.plane.mathPlane(), new THREE.Vector3());
    if (!hit) return null;
    return this.plane.from3D(hit);
  }

  /** Resolve a raw plane point into a snapped point + active inference. */
  private computeSnap(raw: Point2): SnapResult {
    const s = this.sketch;

    // 1. Coincident: snap onto an existing point.
    if (s) {
      let best: SketchPoint | null = null;
      let bd = PICK_TOL;
      for (const pt of s.points) {
        const d = Math.hypot(pt.x - raw.x, pt.y - raw.y);
        if (d <= bd) {
          bd = d;
          best = pt;
        }
      }
      if (best) return { p: { x: best.x, y: best.y }, infer: "coincident" };
    }

    // 2. Horizontal / vertical relative to the pending start (line tool).
    if (this.pendingPointId && this.tool === "line" && s) {
      const start = s.points.find((q) => q.id === this.pendingPointId);
      if (start) {
        const dx = Math.abs(raw.x - start.x);
        const dy = Math.abs(raw.y - start.y);
        if (dy <= HV_TOL && dy <= dx) return { p: { x: snap(raw.x), y: start.y }, infer: "horizontal" };
        if (dx <= HV_TOL && dx < dy) return { p: { x: start.x, y: snap(raw.y) }, infer: "vertical" };
      }
    }

    return { p: { x: snap(raw.x), y: snap(raw.y) }, infer: null };
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || !this.plane) return;
    const raw = this.pointerToPlane(e);
    if (!raw) return;

    if (this.tool === "select") return this.handleSelect(raw);
    if (this.tool === "dimension") return this.handleDimension(raw);
    if (this.tool === "trim") return this.handleTrim(raw);
    if (this.tool === "fillet") return this.handleFillet(raw);

    const { p, infer } = this.computeSnap(raw);
    this.handleDraw(p, infer);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.plane) return;
    const raw = this.pointerToPlane(e);
    const noDraw = this.tool === "select" || this.tool === "dimension" || this.tool === "trim" || this.tool === "fillet";
    if (!raw || noDraw) {
      this.cursor = raw ? { x: snap(raw.x), y: snap(raw.y) } : null;
      this.activeInfer = null;
      return;
    }
    const { p, infer } = this.computeSnap(raw);
    this.cursor = p;
    this.activeInfer = infer;
    this.redraw();
  };

  private resetPending() {
    this.pendingPointId = null;
    this.chain = [];
    this.dimFirstPoint = null;
  }

  private onContextMenu = (e: MouseEvent) => {
    if (this.plane && this.tool !== "select") {
      e.preventDefault();
      this.resetPending();
      this.redraw();
    }
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.plane) {
      this.resetPending();
      this.redraw();
    }
  };

  // ---- Drawing tools --------------------------------------------------------

  private get construction(): boolean {
    return useViewportStore.getState().construction;
  }

  private handleDraw(p: Point2, infer: Inference | null) {
    switch (this.tool) {
      case "line":
        return this.drawLine(p, infer);
      case "rectCorner":
        return this.drawRect(p, false);
      case "rectCenter":
        return this.drawRect(p, true);
      case "circle":
        return this.drawCircle(p);
      case "polygon":
        return this.drawPolygon(p);
      case "arcCenter":
        return this.drawArcCenter(p);
      case "arc3":
        return this.drawArc3(p);
      case "arcTangent":
        return this.drawArcTangent(p);
      case "slot":
        return this.drawSlot(p);
    }
  }

  /** Add a point id to the multi-click chain, creating the point if needed. */
  private pushChainPoint(p: Point2) {
    useViewportStore.getState().applyChange((s) => {
      this.chain.push(this.getOrCreatePoint(s, p));
    });
  }

  private chainPt(s: ParametricSketch, i: number): SketchPoint {
    return s.points.find((q) => q.id === this.chain[i])!;
  }

  // Centerpoint arc: center → start → end.
  private drawArcCenter(p: Point2) {
    if (this.chain.length < 2) return this.pushChainPoint(p);
    const cons = this.construction;
    useViewportStore.getState().applyChange((s) => {
      const center = this.chainPt(s, 0);
      const start = this.chainPt(s, 1);
      const r = Math.hypot(start.x - center.x, start.y - center.y);
      if (r <= 0) return;
      const ang = Math.atan2(p.y - center.y, p.x - center.x);
      const endPos = { x: center.x + Math.cos(ang) * r, y: center.y + Math.sin(ang) * r };
      const endId = this.getOrCreatePoint(s, endPos);
      const cross = (start.x - center.x) * (p.y - center.y) - (start.y - center.y) * (p.x - center.x);
      s.arcs.push({ id: uid("arc"), center: this.chain[0], start: this.chain[1], end: endId, ccw: cross > 0, construction: cons || undefined });
    });
    this.chain = [];
  }

  // 3-point arc: start → end → bulge.
  private drawArc3(p: Point2) {
    if (this.chain.length < 2) return this.pushChainPoint(p);
    const cons = this.construction;
    useViewportStore.getState().applyChange((s) => {
      const start = this.chainPt(s, 0);
      const end = this.chainPt(s, 1);
      const center = circumcenter(start, end, p);
      if (!center) return;
      const centerId = this.getOrCreatePoint(s, center);
      const ccw = isCcwThrough(center, start, end, p);
      s.arcs.push({ id: uid("arc"), center: centerId, start: this.chain[0], end: this.chain[1], ccw, construction: cons || undefined });
    });
    this.chain = [];
  }

  // Tangent arc: start (on an existing line) → end; arc tangent to that line.
  private drawArcTangent(p: Point2) {
    if (this.chain.length < 1) return this.pushChainPoint(p);
    const cons = this.construction;
    useViewportStore.getState().applyChange((s) => {
      const start = this.chainPt(s, 0);
      const line = s.lines.find((l) => l.p1 === this.chain[0] || l.p2 === this.chain[0]);
      if (!line) return; // tangent arc needs a line at the start point
      const otherId = line.p1 === this.chain[0] ? line.p2 : line.p1;
      const other = s.points.find((q) => q.id === otherId)!;
      const tx = start.x - other.x;
      const ty = start.y - other.y;
      const tl = Math.hypot(tx, ty);
      if (tl < 1e-6) return;
      const nx = -ty / tl;
      const ny = tx / tl;
      const ex = p.x - start.x;
      const ey = p.y - start.y;
      const ne = nx * ex + ny * ey;
      if (Math.abs(ne) < 1e-6) return; // end lies along the tangent — no arc
      const d = (ex * ex + ey * ey) / (2 * ne);
      const center = { x: start.x + nx * d, y: start.y + ny * d };
      const centerId = this.getOrCreatePoint(s, center);
      const endPos = { x: center.x + (p.x - center.x), y: center.y + (p.y - center.y) }; // ~p, kept free
      const endId = this.getOrCreatePoint(s, endPos);
      const ccw = (tx * ey - ty * ex) > 0;
      s.arcs.push({ id: uid("arc"), center: centerId, start: this.chain[0], end: endId, ccw, construction: cons || undefined });
    });
    this.chain = [];
  }

  // Straight slot: center1 → center2 → width.
  private drawSlot(p: Point2) {
    if (this.chain.length < 2) return this.pushChainPoint(p);
    const cons = this.construction;
    useViewportStore.getState().applyChange((s) => {
      const c1 = this.chainPt(s, 0);
      const c2 = this.chainPt(s, 1);
      const dx = c2.x - c1.x;
      const dy = c2.y - c1.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return;
      const ux = dx / len;
      const uy = dy / len;
      const px = -uy;
      const py = ux;
      const r = Math.abs(px * (p.x - c1.x) + py * (p.y - c1.y));
      if (r <= 0) return;
      const mk = (cx: number, cy: number, sx: number, sy: number) =>
        this.getOrCreatePoint(s, { x: cx + sx, y: cy + sy });
      const P1a = mk(c1.x, c1.y, px * r, py * r);
      const P1b = mk(c1.x, c1.y, -px * r, -py * r);
      const P2a = mk(c2.x, c2.y, px * r, py * r);
      const P2b = mk(c2.x, c2.y, -px * r, -py * r);
      const cflag = cons || undefined;
      s.lines.push({ id: uid("ln"), p1: P1a, p2: P2a, construction: cflag });
      s.lines.push({ id: uid("ln"), p1: P1b, p2: P2b, construction: cflag });
      // End caps (semicircles) bulging outward from the slot body.
      const via2 = { x: c2.x + ux * r, y: c2.y + uy * r };
      const ccw2 = isCcwThrough(c2, s.points.find((q) => q.id === P2a)!, s.points.find((q) => q.id === P2b)!, via2);
      s.arcs.push({ id: uid("arc"), center: this.chain[1], start: P2a, end: P2b, ccw: ccw2, construction: cflag });
      const via1 = { x: c1.x - ux * r, y: c1.y - uy * r };
      const ccw1 = isCcwThrough(c1, s.points.find((q) => q.id === P1b)!, s.points.find((q) => q.id === P1a)!, via1);
      s.arcs.push({ id: uid("arc"), center: this.chain[0], start: P1b, end: P1a, ccw: ccw1, construction: cflag });
    });
    this.chain = [];
  }

  private drawLine(p: Point2, infer: Inference | null) {
    const store = useViewportStore.getState();
    const cons = this.construction;
    if (!this.pendingPointId) {
      store.applyChange((s) => {
        this.pendingPointId = this.getOrCreatePoint(s, p);
      });
      return;
    }
    const fromId = this.pendingPointId;
    let nextId: string | null = null;
    let lineId: string | null = null;
    store.applyChange((s) => {
      const from = s.points.find((q) => q.id === fromId)!;
      if (from.x === p.x && from.y === p.y) return;
      nextId = this.getOrCreatePoint(s, p);
      lineId = uid("ln");
      s.lines.push({ id: lineId, p1: fromId, p2: nextId, construction: cons || undefined });
      if (infer === "horizontal") s.constraints.push({ id: uid("con"), type: "horizontal", line: lineId });
      if (infer === "vertical") s.constraints.push({ id: uid("con"), type: "vertical", line: lineId });
    });
    if (nextId) this.pendingPointId = nextId;
  }

  private drawRect(p: Point2, fromCenter: boolean) {
    const store = useViewportStore.getState();
    const cons = this.construction;
    if (!this.pendingPointId) {
      store.applyChange((s) => {
        this.pendingPointId = this.getOrCreatePoint(s, p);
      });
      return;
    }
    const anchorId = this.pendingPointId;
    store.applyChange((s) => {
      const a = s.points.find((q) => q.id === anchorId)!;
      let corners: Point2[];
      if (fromCenter) {
        const dx = Math.abs(p.x - a.x);
        const dy = Math.abs(p.y - a.y);
        corners = [
          { x: a.x - dx, y: a.y - dy },
          { x: a.x + dx, y: a.y - dy },
          { x: a.x + dx, y: a.y + dy },
          { x: a.x - dx, y: a.y + dy },
        ];
      } else {
        corners = [
          { x: a.x, y: a.y },
          { x: p.x, y: a.y },
          { x: p.x, y: p.y },
          { x: a.x, y: p.y },
        ];
      }
      const ids = corners.map((c) => this.getOrCreatePoint(s, c));
      const lineIds = [0, 1, 2, 3].map((i) => {
        const id = uid("ln");
        s.lines.push({ id, p1: ids[i], p2: ids[(i + 1) % 4], construction: cons || undefined });
        return id;
      });
      // Rectangles imply horizontal bottom/top and vertical sides.
      s.constraints.push({ id: uid("con"), type: "horizontal", line: lineIds[0] });
      s.constraints.push({ id: uid("con"), type: "horizontal", line: lineIds[2] });
      s.constraints.push({ id: uid("con"), type: "vertical", line: lineIds[1] });
      s.constraints.push({ id: uid("con"), type: "vertical", line: lineIds[3] });
    });
    this.pendingPointId = null;
  }

  private drawCircle(p: Point2) {
    const store = useViewportStore.getState();
    const cons = this.construction;
    if (!this.pendingPointId) {
      store.applyChange((s) => {
        this.pendingPointId = this.getOrCreatePoint(s, p);
      });
      return;
    }
    const centerId = this.pendingPointId;
    store.applyChange((s) => {
      const c = s.points.find((q) => q.id === centerId)!;
      const r = Math.hypot(p.x - c.x, p.y - c.y);
      if (r > 0) s.circles.push({ id: uid("cir"), center: centerId, r, construction: cons || undefined });
    });
    this.pendingPointId = null;
  }

  private drawPolygon(p: Point2) {
    const store = useViewportStore.getState();
    const cons = this.construction;
    const sides = store.polygonSides;
    if (!this.pendingPointId) {
      store.applyChange((s) => {
        this.pendingPointId = this.getOrCreatePoint(s, p);
      });
      return;
    }
    const centerId = this.pendingPointId;
    store.applyChange((s) => {
      const c = s.points.find((q) => q.id === centerId)!;
      const r = Math.hypot(p.x - c.x, p.y - c.y);
      if (r <= 0) return;
      const base = Math.atan2(p.y - c.y, p.x - c.x);
      const ids: string[] = [];
      for (let i = 0; i < sides; i++) {
        const t = base + (i / sides) * Math.PI * 2;
        ids.push(this.getOrCreatePoint(s, { x: c.x + Math.cos(t) * r, y: c.y + Math.sin(t) * r }));
      }
      for (let i = 0; i < sides; i++)
        s.lines.push({ id: uid("ln"), p1: ids[i], p2: ids[(i + 1) % sides], construction: cons || undefined });
      // SolidWorks adds a construction circle through the vertices.
      s.circles.push({ id: uid("cir"), center: centerId, r, construction: true });
    });
    this.pendingPointId = null;
  }

  private getOrCreatePoint(s: ParametricSketch, p: Point2): string {
    const existing = s.points.find((q) => Math.hypot(q.x - p.x, q.y - p.y) <= MERGE_TOL);
    if (existing) return existing.id;
    const point: SketchPoint = { id: uid("pt"), x: p.x, y: p.y };
    s.points.push(point);
    return point.id;
  }

  // ---- Select & dimension ---------------------------------------------------

  private handleSelect(raw: Point2) {
    const hit = this.pick(raw);
    const store = useViewportStore.getState();
    if (!hit) return store.setSelection([]);
    const existing = store.selection.find((s) => s.kind === hit.kind && s.id === hit.id);
    const next = existing
      ? store.selection.filter((s) => !(s.kind === hit.kind && s.id === hit.id))
      : [...store.selection, hit].slice(-2);
    store.setSelection(next);
  }

  private handleDimension(raw: Point2) {
    const hit = this.pick(raw);
    if (!hit) return;
    const store = useViewportStore.getState();
    if (hit.kind === "circle") return store.addRadiusDim(hit.id);
    if (hit.kind === "line") {
      const line = this.sketch!.lines.find((l) => l.id === hit.id)!;
      return store.addDistanceDim(line.p1, line.p2);
    }
    if (!this.dimFirstPoint) {
      this.dimFirstPoint = hit.id;
      store.setSelection([hit]);
    } else if (this.dimFirstPoint !== hit.id) {
      store.addDistanceDim(this.dimFirstPoint, hit.id);
      this.dimFirstPoint = null;
      store.setSelection([]);
    }
  }

  // Trim: click an entity to delete it (simple power-trim).
  private handleTrim(raw: Point2) {
    const hit = this.pick(raw);
    if (!hit) return;
    useViewportStore.getState().applyChange((s) => {
      if (hit.kind === "line") s.lines = s.lines.filter((l) => l.id !== hit.id);
      else if (hit.kind === "circle") s.circles = s.circles.filter((c) => c.id !== hit.id);
      else if (hit.kind === "arc") s.arcs = s.arcs.filter((a) => a.id !== hit.id);
      pruneOrphanPoints(s);
    });
  }

  // Sketch fillet: click a corner shared by two lines → tangent arc of filletRadius.
  private handleFillet(raw: Point2) {
    const s = this.sketch;
    if (!s) return;
    const R = useViewportStore.getState().filletRadius;
    const corner = s.points.find((q) => Math.hypot(q.x - raw.x, q.y - raw.y) <= PICK_TOL);
    if (!corner) return;
    const incident = s.lines.filter((l) => l.p1 === corner.id || l.p2 === corner.id);
    if (incident.length !== 2) return;

    useViewportStore.getState().applyChange((s2) => {
      const P = s2.points.find((q) => q.id === corner.id)!;
      const [L1, L2] = incident.map((l) => s2.lines.find((x) => x.id === l.id)!);
      const o1Id = L1.p1 === P.id ? L1.p2 : L1.p1;
      const o2Id = L2.p1 === P.id ? L2.p2 : L2.p1;
      const o1 = s2.points.find((q) => q.id === o1Id)!;
      const o2 = s2.points.find((q) => q.id === o2Id)!;

      const u1 = unit(o1.x - P.x, o1.y - P.y);
      const u2 = unit(o2.x - P.x, o2.y - P.y);
      if (!u1 || !u2) return;
      const dot = clamp(u1.x * u2.x + u1.y * u2.y, -1, 1);
      const theta = Math.acos(dot);
      const half = theta / 2;
      if (half < 1e-3 || Math.PI - half < 1e-3) return; // collinear
      const t = R / Math.tan(half);
      const l1len = Math.hypot(o1.x - P.x, o1.y - P.y);
      const l2len = Math.hypot(o2.x - P.x, o2.y - P.y);
      if (t >= l1len || t >= l2len) return; // fillet too large for these edges

      const T1 = { x: P.x + u1.x * t, y: P.y + u1.y * t };
      const T2 = { x: P.x + u2.x * t, y: P.y + u2.y * t };
      const bis = unit(u1.x + u2.x, u1.y + u2.y);
      if (!bis) return;
      const center = { x: P.x + bis.x * (R / Math.sin(half)), y: P.y + bis.y * (R / Math.sin(half)) };

      const t1Id = this.getOrCreatePoint(s2, T1);
      const t2Id = this.getOrCreatePoint(s2, T2);
      const centerId = this.getOrCreatePoint(s2, center);

      if (L1.p1 === P.id) L1.p1 = t1Id;
      else L1.p2 = t1Id;
      if (L2.p1 === P.id) L2.p1 = t2Id;
      else L2.p2 = t2Id;

      const a1 = Math.atan2(T1.y - center.y, T1.x - center.x);
      const a2 = Math.atan2(T2.y - center.y, T2.x - center.x);
      const ccw = ((((a2 - a1) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) <= Math.PI;
      s2.arcs.push({ id: uid("arc"), center: centerId, start: t1Id, end: t2Id, ccw });
      pruneOrphanPoints(s2);
    });
  }

  private pick(p: Point2): SelRef | null {
    const s = this.sketch;
    if (!s) return null;

    let bestPt: SelRef | null = null;
    let bestPtD = PICK_TOL;
    for (const pt of s.points) {
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (d <= bestPtD) {
        bestPtD = d;
        bestPt = { kind: "point", id: pt.id };
      }
    }
    if (bestPt) return bestPt;

    let best: SelRef | null = null;
    let bestD = PICK_TOL;
    for (const ln of s.lines) {
      const a = s.points.find((q) => q.id === ln.p1)!;
      const b = s.points.find((q) => q.id === ln.p2)!;
      const d = distToSegment(p, a, b);
      if (d <= bestD) {
        bestD = d;
        best = { kind: "line", id: ln.id };
      }
    }
    for (const arc of s.arcs) {
      const c = s.points.find((q) => q.id === arc.center)!;
      const a = s.points.find((q) => q.id === arc.start)!;
      const b = s.points.find((q) => q.id === arc.end)!;
      const d = distToArc(c, a, b, arc.ccw, p);
      if (d <= bestD) {
        bestD = d;
        best = { kind: "arc", id: arc.id };
      }
    }
    for (const c of s.circles) {
      const ctr = s.points.find((q) => q.id === c.center)!;
      const d = Math.abs(Math.hypot(ctr.x - p.x, ctr.y - p.y) - c.r);
      if (d <= bestD) {
        bestD = d;
        best = { kind: "circle", id: c.id };
      }
    }
    return best;
  }

  // ---- Rendering ------------------------------------------------------------

  private redraw() {
    this.group.clear();
    if (!this.plane) return;
    const s = this.sketch;
    this.group.add(this.buildPlaneVisual());
    if (!s) return;

    const state = useViewportStore.getState();
    const selection = state.selection;
    const hasGeom = s.lines.length > 0 || s.circles.length > 0;
    const baseColor = hasGeom && state.dof === 0 ? C_DEFINED : C_UNDER;
    const isSel = (kind: SelRef["kind"], id: string) =>
      selection.some((x) => x.kind === kind && x.id === id);

    const pt = (id: string) => s.points.find((q) => q.id === id)!;

    for (const ln of s.lines) {
      const color = isSel("line", ln.id) ? C_SELECTED : ln.construction ? C_CONSTRUCTION : baseColor;
      this.group.add(this.line3(pt(ln.p1), pt(ln.p2), color, ln.construction));
    }
    for (const c of s.circles) {
      const color = isSel("circle", c.id) ? C_SELECTED : c.construction ? C_CONSTRUCTION : baseColor;
      this.group.add(this.circle3(pt(c.center), c.r, color, c.construction));
    }
    for (const arc of s.arcs) {
      const color = isSel("arc", arc.id) ? C_SELECTED : arc.construction ? C_CONSTRUCTION : baseColor;
      this.group.add(this.arc3(pt(arc.center), pt(arc.start), pt(arc.end), arc.ccw, color, arc.construction));
    }
    for (const p of s.points) {
      this.group.add(this.point3(p, isSel("point", p.id) ? C_SELECTED : C_POINT));
    }
    for (const d of s.dimensions) this.buildDimension(d, pt).forEach((o) => this.group.add(o));

    const preview = this.buildPreview();
    if (preview) this.group.add(preview);
    const glyph = this.buildInferGlyph();
    if (glyph) this.group.add(glyph);
  }

  private buildPreview(): THREE.Object3D | null {
    if (this.chain.length > 0 && this.cursor) {
      const cp = this.buildChainPreview();
      if (cp) return cp;
    }
    if (!this.pendingPointId || !this.cursor) return null;
    const s = this.sketch;
    if (!s) return null;
    const a = s.points.find((q) => q.id === this.pendingPointId);
    if (!a) return null;
    const p = this.cursor;

    if (this.tool === "circle" || this.tool === "polygon") {
      return this.circle3(a, Math.hypot(p.x - a.x, p.y - a.y), C_PREVIEW, this.tool === "polygon");
    }
    if (this.tool === "rectCorner" || this.tool === "rectCenter") {
      const fromCenter = this.tool === "rectCenter";
      const dx = fromCenter ? Math.abs(p.x - a.x) : 0;
      const dy = fromCenter ? Math.abs(p.y - a.y) : 0;
      const corners: Point2[] = fromCenter
        ? [
            { x: a.x - dx, y: a.y - dy },
            { x: a.x + dx, y: a.y - dy },
            { x: a.x + dx, y: a.y + dy },
            { x: a.x - dx, y: a.y + dy },
          ]
        : [
            { x: a.x, y: a.y },
            { x: p.x, y: a.y },
            { x: p.x, y: p.y },
            { x: a.x, y: p.y },
          ];
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) g.add(this.line3(corners[i], corners[(i + 1) % 4], C_PREVIEW));
      return g;
    }
    return this.line3(a, p, C_PREVIEW);
  }

  private buildChainPreview(): THREE.Object3D | null {
    const s = this.sketch;
    if (!s || !this.cursor) return null;
    const p = this.cursor;
    const cp = (i: number) => s.points.find((q) => q.id === this.chain[i]);

    if (this.tool === "arcCenter") {
      const center = cp(0)!;
      if (this.chain.length === 1) return this.line3(center, p, C_PREVIEW);
      const start = cp(1)!;
      const r = Math.hypot(start.x - center.x, start.y - center.y);
      const ang = Math.atan2(p.y - center.y, p.x - center.x);
      const end = { x: center.x + Math.cos(ang) * r, y: center.y + Math.sin(ang) * r };
      const cross = (start.x - center.x) * (p.y - center.y) - (start.y - center.y) * (p.x - center.x);
      return this.arc3(center, start, end, cross > 0, C_PREVIEW);
    }
    if (this.tool === "arc3") {
      const start = cp(0)!;
      if (this.chain.length === 1) return this.line3(start, p, C_PREVIEW);
      const end = cp(1)!;
      const center = circumcenter(start, end, p);
      if (!center) return this.line3(start, end, C_PREVIEW);
      return this.arc3(center, start, end, isCcwThrough(center, start, end, p), C_PREVIEW);
    }
    if (this.tool === "arcTangent") {
      const start = cp(0)!;
      return this.line3(start, p, C_PREVIEW);
    }
    if (this.tool === "slot") {
      const c1 = cp(0)!;
      if (this.chain.length === 1) return this.line3(c1, p, C_PREVIEW);
      const c2 = cp(1)!;
      const len = Math.hypot(c2.x - c1.x, c2.y - c1.y);
      if (len < 1e-6) return this.line3(c1, c2, C_PREVIEW);
      const ux = (c2.x - c1.x) / len;
      const uy = (c2.y - c1.y) / len;
      const px = -uy;
      const py = ux;
      const r = Math.abs(px * (p.x - c1.x) + py * (p.y - c1.y));
      const g = new THREE.Group();
      g.add(this.line3({ x: c1.x + px * r, y: c1.y + py * r }, { x: c2.x + px * r, y: c2.y + py * r }, C_PREVIEW));
      g.add(this.line3({ x: c1.x - px * r, y: c1.y - py * r }, { x: c2.x - px * r, y: c2.y - py * r }, C_PREVIEW));
      g.add(this.arc3(c2, { x: c2.x + px * r, y: c2.y + py * r }, { x: c2.x - px * r, y: c2.y - py * r }, isCcwThrough(c2, { x: c2.x + px * r, y: c2.y + py * r }, { x: c2.x - px * r, y: c2.y - py * r }, { x: c2.x + ux * r, y: c2.y + uy * r }), C_PREVIEW));
      g.add(this.arc3(c1, { x: c1.x - px * r, y: c1.y - py * r }, { x: c1.x + px * r, y: c1.y + py * r }, isCcwThrough(c1, { x: c1.x - px * r, y: c1.y - py * r }, { x: c1.x + px * r, y: c1.y + py * r }, { x: c1.x - ux * r, y: c1.y - uy * r }), C_PREVIEW));
      return g;
    }
    return null;
  }

  private buildInferGlyph(): THREE.Object3D | null {
    if (!this.activeInfer || !this.cursor) return null;
    const symbol = this.activeInfer === "horizontal" ? "—" : this.activeInfer === "vertical" ? "│" : "◎";
    return this.glyph3({ x: this.cursor.x + 6, y: this.cursor.y + 6 }, symbol);
  }

  private line3(a: Point2, b: Point2, color: number, dashed = false): THREE.Object3D {
    const pts = [this.plane!.to3D(a), this.plane!.to3D(b)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    if (dashed) {
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color, dashSize: 3, gapSize: 2 }));
      line.computeLineDistances();
      return line;
    }
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
  }

  private circle3(center: Point2, r: number, color: number, dashed = false): THREE.Object3D {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= CIRCLE_SEGMENTS; i++) {
      const t = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
      pts.push(this.plane!.to3D({ x: center.x + Math.cos(t) * r, y: center.y + Math.sin(t) * r }));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    if (dashed) {
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color, dashSize: 3, gapSize: 2 }));
      line.computeLineDistances();
      return line;
    }
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
  }

  private arc3(center: Point2, start: Point2, end: Point2, ccw: boolean, color: number, dashed = false): THREE.Object3D {
    const pts2 = sampleArc(center, start, end, ccw);
    const geo = new THREE.BufferGeometry().setFromPoints(pts2.map((q) => this.plane!.to3D(q)));
    if (dashed) {
      const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color, dashSize: 3, gapSize: 2 }));
      line.computeLineDistances();
      return line;
    }
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
  }

  private point3(p: Point2, color: number): THREE.Object3D {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 8, 8),
      new THREE.MeshBasicMaterial({ color, depthTest: false })
    );
    m.position.copy(this.plane!.to3D(p));
    m.renderOrder = 2;
    return m;
  }

  private buildDimension(
    d: ParametricSketch["dimensions"][number],
    pt: (id: string) => SketchPoint
  ): THREE.Object3D[] {
    const objs: THREE.Object3D[] = [];
    if (d.kind === "distance" && d.refs.length === 2) {
      const a = pt(d.refs[0]);
      const b = pt(d.refs[1]);
      objs.push(this.line3(a, b, C_DIM));
      objs.push(this.label3({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, `${round(d.value)}`));
    } else if (d.kind === "radius" && d.refs.length === 1) {
      const c = this.sketch!.circles.find((q) => q.id === d.refs[0]);
      if (c) {
        const ctr = pt(c.center);
        objs.push(this.line3(ctr, { x: ctr.x + c.r, y: ctr.y }, C_DIM));
        objs.push(this.label3({ x: ctr.x + c.r / 2, y: ctr.y }, `R${round(d.value)}`));
      }
    }
    return objs;
  }

  private label3(p: Point2, text: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.strokeStyle = "#9aa3ad";
    ctx.lineWidth = 3;
    roundRect(ctx, 4, 12, 248, 40, 8);
    ctx.fill();
    ctx.stroke();
    ctx.font = "bold 30px Segoe UI, sans-serif";
    ctx.fillStyle = "#1f2328";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    sprite.position.copy(this.plane!.to3D(p));
    sprite.scale.set(30, 7.5, 1);
    sprite.renderOrder = 3;
    return sprite;
  }

  private glyph3(p: Point2, symbol: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#ff8c00";
    ctx.lineWidth = 4;
    roundRect(ctx, 6, 6, 52, 52, 8);
    ctx.fill();
    ctx.stroke();
    ctx.font = "bold 40px Segoe UI, sans-serif";
    ctx.fillStyle = "#ff8c00";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(symbol, 32, 34);

    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, color: 0xffffff }));
    sprite.position.copy(this.plane!.to3D(p));
    sprite.scale.set(9, 9, 1);
    sprite.renderOrder = 4;
    return sprite;
  }

  private buildPlaneVisual(): THREE.Object3D {
    const s = 200;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(s, s),
      new THREE.MeshBasicMaterial({
        color: C_PLANE,
        transparent: true,
        opacity: 0.05,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const m = new THREE.Matrix4().makeBasis(this.plane!.u, this.plane!.v, this.plane!.normal);
    mesh.quaternion.setFromRotationMatrix(m);
    mesh.position.copy(this.plane!.origin);
    return mesh;
  }

  dispose() {
    const dom = this.viewport.renderer.domElement;
    dom.removeEventListener("pointerdown", this.onPointerDown);
    dom.removeEventListener("pointermove", this.onPointerMove);
    dom.removeEventListener("contextmenu", this.onContextMenu);
    window.removeEventListener("keydown", this.onKeyDown);
    this.unsub();
    this.viewport.scene.remove(this.group);
  }
}

function distToSegment(p: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function unit(x: number, y: number): { x: number; y: number } | null {
  const l = Math.hypot(x, y);
  return l < 1e-9 ? null : { x: x / l, y: y / l };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Remove points no longer referenced by any geometry or dimension. */
function pruneOrphanPoints(s: ParametricSketch) {
  const used = new Set<string>();
  for (const l of s.lines) {
    used.add(l.p1);
    used.add(l.p2);
  }
  for (const c of s.circles) used.add(c.center);
  for (const a of s.arcs) {
    used.add(a.center);
    used.add(a.start);
    used.add(a.end);
  }
  for (const d of s.dimensions) if (d.kind === "distance") d.refs.forEach((r) => used.add(r));
  s.points = s.points.filter((p) => used.has(p.id) || p.fixed);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const round = (n: number) => Math.round(n * 100) / 100;
