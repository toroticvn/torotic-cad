import { create } from "zustand";
import type { Viewport } from "../viewport/Viewport";
import type { PlaneId } from "../sketch/SketchPlane";
import {
  emptySketch,
  planeForSketch,
  type GeomConstraint,
  type GeomConstraintInput,
  type ParametricSketch,
} from "../sketch/model";
import { solveSketch } from "../sketch/solveSketch";
import { initKernel, rebuildSolids, exportSolid, solidEdges, ExtrudeError } from "../kernel/kernel";
import { isSketch, producesSolid, consumedSketchIds, type BoolOp, type EdgePoint, type Feature } from "../features";
import { buildSketchGroup, buildDatumPlane } from "../sketch/render3d";
import { resolvePlane } from "../sketch/SketchPlane";
import { findRegions } from "../kernel/profile";
import { chat as chatRequest, generateDesign as requestDesign, type ChatTurn } from "../ai/api";
import { buildClaudePrompt } from "../ai/prompt";
import { designToFeatures } from "../ai/design";
import {
  cloneEntities,
  relId,
  offsetEntities,
  reflectAcross,
  rotateAbout,
  selectionCentroid,
  transformPoints,
  scaleSelectionRadii,
} from "../sketch/transform";

export type SketchTool =
  | "select"
  | "line"
  | "centerline"
  | "point"
  | "rectCorner"
  | "rectCenter"
  | "rect3"
  | "parallelogram"
  | "circle"
  | "circle3"
  | "polygon"
  | "arcCenter"
  | "arc3"
  | "arcTangent"
  | "ellipse"
  | "spline"
  | "slot"
  | "arcSlot"
  | "trim"
  | "extend"
  | "split"
  | "fillet"
  | "sketchChamfer"
  | "dimension";

/** A reference to a pickable entity in the sketch. */
export interface SelRef {
  kind: "point" | "line" | "circle" | "arc";
  id: string;
}

export type EditorMode = "model" | "sketch";

interface AppState {
  viewport: Viewport | null;
  mode: EditorMode;
  features: Feature[];
  selectedFeatureId: string | null;
  /** Undo/redo history of feature-tree snapshots. */
  past: Feature[][];
  future: Feature[][];

  // --- Active sketch session ---
  sketchPlaneId: PlaneId | null;
  sketch: ParametricSketch | null;
  /** When editing an existing sketch feature, its id (else null = new sketch). */
  editingSketchId: string | null;
  sketchTool: SketchTool;
  selection: SelRef[];
  sketchVersion: number;
  solveOk: boolean;
  dimErrors: Record<string, string>;
  dof: number;
  construction: boolean;
  polygonSides: number;
  filletRadius: number;
  /** Offset tool distance. */
  offsetDistance: number;
  /** Linear/Circular pattern parameters. */
  patternCount: number;
  patternSpacing: number;
  patternAngle: number; // linear: direction in degrees
  patternTotalAngle: number; // circular: total sweep in degrees
  /** Move/Rotate/Scale parameters for selection transforms. */
  moveDx: number;
  moveDy: number;
  rotateAngleDeg: number;
  scaleFactor: number;

  // --- Kernel / feature dialogs ---
  kernelStatus: "idle" | "loading" | "ready" | "error";
  /** Active extrude session: pick contours + distance/operation (SolidWorks-like). */
  extrudeSession: { sketchId: string; distance: number; operation: BoolOp; flip: boolean; midplane: boolean; selected: number[]; regionCount: number } | null;
  revolveTargetId: string | null; // sketch feature id for the revolve dialog
  loftOpen: boolean;
  sweepOpen: boolean;
  /** Active 3D edge-selection session for fillet/chamfer (null = inactive). */
  edgeSelect: { kind: "fillet" | "chamfer"; radius: number; points: EdgePoint[] } | null;
  /** Active 3D face-selection session for Shell (null = inactive). */
  shellSession: { thickness: number; points: EdgePoint[] } | null;
  /** Active 3D face-selection session for Draft (null = inactive). */
  draftSession: { angle: number; neutralPlane: "XY" | "XZ" | "YZ"; points: EdgePoint[] } | null;
  featureError: string | null;
  busy: boolean;

  // --- AI chat assistant (Claude) ---
  chatOpen: boolean;
  chatBusy: boolean;
  chatError: string | null;
  chatMessages: ChatTurn[];
  openChat: () => void;
  closeChat: () => void;
  sendChat: (text: string) => Promise<void>;
  /** Preset: open chat and ask Claude to review the current drawing. */
  evaluateDrawing: () => Promise<void>;
  /** Manual path: export image + prompt to use with a claude.ai subscription. */
  askClaudeAi: () => void;

  // --- AI draw: generate a model from a text description ---
  aiDrawOpen: boolean;
  aiDrawBusy: boolean;
  aiDrawError: string | null;
  openAiDraw: () => void;
  closeAiDraw: () => void;
  generateDesign: (prompt: string) => Promise<void>;

  /** Generic info modal (string = message shown; null = hidden). */
  notice: string | null;
  dismissNotice: () => void;

  setViewport: (v: Viewport | null) => void;
  selectFeature: (id: string | null) => void;

  // Feature creation
  openExtrude: (sketchId: string) => void;
  openRevolve: (sketchId: string) => void;
  openLoft: () => void;
  openSweep: () => void;
  cancelFeatureDialog: () => void;
  // Extrude contour-selection session
  toggleExtrudeRegion: (i: number) => void;
  setExtrudeDistance: (d: number) => void;
  setExtrudeOperation: (op: BoolOp) => void;
  setExtrudeFlip: (flip: boolean) => void;
  setExtrudeMidplane: (midplane: boolean) => void;
  applyExtrude: () => Promise<void>;
  cancelExtrude: () => void;
  runRevolve: (angle: number, axis: "u" | "v", operation: BoolOp) => Promise<void>;
  runLoft: (sketchIds: string[], operation: BoolOp) => Promise<void>;
  runSweep: (profileSketchId: string, pathSketchId: string, operation: BoolOp) => Promise<void>;

  // 3D edge selection for fillet/chamfer
  startEdgeSelect: (kind: "fillet" | "chamfer") => void;
  addEdgePoint: (p: EdgePoint) => void;
  setEdgeSelectRadius: (r: number) => void;
  applyEdgeSelect: () => void;
  cancelEdgeSelect: () => void;

  // 3D face selection for Shell
  startShell: () => void;
  addShellFace: (p: EdgePoint) => void;
  setShellThickness: (t: number) => void;
  applyShell: () => void;
  cancelShell: () => void;

  // 3D face selection for Draft
  startDraft: () => void;
  addDraftFace: (p: EdgePoint) => void;
  setDraftAngle: (a: number) => void;
  setDraftNeutral: (p: "XY" | "XZ" | "YZ") => void;
  applyDraft: () => void;
  cancelDraft: () => void;

  // Feature editing
  updateFeature: (
    id: string,
    patch: Partial<{
      distance: number;
      angle: number;
      axis: string;
      operation: BoolOp;
      radius: number;
      count: number;
      dx: number;
      dy: number;
      dz: number;
      plane: string;
      flip: boolean;
      midplane: boolean;
      merge: boolean;
      base: string;
      offset: number;
      diameter: number;
      pitch: number;
      length: number;
      x: number;
      y: number;
      z: number;
    }>,
  ) => void;
  deleteFeature: (id: string) => void;
  editSketch: (id: string) => void;
  addModifier: (kind: "fillet" | "chamfer") => void;
  /** Add a 3D body operation (mirror / linear pattern / circular pattern). */
  addBodyOp: (kind: "mirrorBody" | "patternLinear" | "patternCircular") => void;
  /** Add a real helical thread (external) as its own body. */
  addThread: () => void;
  /** Add a reference datum plane (parallel to a standard plane, offset). */
  addRefPlane: () => void;
  /** Pattern a single feature (the given extrude/revolve) linearly or circularly. */
  addFeaturePattern: (kind: "featPatternLinear" | "featPatternCircular", targetId: string) => void;
  /** Mirror a single feature (the given extrude/revolve) across a standard plane. */
  addFeatureMirror: (targetId: string) => void;
  exportModel: (format: "step" | "stl") => Promise<void>;

  undo: () => void;
  redo: () => void;
  saveProject: () => void;
  loadProject: (json: string) => void;

  // Sketch session
  enterSketch: () => void;
  startSketchOnPlane: (planeId: PlaneId, offset?: number) => void;
  /** Start a sketch on a solid face (origin + normal in world coords). */
  startSketchOnFace: (o: [number, number, number], n: [number, number, number]) => void;
  setSketchTool: (t: SketchTool) => void;
  finishSketch: () => void;
  cancelSketch: () => void;
  /** Convert Entities: project the solid's coplanar B-rep edges into the sketch. */
  convertEntities: () => Promise<void>;

  setSelection: (sel: SelRef[]) => void;
  setConstruction: (on: boolean) => void;
  setPolygonSides: (n: number) => void;
  setFilletRadius: (r: number) => void;
  setOffsetDistance: (d: number) => void;
  setPatternParam: (patch: Partial<{ count: number; spacing: number; angle: number; total: number }>) => void;
  setTransformParam: (patch: Partial<{ dx: number; dy: number; rot: number; scale: number }>) => void;
  /** Move/Copy/Rotate/Scale the selected entities (copy = keep original). */
  moveSelection: (copy: boolean) => void;
  rotateSelection: () => void;
  scaleSelection: () => void;
  /** Offset selected entities by offsetDistance, outward (away from centroid) or inward. */
  offsetSelection: (outward: boolean) => void;
  /** Fix/unfix selected points (and endpoints/centers of selected entities). */
  fixSelection: (fixed: boolean) => void;
  /** Toggle construction (reference) flag on the selected entities. */
  toggleConstructionSelection: () => void;
  /** Mirror selected entities across a selected line (last selected line = axis). */
  mirrorSelection: () => void;
  /** Dynamic Mirror: mirror entities live as they are drawn, across an axis. */
  dynamicMirror: boolean;
  /** The axis line for Dynamic Mirror (a selected line, usually a centerline). */
  mirrorAxisId: string | null;
  /** Turn Dynamic Mirror on (needs a selected line) / off. */
  toggleDynamicMirror: () => void;
  /** Duplicate selected entities in a linear array (uses pattern params). */
  linearPattern: () => void;
  /** Duplicate selected entities around a center (selected point, else origin). */
  circularPattern: () => void;

  applyChange: (fn: (s: ParametricSketch) => void) => void;
  addConstraint: (c: GeomConstraintInput) => void;
  addDistanceDim: (p1: string, p2: string) => void;
  addRadiusDim: (circleId: string) => void;
  addDiameterDim: (circleId: string) => void;
  addAngleDim: (line1: string, line2: string) => void;
  updateDimension: (id: string, patch: { value?: number; formula?: string }) => void;
  deleteDimension: (id: string) => void;
}

let counter = 0;
export const uid = (prefix: string) => `${prefix}-${++counter}`;

const clone = <T>(v: T): T => structuredClone(v);

export const useViewportStore = create<AppState>((set, get) => ({
  viewport: null,
  mode: "model",
  features: [],
  selectedFeatureId: null,
  past: [],
  future: [],

  sketchPlaneId: null,
  sketch: null,
  editingSketchId: null,
  sketchTool: "line",
  selection: [],
  sketchVersion: 0,
  solveOk: true,
  dimErrors: {},
  dof: 0,
  construction: false,
  polygonSides: 6,
  filletRadius: 10,
  offsetDistance: 5,
  patternCount: 4,
  patternSpacing: 25,
  patternAngle: 0,
  patternTotalAngle: 360,
  moveDx: 20,
  moveDy: 0,
  rotateAngleDeg: 90,
  scaleFactor: 2,

  kernelStatus: "idle",
  extrudeSession: null,
  revolveTargetId: null,
  loftOpen: false,
  sweepOpen: false,
  edgeSelect: null,
  shellSession: null,
  draftSession: null,
  featureError: null,
  busy: false,

  chatOpen: false,
  chatBusy: false,
  chatError: null,
  chatMessages: [],

  openChat: () => set({ chatOpen: true, chatError: null }),
  closeChat: () => set({ chatOpen: false }),

  sendChat: async (text) => {
    const t = text.trim();
    if (!t || get().chatBusy) return;
    const vp = get().viewport;
    if (!vp) return;
    const messages: ChatTurn[] = [...get().chatMessages, { role: "user", text: t }];
    set({ chatOpen: true, chatMessages: messages, chatBusy: true, chatError: null });
    try {
      const image = vp.captureImage(1024);
      const reply = await chatRequest(messages, image, get().features);
      let text = reply.text;

      // The assistant chose to draw/modify — apply its design to the model.
      if (reply.design) {
        const d = reply.design;
        const append = d.mode !== "replace" && get().features.some(producesSolid);

        // In append mode the assistant may ask to remove existing features first
        // (e.g. to "change" a feature = delete + redraw). Match by id or name.
        let base = get().features;
        let removed = 0;
        if (append && Array.isArray(d.delete) && d.delete.length) {
          const targets = new Set(d.delete.map((s) => String(s).toLowerCase()));
          const kept = base.filter((f) => !(targets.has(f.id.toLowerCase()) || targets.has(f.name.toLowerCase())));
          removed = base.length - kept.length;
          base = kept;
        }

        const newFeats = designToFeatures(d, { continueSolid: append && base.some(producesSolid), nameStart: append ? base.length : 0 });
        const willApply = append ? newFeats.length > 0 || removed > 0 : newFeats.length > 0;
        if (willApply) {
          pushHistory(get, set);
          const features = append ? [...base, ...newFeats] : newFeats;
          set({ features, selectedFeatureId: null, mode: "model", sketch: null });
          try {
            await rebuild(get, set);
            const parts: string[] = [];
            if (removed > 0) parts.push(`xoá ${removed} feature`);
            if (newFeats.length > 0) parts.push(`${append ? "vẽ tiếp" : "dựng"} ${newFeats.length} bước`);
            text += `\n\n✅ *Đã ${parts.join(", ")} trong phần mềm.*`;
          } catch {
            text += "\n\n⚠️ *Đã cập nhật feature nhưng dựng khối lỗi — thử mô tả lại hoặc chỉnh số đo.*";
          }
        }
      }

      set({ chatMessages: [...messages, { role: "assistant", text }], chatBusy: false });
    } catch (e) {
      set({ chatError: (e as Error).message, chatBusy: false });
    }
  },

  evaluateDrawing: async () => {
    await get().sendChat(
      "Hãy đánh giá bản vẽ này theo các mục: Tổng quan, Điểm tốt, Vấn đề & rủi ro, Khả năng chế tạo (DFM), Gợi ý cải tiến.",
    );
  },

  askClaudeAi: () => {
    const vp = get().viewport;
    if (!vp) return;
    // 1. Download the rendered image so the user can attach it in claude.ai.
    const image = vp.captureImage(1280);
    const a = document.createElement("a");
    a.href = image;
    a.download = "torotic-banve.png";
    a.click();
    // 2. Copy the prompt (instructions + feature JSON) to the clipboard.
    const prompt = buildClaudePrompt(get().features);
    navigator.clipboard?.writeText(prompt).catch(() => {});
    // 3. Open claude.ai in a new tab and tell the user what to do.
    window.open("https://claude.ai/new", "_blank", "noopener");
    set({
      notice:
        "Đã tải ảnh 'torotic-banve.png' và copy nội dung câu hỏi.\n\nSang tab claude.ai vừa mở:\n1) Dán nội dung (Ctrl+V).\n2) Đính kèm ảnh 'torotic-banve.png' (vừa tải về).\n3) Gửi — Claude sẽ đánh giá bằng gói Pro/Max của bạn.",
    });
  },

  aiDrawOpen: false,
  aiDrawBusy: false,
  aiDrawError: null,
  openAiDraw: () => set({ aiDrawOpen: true, aiDrawError: null }),
  closeAiDraw: () => set({ aiDrawOpen: false }),
  generateDesign: async (prompt) => {
    const p = prompt.trim();
    if (!p || get().aiDrawBusy) return;
    set({ aiDrawBusy: true, aiDrawError: null });
    try {
      const design = await requestDesign(p);
      const feats = designToFeatures(design);
      if (feats.length === 0) throw new Error("AI chưa tạo được hình từ mô tả này. Thử mô tả cụ thể hơn (kích thước, hình dạng).");
      pushHistory(get, set);
      set({ features: feats, selectedFeatureId: null, mode: "model", sketch: null, aiDrawBusy: false, aiDrawOpen: false });
      await rebuild(get, set);
    } catch (e) {
      set({ aiDrawError: (e as Error).message, aiDrawBusy: false });
    }
  },

  notice: null,
  dismissNotice: () => set({ notice: null }),

  setViewport: (viewport) => set({ viewport }),
  selectFeature: (selectedFeatureId) => set({ selectedFeatureId }),

  openExtrude: (sketchId) => {
    const feat = get().features.find((f) => f.id === sketchId);
    if (!feat || feat.type !== "sketch") return;
    const count = findRegions(feat.sketch).length;
    const operation: BoolOp = get().features.some(producesSolid) ? "add" : "new";
    set({
      extrudeSession: { sketchId, distance: 25, operation, flip: false, midplane: false, selected: Array.from({ length: count }, (_, i) => i), regionCount: count },
      revolveTargetId: null,
      loftOpen: false,
      sweepOpen: false,
      featureError: null,
    });
    showExtrudeRegions(get);
  },
  openRevolve: (sketchId) => set({ revolveTargetId: sketchId, extrudeSession: null, loftOpen: false, sweepOpen: false, featureError: null }),
  openLoft: () => set({ loftOpen: true, extrudeSession: null, revolveTargetId: null, sweepOpen: false, featureError: null }),
  openSweep: () => set({ sweepOpen: true, extrudeSession: null, revolveTargetId: null, loftOpen: false, featureError: null }),
  cancelFeatureDialog: () => set({ revolveTargetId: null, loftOpen: false, sweepOpen: false, featureError: null }),

  toggleExtrudeRegion: (i) => {
    const s = get().extrudeSession;
    if (!s) return;
    const selected = s.selected.includes(i) ? s.selected.filter((x) => x !== i) : [...s.selected, i];
    set({ extrudeSession: { ...s, selected } });
    showExtrudeRegions(get);
  },
  setExtrudeDistance: (distance) => set((st) => (st.extrudeSession ? { extrudeSession: { ...st.extrudeSession, distance } } : {})),
  setExtrudeOperation: (operation) => set((st) => (st.extrudeSession ? { extrudeSession: { ...st.extrudeSession, operation } } : {})),
  setExtrudeFlip: (flip) => set((st) => (st.extrudeSession ? { extrudeSession: { ...st.extrudeSession, flip } } : {})),
  setExtrudeMidplane: (midplane) => set((st) => (st.extrudeSession ? { extrudeSession: { ...st.extrudeSession, midplane } } : {})),
  cancelExtrude: () => {
    set({ extrudeSession: null });
    get().viewport?.clearExtrudeRegions();
  },
  applyExtrude: async () => {
    const s = get().extrudeSession;
    if (!s) return;
    if (s.selected.length === 0) {
      set({ featureError: "Chọn ít nhất một vùng để đùn." });
      return;
    }
    get().viewport?.clearExtrudeRegions();
    const regions = s.selected.length === s.regionCount ? undefined : [...s.selected];
    set({ extrudeSession: null });
    await addSolidFeature(get, set, {
      id: uid("extrude"),
      type: "extrude",
      name: `Extrude${get().features.filter((f) => f.type === "extrude").length + 1}`,
      sketchId: s.sketchId,
      distance: s.distance,
      operation: s.operation,
      flip: s.flip,
      midplane: s.midplane,
      regions,
    });
  },

  runRevolve: async (angle, axis, operation) => {
    const sketchId = get().revolveTargetId;
    if (!sketchId) return;
    await addSolidFeature(get, set, {
      id: uid("revolve"),
      type: "revolve",
      name: `Revolve${get().features.filter((f) => f.type === "revolve").length + 1}`,
      sketchId,
      angle,
      axis,
      operation,
    });
  },

  runLoft: async (sketchIds, operation) => {
    if (sketchIds.length < 2) return;
    await addSolidFeature(get, set, {
      id: uid("loft"),
      type: "loft",
      name: `Loft${get().features.filter((f) => f.type === "loft").length + 1}`,
      sketchIds,
      operation,
    });
  },

  runSweep: async (profileSketchId, pathSketchId, operation) => {
    if (!profileSketchId || !pathSketchId || profileSketchId === pathSketchId) return;
    await addSolidFeature(get, set, {
      id: uid("sweep"),
      type: "sweep",
      name: `Sweep${get().features.filter((f) => f.type === "sweep").length + 1}`,
      profileSketchId,
      pathSketchId,
      operation,
    });
  },

  startEdgeSelect: (kind) => {
    set({ edgeSelect: { kind, radius: 3, points: [] }, selectedFeatureId: null });
    get().viewport?.setSelectedEdges([]);
  },
  addEdgePoint: (p) => {
    const sel = get().edgeSelect;
    if (!sel) return;
    const points = [...sel.points, p];
    set({ edgeSelect: { ...sel, points } });
    get().viewport?.setSelectedEdges(points);
  },
  setEdgeSelectRadius: (r) =>
    set((s) => (s.edgeSelect ? { edgeSelect: { ...s.edgeSelect, radius: Math.max(0.1, r) } } : {})),
  cancelEdgeSelect: () => {
    set({ edgeSelect: null });
    get().viewport?.setSelectedEdges([]);
  },
  applyEdgeSelect: () => {
    const sel = get().edgeSelect;
    if (!sel) return;
    pushHistory(get, set);
    const n = get().features.filter((f) => f.type === sel.kind).length + 1;
    const name = (sel.kind === "fillet" ? "Fillet" : "Chamfer") + n;
    // No edges picked ⇒ apply to all edges.
    const edges = sel.points.length ? sel.points : undefined;
    const f: Feature = { id: uid(sel.kind), type: sel.kind, name, radius: sel.radius, edges };
    set((s) => ({ features: [...s.features, f], selectedFeatureId: f.id, edgeSelect: null }));
    get().viewport?.setSelectedEdges([]);
    void rebuild(get, set);
  },

  startShell: () => {
    if (!get().features.some(producesSolid)) {
      set({ featureError: "Cần có khối trước khi Shell." });
      return;
    }
    set({ shellSession: { thickness: 3, points: [] }, selectedFeatureId: null });
    get().viewport?.setSelectedEdges([]);
  },
  addShellFace: (p) => {
    const s = get().shellSession;
    if (!s) return;
    const points = [...s.points, p];
    set({ shellSession: { ...s, points } });
    get().viewport?.setSelectedEdges(points); // reuse marker to show picked faces
  },
  setShellThickness: (t) => set((s) => (s.shellSession ? { shellSession: { ...s.shellSession, thickness: Math.max(0.1, t) } } : {})),
  cancelShell: () => {
    set({ shellSession: null });
    get().viewport?.setSelectedEdges([]);
  },
  applyShell: () => {
    const s = get().shellSession;
    if (!s) return;
    if (s.points.length === 0) {
      set({ featureError: "Shell: chọn ít nhất 1 mặt để khoét hở." });
      return;
    }
    pushHistory(get, set);
    const n = get().features.filter((f) => f.type === "shell").length + 1;
    const f: Feature = { id: uid("shell"), type: "shell", name: `Shell${n}`, thickness: s.thickness, faces: [...s.points] };
    set((st) => ({ features: [...st.features, f], selectedFeatureId: f.id, shellSession: null }));
    get().viewport?.setSelectedEdges([]);
    void rebuild(get, set);
  },

  startDraft: () => {
    if (!get().features.some(producesSolid)) {
      set({ featureError: "Cần có khối trước khi Draft." });
      return;
    }
    set({ draftSession: { angle: 5, neutralPlane: "XY", points: [] }, selectedFeatureId: null });
    get().viewport?.setSelectedEdges([]);
  },
  addDraftFace: (p) => {
    const s = get().draftSession;
    if (!s) return;
    const points = [...s.points, p];
    set({ draftSession: { ...s, points } });
    get().viewport?.setSelectedEdges(points);
  },
  setDraftAngle: (a) => set((s) => (s.draftSession ? { draftSession: { ...s.draftSession, angle: a } } : {})),
  setDraftNeutral: (p) => set((s) => (s.draftSession ? { draftSession: { ...s.draftSession, neutralPlane: p } } : {})),
  cancelDraft: () => {
    set({ draftSession: null });
    get().viewport?.setSelectedEdges([]);
  },
  applyDraft: () => {
    const s = get().draftSession;
    if (!s) return;
    if (s.points.length === 0) {
      set({ featureError: "Draft: chọn ít nhất 1 mặt để vát." });
      return;
    }
    pushHistory(get, set);
    const n = get().features.filter((f) => f.type === "draft").length + 1;
    const f: Feature = { id: uid("draft"), type: "draft", name: `Draft${n}`, angle: s.angle, neutralPlane: s.neutralPlane, faces: [...s.points] };
    set((st) => ({ features: [...st.features, f], selectedFeatureId: f.id, draftSession: null }));
    get().viewport?.setSelectedEdges([]);
    void rebuild(get, set);
  },

  updateFeature: (id, patch) => {
    pushHistory(get, set);
    set((s) => ({
      features: s.features.map((f) => (f.id === id ? ({ ...f, ...patch } as Feature) : f)),
    }));
    void rebuild(get, set);
  },

  deleteFeature: (id) => {
    pushHistory(get, set);
    set((s) => {
      // Remove the feature, plus any feature that consumed it as a sketch.
      const features = s.features.filter((f) => f.id !== id && !consumedSketchIds(f).includes(id));
      return { features, selectedFeatureId: null };
    });
    void rebuild(get, set);
  },

  addModifier: (kind) => {
    if (!get().features.some(producesSolid)) {
      set({ featureError: "Cần có khối trước khi bo/vát cạnh." });
      return;
    }
    pushHistory(get, set);
    const n = get().features.filter((f) => f.type === kind).length + 1;
    const name = (kind === "fillet" ? "Fillet" : "Chamfer") + n;
    const f: Feature = { id: uid(kind), type: kind, name, radius: 3 };
    set((s) => ({ features: [...s.features, f], selectedFeatureId: f.id }));
    void rebuild(get, set);
  },

  addBodyOp: (kind) => {
    if (!get().features.some(producesSolid)) {
      set({ featureError: "Cần có khối trước khi Mirror/Pattern." });
      return;
    }
    pushHistory(get, set);
    const n = get().features.filter((f) => f.type === kind).length + 1;
    let f: Feature;
    if (kind === "mirrorBody") f = { id: uid(kind), type: "mirrorBody", name: `MirrorBody${n}`, plane: "YZ" };
    else if (kind === "patternLinear")
      f = { id: uid(kind), type: "patternLinear", name: `LinearPattern${n}`, count: 3, dx: 30, dy: 0, dz: 0 };
    else f = { id: uid(kind), type: "patternCircular", name: `CircularPattern${n}`, count: 4, angle: 360, axis: "z" };
    set((s) => ({ features: [...s.features, f], selectedFeatureId: f.id }));
    void rebuild(get, set);
  },

  addThread: () => {
    pushHistory(get, set);
    const n = get().features.filter((f) => f.type === "thread").length + 1;
    const f: Feature = {
      id: uid("thread"), type: "thread", name: `Thread${n}`,
      diameter: 10, pitch: 1.5, length: 20, x: 0, y: 0, z: 0, axis: "z", operation: "new",
    };
    set((s) => ({ features: [...s.features, f], selectedFeatureId: f.id }));
    void rebuild(get, set);
  },

  addRefPlane: () => {
    pushHistory(get, set);
    const n = get().features.filter((f) => f.type === "refPlane").length + 1;
    const f: Feature = { id: uid("refPlane"), type: "refPlane", name: `Plane${n}`, base: "top", offset: 50 };
    set((s) => ({ features: [...s.features, f], selectedFeatureId: f.id }));
    updateOverlays(get);
  },

  addFeaturePattern: (kind, targetId) => {
    const target = get().features.find((f) => f.id === targetId);
    if (!target || (target.type !== "extrude" && target.type !== "revolve")) {
      set({ featureError: "Pattern feature: chọn một feature Extrude/Revolve làm gốc." });
      return;
    }
    pushHistory(get, set);
    const n = get().features.filter((f) => f.type === kind).length + 1;
    const f: Feature =
      kind === "featPatternLinear"
        ? { id: uid(kind), type: "featPatternLinear", name: `Pattern thẳng${n}`, targetId, count: 3, dx: 30, dy: 0, dz: 0 }
        : { id: uid(kind), type: "featPatternCircular", name: `Pattern tròn${n}`, targetId, count: 4, angle: 360, axis: "z" };
    set((s) => ({ features: [...s.features, f], selectedFeatureId: f.id }));
    void rebuild(get, set);
  },

  addFeatureMirror: (targetId) => {
    const target = get().features.find((f) => f.id === targetId);
    if (!target || (target.type !== "extrude" && target.type !== "revolve")) {
      set({ featureError: "Mirror feature: chọn một feature Extrude/Revolve làm gốc." });
      return;
    }
    pushHistory(get, set);
    const n = get().features.filter((f) => f.type === "featMirror").length + 1;
    const f: Feature = { id: uid("featMirror"), type: "featMirror", name: `MirrorFeat${n}`, targetId, plane: "YZ" };
    set((s) => ({ features: [...s.features, f], selectedFeatureId: f.id }));
    void rebuild(get, set);
  },

  undo: () => {
    const { past, features, future } = get();
    if (past.length === 0) return;
    set({
      past: past.slice(0, -1),
      future: [clone(features), ...future].slice(0, 60),
      features: past[past.length - 1],
      selectedFeatureId: null,
    });
    void rebuild(get, set);
  },

  redo: () => {
    const { future, features, past } = get();
    if (future.length === 0) return;
    set({
      future: future.slice(1),
      past: [...past, clone(features)].slice(-60),
      features: future[0],
      selectedFeatureId: null,
    });
    void rebuild(get, set);
  },

  saveProject: () => {
    const data = JSON.stringify({ version: 1, features: get().features }, null, 2);
    downloadBlob(new Blob([data], { type: "application/json" }), "torotic-project.json");
  },

  loadProject: (json) => {
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed.features)) throw new Error("File không hợp lệ");
      pushHistory(get, set);
      set({ features: parsed.features as Feature[], selectedFeatureId: null, mode: "model", sketch: null });
      void rebuild(get, set);
    } catch (e) {
      set({ featureError: "Không mở được file: " + (e as Error).message });
    }
  },

  editSketch: (id) => {
    const feat = get().features.find((f) => f.id === id);
    if (!feat || feat.type !== "sketch") return;
    const working = clone(feat.sketch);
    solveSketch(working);
    set({
      mode: "sketch",
      editingSketchId: id,
      sketchPlaneId: working.planeId,
      sketch: working,
      sketchTool: "select",
      selection: [],
      sketchVersion: get().sketchVersion + 1,
    });
    updateOverlays(get);
  },

  exportModel: async (format) => {
    if (!get().features.some(producesSolid)) {
      set({ featureError: "Chưa có khối nào để xuất." });
      return;
    }
    if (!(await ensureKernel(set))) return;
    try {
      const blob = exportSolid(get().features, format);
      if (!blob) return;
      downloadBlob(blob, `torotic-model.${format}`);
    } catch (e) {
      set({ featureError: "Lỗi xuất file: " + (e as Error).message });
    }
  },

  enterSketch: () => {
    set({
      mode: "sketch",
      sketchPlaneId: null,
      sketch: null,
      editingSketchId: null,
      sketchTool: "line",
      selection: [],
      construction: false,
      dof: 0,
    });
    updateOverlays(get);
  },

  startSketchOnPlane: (planeId, offset = 0) =>
    set({
      sketchPlaneId: planeId,
      sketch: emptySketch(planeId, offset),
      sketchVersion: get().sketchVersion + 1,
      dof: 0,
    }),

  startSketchOnFace: (o, n) => {
    const ln = Math.hypot(n[0], n[1], n[2]) || 1;
    const nn: [number, number, number] = [n[0] / ln, n[1] / ln, n[2] / ln];
    // x direction: world X projected onto the plane (use Y if normal ≈ X).
    const ref: [number, number, number] = Math.abs(nn[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const d = ref[0] * nn[0] + ref[1] * nn[1] + ref[2] * nn[2];
    let x: [number, number, number] = [ref[0] - nn[0] * d, ref[1] - nn[1] * d, ref[2] - nn[2] * d];
    const xl = Math.hypot(x[0], x[1], x[2]) || 1;
    x = [x[0] / xl, x[1] / xl, x[2] / xl];
    const sketch = emptySketch("front");
    sketch.customPlane = { o, n: nn, x };
    set({ sketchPlaneId: "front", sketch, sketchVersion: get().sketchVersion + 1, dof: 0 });
  },

  setSketchTool: (sketchTool) => set({ sketchTool, selection: [] }),

  finishSketch: () => {
    const { sketch, editingSketchId } = get();
    if (editingSketchId && sketch) {
      // Write the working copy back into the existing feature, then rebuild.
      pushHistory(get, set);
      set((s) => ({
        features: s.features.map((f) => (f.id === editingSketchId ? { ...f, sketch } : f)),
      }));
      set({ mode: "model", sketchPlaneId: null, sketch: null, editingSketchId: null, selection: [], dynamicMirror: false, mirrorAxisId: null });
      void rebuild(get, set);
      return;
    }
    const hasGeometry = sketch && (sketch.lines.length > 0 || sketch.circles.length > 0 || sketch.arcs.length > 0);
    if (sketch && hasGeometry) {
      pushHistory(get, set);
      const n = get().features.filter((f) => f.type === "sketch").length + 1;
      const feature: Feature = { id: uid("sketch"), type: "sketch", name: `Sketch${n}`, sketch };
      set((s) => ({ features: [...s.features, feature], selectedFeatureId: feature.id }));
    }
    set({ mode: "model", sketchPlaneId: null, sketch: null, selection: [], dynamicMirror: false, mirrorAxisId: null });
    updateOverlays(get);
  },

  cancelSketch: () => {
    set({ mode: "model", sketchPlaneId: null, sketch: null, editingSketchId: null, selection: [], dynamicMirror: false, mirrorAxisId: null });
    updateOverlays(get);
  },

  convertEntities: async () => {
    const sk = get().sketch;
    if (!sk) return;
    if (!get().features.some(producesSolid)) {
      set({ featureError: "Convert: chưa có khối nào để chiếu cạnh." });
      return;
    }
    if (!(await ensureKernel(set))) return;
    let edges3d: number[][][];
    try {
      edges3d = solidEdges(get().features) as unknown as number[][][];
    } catch (e) {
      set({ featureError: "Convert lỗi: " + (e as Error).message });
      return;
    }
    const plane = planeForSketch(sk);
    const o = plane.origin, u = plane.u, v = plane.v, n = plane.normal;
    const TOL = 0.1; // coplanarity tolerance (mm)
    const project = (P: number[]) => {
      const dx = P[0] - o.x, dy = P[1] - o.y, dz = P[2] - o.z;
      return {
        x: dx * u.x + dy * u.y + dz * u.z,
        y: dx * v.x + dy * v.y + dz * v.z,
        n: dx * n.x + dy * n.y + dz * n.z, // signed distance to the plane
      };
    };
    let added = 0;
    get().applyChange((s) => {
      const goc = (x: number, y: number) => {
        const hit = s.points.find((p) => Math.hypot(p.x - x, p.y - y) <= 1e-3);
        if (hit) return hit.id;
        const id = uid("pt");
        s.points.push({ id, x, y });
        return id;
      };
      for (const poly of edges3d) {
        if (poly.length < 2) continue;
        const pts = poly.map(project);
        if (!pts.every((p) => Math.abs(p.n) <= TOL)) continue; // not on the sketch plane
        const a = pts[0], b = pts[pts.length - 1];
        const abx = b.x - a.x, aby = b.y - a.y, abl = Math.hypot(abx, aby);
        // Straight edge → single line; otherwise keep the tessellated polyline.
        const straight =
          abl > 1e-6 && pts.every((p) => Math.abs((p.x - a.x) * aby - (p.y - a.y) * abx) / abl <= 0.05);
        if (straight) {
          s.lines.push({ id: uid("ln"), p1: goc(a.x, a.y), p2: goc(b.x, b.y), construction: false });
          added++;
        } else {
          for (let i = 0; i < pts.length - 1; i++) {
            s.lines.push({ id: uid("ln"), p1: goc(pts[i].x, pts[i].y), p2: goc(pts[i + 1].x, pts[i + 1].y) });
          }
          added++;
        }
      }
    });
    if (added === 0) set({ featureError: "Convert: không tìm thấy cạnh nào nằm trên mặt phẳng sketch hiện tại." });
  },

  setSelection: (selection) => set({ selection }),
  setConstruction: (construction) => set({ construction }),
  setPolygonSides: (polygonSides) => set({ polygonSides: Math.max(3, Math.round(polygonSides)) }),
  setFilletRadius: (filletRadius) => set({ filletRadius: Math.max(0.1, filletRadius) }),
  setOffsetDistance: (offsetDistance) => set({ offsetDistance: Math.max(0.1, offsetDistance) }),
  setPatternParam: (patch) =>
    set((s) => ({
      patternCount: patch.count !== undefined ? Math.max(2, Math.round(patch.count)) : s.patternCount,
      patternSpacing: patch.spacing !== undefined ? patch.spacing : s.patternSpacing,
      patternAngle: patch.angle !== undefined ? patch.angle : s.patternAngle,
      patternTotalAngle: patch.total !== undefined ? patch.total : s.patternTotalAngle,
    })),

  offsetSelection: (outward) => {
    const refs = get().selection.filter((r) => r.kind !== "point");
    if (refs.length === 0) {
      set({ featureError: "Offset: chọn các cạnh (đường/cung/tròn) cần offset trước." });
      return;
    }
    const d = get().offsetDistance;
    get().applyChange((s) => offsetEntities(s, refs, d, outward));
    get().setSelection([]);
  },

  fixSelection: (fixed) => {
    const sel = get().selection;
    if (sel.length === 0) return;
    get().applyChange((s) => {
      const ids = new Set<string>();
      for (const r of sel) {
        if (r.kind === "point") ids.add(r.id);
        else if (r.kind === "line") {
          const l = s.lines.find((x) => x.id === r.id);
          if (l) [l.p1, l.p2].forEach((i) => ids.add(i));
        } else if (r.kind === "circle") {
          const c = s.circles.find((x) => x.id === r.id);
          if (c) ids.add(c.center);
        } else if (r.kind === "arc") {
          const a = s.arcs.find((x) => x.id === r.id);
          if (a) [a.center, a.start, a.end].forEach((i) => ids.add(i));
        }
      }
      for (const p of s.points) if (ids.has(p.id)) p.fixed = fixed ? true : undefined;
    });
    get().setSelection([]);
  },

  setTransformParam: (patch) =>
    set((s) => ({
      moveDx: patch.dx !== undefined ? patch.dx : s.moveDx,
      moveDy: patch.dy !== undefined ? patch.dy : s.moveDy,
      rotateAngleDeg: patch.rot !== undefined ? patch.rot : s.rotateAngleDeg,
      scaleFactor: patch.scale !== undefined ? patch.scale : s.scaleFactor,
    })),

  moveSelection: (copy) => {
    const refs = get().selection.filter((r) => r.kind !== "point");
    if (refs.length === 0) {
      set({ featureError: "Move: chọn đối tượng trước." });
      return;
    }
    const { moveDx: dx, moveDy: dy } = get();
    get().applyChange((s) =>
      copy ? cloneEntities(s, refs, (p) => ({ x: p.x + dx, y: p.y + dy }), false) : transformPoints(s, refs, (p) => ({ x: p.x + dx, y: p.y + dy })),
    );
    get().setSelection([]);
  },

  rotateSelection: () => {
    const refs = get().selection.filter((r) => r.kind !== "point");
    if (refs.length === 0) {
      set({ featureError: "Rotate: chọn đối tượng trước." });
      return;
    }
    const ang = (get().rotateAngleDeg * Math.PI) / 180;
    get().applyChange((s) => {
      const c = selectionCentroid(s, refs);
      transformPoints(s, refs, (p) => rotateAbout(p, c, ang));
    });
    get().setSelection([]);
  },

  scaleSelection: () => {
    const refs = get().selection.filter((r) => r.kind !== "point");
    if (refs.length === 0) {
      set({ featureError: "Scale: chọn đối tượng trước." });
      return;
    }
    const f = get().scaleFactor;
    if (!(f > 0)) return;
    get().applyChange((s) => {
      const c = selectionCentroid(s, refs);
      transformPoints(s, refs, (p) => ({ x: c.x + (p.x - c.x) * f, y: c.y + (p.y - c.y) * f }));
      scaleSelectionRadii(s, refs, f);
    });
    get().setSelection([]);
  },

  toggleConstructionSelection: () => {
    const sel = get().selection;
    if (sel.length === 0) return;
    get().applyChange((s) => {
      for (const r of sel) {
        if (r.kind === "line") {
          const l = s.lines.find((x) => x.id === r.id);
          if (l) l.construction = !l.construction;
        } else if (r.kind === "circle") {
          const c = s.circles.find((x) => x.id === r.id);
          if (c) c.construction = !c.construction;
        } else if (r.kind === "arc") {
          const a = s.arcs.find((x) => x.id === r.id);
          if (a) a.construction = !a.construction;
        }
      }
    });
    get().setSelection([]);
  },

  mirrorSelection: () => {
    const sel = get().selection;
    const axisRef = [...sel].reverse().find((r) => r.kind === "line");
    if (!axisRef) {
      set({ featureError: "Mirror: chọn 1 đường làm trục (nên dùng Đường tâm) và các đối tượng cần soi gương." });
      return;
    }
    const entities = sel.filter((r) => !(r.kind === "line" && r.id === axisRef.id) && r.kind !== "point");
    if (entities.length === 0) {
      set({ featureError: "Mirror: chọn thêm đối tượng (ngoài đường trục) để soi gương." });
      return;
    }
    get().applyChange((s) => {
      const line = s.lines.find((l) => l.id === axisRef.id);
      if (!line) return;
      const a = s.points.find((p) => p.id === line.p1)!;
      const b = s.points.find((p) => p.id === line.p2)!;
      const res = cloneEntities(s, entities, (p) => reflectAcross(p, a, b), true);
      // SolidWorks logic: link original ↔ mirror with symmetric relations so the
      // copy stays parametric (edit the original → the mirror follows).
      for (const [src, dst] of res.points) {
        if (src === dst) continue; // point lies on the axis — nothing to link
        s.constraints.push({ id: relId("sym"), type: "symmetric", p1: src, p2: dst, line: axisRef.id });
      }
      // Mirrored circles keep equal radius to their source.
      for (const { src, id } of res.circles) {
        s.constraints.push({ id: relId("eqr"), type: "equalRadius", c1: src, c2: id });
      }
    });
    get().setSelection([]);
  },

  dynamicMirror: false,
  mirrorAxisId: null,
  toggleDynamicMirror: () => {
    if (get().dynamicMirror) {
      set({ dynamicMirror: false, mirrorAxisId: null });
      return;
    }
    const lineRef = [...get().selection].reverse().find((r) => r.kind === "line");
    if (!lineRef) {
      set({ featureError: "Dynamic Mirror: chọn 1 đường (nên là Đường tâm) làm trục rồi bật." });
      return;
    }
    set({ dynamicMirror: true, mirrorAxisId: lineRef.id, selection: [] });
  },

  linearPattern: () => {
    const refs = get().selection.filter((r) => r.kind !== "point");
    if (refs.length === 0) {
      set({ featureError: "Pattern: chọn đối tượng cần sao chép trước." });
      return;
    }
    const { patternCount: n, patternSpacing: sp, patternAngle: ang } = get();
    const dx = Math.cos((ang * Math.PI) / 180) * sp;
    const dy = Math.sin((ang * Math.PI) / 180) * sp;
    get().applyChange((s) => {
      for (let k = 1; k < n; k++) cloneEntities(s, refs, (p) => ({ x: p.x + dx * k, y: p.y + dy * k }), false);
    });
    get().setSelection([]);
  },

  circularPattern: () => {
    const sel = get().selection;
    const refs = sel.filter((r) => r.kind !== "point");
    if (refs.length === 0) {
      set({ featureError: "Pattern tròn: chọn đối tượng cần sao chép (và 1 điểm làm tâm, nếu không sẽ lấy gốc toạ độ)." });
      return;
    }
    const { patternCount: n, patternTotalAngle: total } = get();
    get().applyChange((s) => {
      const centerRef = sel.find((r) => r.kind === "point");
      const cp = centerRef ? s.points.find((p) => p.id === centerRef.id) : null;
      const center = cp ? { x: cp.x, y: cp.y } : { x: 0, y: 0 };
      const step = ((total * Math.PI) / 180) / n;
      for (let k = 1; k < n; k++) cloneEntities(s, refs, (p) => rotateAbout(p, center, step * k), false);
    });
    get().setSelection([]);
  },

  applyChange: (fn) => {
    const { sketch } = get();
    if (!sketch) return;
    fn(sketch);
    const res = solveSketch(sketch);
    set({
      sketchVersion: get().sketchVersion + 1,
      solveOk: res.ok,
      dimErrors: res.dimErrors,
      dof: res.dof,
    });
  },

  addConstraint: (c) =>
    get().applyChange((s) => s.constraints.push({ ...c, id: uid("con") } as GeomConstraint)),

  addDistanceDim: (p1, p2) =>
    get().applyChange((s) => {
      const a = s.points.find((q) => q.id === p1)!;
      const b = s.points.find((q) => q.id === p2)!;
      const value = Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 100) / 100;
      const name = `d${s.dimensions.length + 1}`;
      s.dimensions.push({ id: uid("dim"), name, kind: "distance", refs: [p1, p2], value });
    }),

  addRadiusDim: (circleId) =>
    get().applyChange((s) => {
      const c = s.circles.find((q) => q.id === circleId)!;
      const name = `d${s.dimensions.length + 1}`;
      s.dimensions.push({
        id: uid("dim"),
        name,
        kind: "radius",
        refs: [circleId],
        value: Math.round(c.r * 100) / 100,
      });
    }),

  addDiameterDim: (circleId) =>
    get().applyChange((s) => {
      const c = s.circles.find((q) => q.id === circleId)!;
      const name = `d${s.dimensions.length + 1}`;
      s.dimensions.push({
        id: uid("dim"),
        name,
        kind: "diameter",
        refs: [circleId],
        value: Math.round(c.r * 2 * 100) / 100,
      });
    }),

  addAngleDim: (line1, line2) =>
    get().applyChange((s) => {
      const l1 = s.lines.find((q) => q.id === line1);
      const l2 = s.lines.find((q) => q.id === line2);
      if (!l1 || !l2) return;
      const pt = (id: string) => s.points.find((q) => q.id === id)!;
      const a1 = pt(l1.p1), a2 = pt(l1.p2), b1 = pt(l2.p1), b2 = pt(l2.p2);
      const cross = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
      const dot = (a2.x - a1.x) * (b2.x - b1.x) + (a2.y - a1.y) * (b2.y - b1.y);
      let deg = Math.round(((Math.atan2(cross, dot) * 180) / Math.PI) * 100) / 100;
      // Show a positive angle (0–180°) like SolidWorks: if the signed angle is
      // negative, measure from the other line instead (same geometry, +value).
      const refs = deg < 0 ? [line2, line1] : [line1, line2];
      deg = Math.abs(deg);
      const name = `d${s.dimensions.length + 1}`;
      s.dimensions.push({ id: uid("dim"), name, kind: "angle", refs, value: deg });
    }),

  updateDimension: (id, patch) =>
    get().applyChange((s) => {
      const d = s.dimensions.find((q) => q.id === id);
      if (!d) return;
      if (patch.value !== undefined) d.value = patch.value;
      if (patch.formula !== undefined) d.formula = patch.formula;
    }),

  deleteDimension: (id) =>
    get().applyChange((s) => {
      s.dimensions = s.dimensions.filter((d) => d.id !== id);
    }),
}));

type Get = () => AppState;
type Set = (partial: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;

/** Ensure the WASM kernel is loaded; returns true on success. */
async function ensureKernel(set: Set): Promise<boolean> {
  if (useViewportStore.getState().kernelStatus === "ready") return true;
  set({ kernelStatus: "loading", featureError: null });
  try {
    await initKernel();
    set({ kernelStatus: "ready" });
    return true;
  } catch (e) {
    set({ kernelStatus: "error", featureError: "Không tải được kernel: " + (e as Error).message });
    return false;
  }
}

/** Render the active extrude session's clickable region fills in the viewport. */
function showExtrudeRegions(get: Get): void {
  const s = get().extrudeSession;
  const vp = get().viewport;
  if (!s || !vp) return;
  const feat = get().features.find((f) => f.id === s.sketchId);
  if (!feat || feat.type !== "sketch") return;
  const regions = findRegions(feat.sketch).map((r, i) => ({ poly: r.polygon, index: i }));
  const plane = planeForSketch(feat.sketch);
  vp.setExtrudeRegions(regions, plane, s.selected);
}

/** Refresh the faint committed-sketch overlays (only visible in model mode). */
function updateOverlays(get: Get): void {
  const { viewport, features, mode } = get();
  if (!viewport) return;
  if (mode === "sketch") {
    viewport.setSketchOverlays([]);
    return;
  }
  const objs = features.filter(isSketch).map((f) => buildSketchGroup(f.sketch));
  for (const f of features) if (f.type === "refPlane") objs.push(buildDatumPlane(resolvePlane(f.base, f.offset)));
  viewport.setSketchOverlays(objs);
}

/** Snapshot current features into the undo stack (clearing redo). */
function pushHistory(get: Get, set: Set): void {
  set({ past: [...get().past, clone(get().features)].slice(-60), future: [] });
}

/** Rebuild the whole feature tree and push the resulting solid to the viewport. */
async function rebuild(get: Get, set: Set): Promise<void> {
  const { viewport, features } = get();
  if (!viewport) return;
  updateOverlays(get);
  if (!features.some(producesSolid)) {
    viewport.setSolid(null);
    return;
  }
  if (!(await ensureKernel(set))) return;
  try {
    const bodies = rebuildSolids(get().features);
    viewport.setSolids(bodies);
    viewport.frameModel();
  } catch (e) {
    set({ featureError: "Lỗi dựng khối: " + (e as Error).message });
  }
}

/** Append a solid feature, coercing the first one to "new", then rebuild. */
async function addSolidFeature(
  get: Get,
  set: Set,
  feature: Extract<Feature, { type: "extrude" | "revolve" | "loft" | "sweep" }>
): Promise<void> {
  pushHistory(get, set);
  const firstSolid = !get().features.some(producesSolid);
  const f = firstSolid ? { ...feature, operation: "new" as BoolOp } : feature;
  set((s) => ({
    features: [...s.features, f],
    selectedFeatureId: f.id,
    extrudeSession: null,
    revolveTargetId: null,
    loftOpen: false,
    sweepOpen: false,
    featureError: null,
    busy: true,
  }));
  try {
    await rebuild(get, set);
  } catch (e) {
    set({ featureError: e instanceof ExtrudeError ? e.message : "Lỗi: " + (e as Error).message });
  } finally {
    set({ busy: false });
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
