import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MeshData } from "../kernel/kernel";
import type { SketchPlane, Point2 } from "../sketch/SketchPlane";

/** A bright polyline drawn on top of geometry to highlight a whole edge. */
function edgeHighlight(pts: THREE.Vector3[], color: number): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, depthTest: false }));
  line.renderOrder = 5;
  return line;
}

/** SolidWorks-style vertical gradient (light top → cool gray-blue bottom). */
function makeGradientBackground(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 2;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#fbfcfe");
  g.addColorStop(1, "#aeb9c6");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Viewport owns the three.js scene, camera, renderer and controls.
 * It is intentionally framework-agnostic so it can be driven from React
 * (or anything else) and later host sketch/solid geometry from the kernel.
 */
export class Viewport {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  /** Group that holds modeled geometry (solids/sketches), cleared on rebuild. */
  readonly modelGroup = new THREE.Group();
  /** Faint committed-sketch overlays shown in model mode. */
  readonly overlayGroup = new THREE.Group();
  /** Markers for picked edges during edge-select. */
  readonly markerGroup = new THREE.Group();
  /** Hover marker shown while edge-selecting. */
  readonly hoverGroup = new THREE.Group();
  /** Filled, clickable sketch regions shown while choosing extrude contours. */
  readonly regionGroup = new THREE.Group();
  private regionMeshes: THREE.Mesh[] = [];
  /** Solid meshes + per-edge polylines (for picking, highlight, finder ref). */
  private pickableEdges: THREE.LineSegments[] = [];
  private bodyMeshes: THREE.Mesh[] = [];
  private edgeCurves: { pts: THREE.Vector3[]; rep: [number, number, number] }[] = [];
  private readonly edgeRaycaster = new THREE.Raycaster();

  private readonly container: HTMLElement;
  private readonly resizeObserver: ResizeObserver;
  private animationHandle = 0;

  constructor(container: HTMLElement) {
    this.container = container;

    this.scene.background = makeGradientBackground();
    this.scene.add(this.modelGroup);
    this.scene.add(this.overlayGroup);
    this.scene.add(this.markerGroup);
    this.scene.add(this.hoverGroup);
    this.scene.add(this.regionGroup);

    const { clientWidth: w, clientHeight: h } = container;
    this.camera = new THREE.PerspectiveCamera(45, w / h || 1, 0.1, 10000);
    this.camera.position.set(120, 90, 120);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    this.setupLighting();
    this.setupHelpers();

    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(container);

    this.animate();
  }

  private setupLighting() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(150, 200, 100);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-150, -50, -100);
    this.scene.add(fill);
  }

  private setupHelpers() {
    // Ground grid (XZ plane) + colored origin axes for orientation.
    const grid = new THREE.GridHelper(400, 40, 0xaab2bb, 0xccd2d8);
    this.scene.add(grid);

    const axes = new THREE.AxesHelper(60);
    this.scene.add(axes);
  }

  private onResize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private animate = () => {
    this.animationHandle = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Capture the current viewport as a PNG data URL, downscaled so the longest
   * edge is at most `maxDim` px (keeps the image small for the AI vision call).
   * Renders a fresh frame first; `preserveDrawingBuffer` makes the pixels readable.
   */
  captureImage(maxDim = 1024): string {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const scale = Math.min(1, maxDim / Math.max(src.width, src.height));
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; // flatten any transparency onto white
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0, w, h);
    return out.toDataURL("image/png");
  }

  /** Replace all modeled geometry with the given objects. */
  setModel(objects: THREE.Object3D[]) {
    this.modelGroup.clear();
    for (const obj of objects) this.modelGroup.add(obj);
  }

  /** Replace the model with a single rebuilt solid (or clear it when null). */
  setSolid(data: MeshData | null) {
    this.resetPickables();
    if (data) this.addSolid(data);
  }

  /** Replace the model with multiple rebuilt bodies (multi-body). */
  setSolids(bodies: MeshData[]) {
    this.resetPickables();
    for (const b of bodies) this.addSolid(b);
  }

  private resetPickables() {
    this.modelGroup.clear();
    this.markerGroup.clear();
    this.hoverGroup.clear();
    this.pickableEdges = [];
    this.bodyMeshes = [];
    this.edgeCurves = [];
  }

  /**
   * Resolve the nearest solid edge under the pointer to a point on that edge.
   * Strategy: raycast the solid faces to get the surface point, then snap to the
   * closest edge segment (within tolerance). Falls back to direct edge raycast
   * for silhouette edges (no face behind them).
   */
  pickEdgePoint(clientX: number, clientY: number): [number, number, number] | null {
    return this.pickEdge(clientX, clientY)?.rep ?? null;
  }

  /** Resolve the nearest solid edge under the pointer (whole curve + ref point). */
  private pickEdge(clientX: number, clientY: number): { pts: THREE.Vector3[]; rep: [number, number, number] } | null {
    const ndc = this.toNdc(clientX, clientY);
    this.edgeRaycaster.setFromCamera(ndc, this.camera);
    const tol = this.cameraPickThreshold() * 5;

    const faceHits = this.edgeRaycaster.intersectObjects(this.bodyMeshes, false);
    if (faceHits.length > 0) {
      const near = this.nearestEdgeCurve(faceHits[0].point);
      if (near && near.dist <= tol) return near.curve;
    }
    // Silhouette fallback: direct edge raycast, then snap to nearest edge curve.
    this.edgeRaycaster.params.Line = { threshold: tol };
    const edgeHits = this.edgeRaycaster.intersectObjects(this.pickableEdges, false);
    if (edgeHits.length > 0) {
      const near = this.nearestEdgeCurve(edgeHits[0].point);
      if (near) return near.curve;
    }
    return null;
  }

  /** Show/clear a hover highlight (whole edge, yellow) at the pointer. */
  updateHover(clientX: number, clientY: number) {
    const c = this.pickEdge(clientX, clientY);
    this.hoverGroup.clear();
    if (c) {
      this.hoverGroup.add(edgeHighlight(c.pts, 0xffd24a));
      this.hoverGroup.add(this.marker(c.rep, 0xffd24a));
    }
  }

  clearHover() {
    this.hoverGroup.clear();
  }

  private toNdc(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  /** Nearest edge curve to point P (min distance over its polyline points). */
  private nearestEdgeCurve(P: THREE.Vector3): { curve: { pts: THREE.Vector3[]; rep: [number, number, number] }; dist: number } | null {
    let best: { curve: { pts: THREE.Vector3[]; rep: [number, number, number] }; dist: number } | null = null;
    for (const c of this.edgeCurves) {
      let d = Infinity;
      for (const pt of c.pts) d = Math.min(d, pt.distanceTo(P));
      if (!best || d < best.dist) best = { curve: c, dist: d };
    }
    return best;
  }

  private cameraPickThreshold(): number {
    return this.camera.position.distanceTo(this.controls.target) * 0.012;
  }

  private marker(p: [number, number, number], color: number): THREE.Mesh {
    const size = this.cameraPickThreshold() * 0.9;
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(size, 12, 12),
      new THREE.MeshBasicMaterial({ color, depthTest: false })
    );
    m.position.set(p[0], p[1], p[2]);
    m.renderOrder = 6;
    return m;
  }

  /** Replace the faint committed-sketch overlays (shown in model mode). */
  setSketchOverlays(objects: THREE.Object3D[]) {
    this.overlayGroup.clear();
    for (const o of objects) this.overlayGroup.add(o);
  }

  /** Show clickable filled sketch regions (extrude contour selection). */
  setExtrudeRegions(regions: { poly: Point2[]; index: number }[], plane: SketchPlane, selected: number[]) {
    this.regionGroup.clear();
    this.regionMeshes = [];
    const basis = new THREE.Matrix4().makeBasis(plane.u, plane.v, plane.normal);
    for (const r of regions) {
      if (r.poly.length < 3) continue;
      const shape = new THREE.Shape(r.poly.map((p) => new THREE.Vector2(p.x, p.y)));
      const geo = new THREE.ShapeGeometry(shape);
      const on = selected.includes(r.index);
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: on ? 0x2f6fea : 0x9aa3ad,
          transparent: true,
          opacity: on ? 0.4 : 0.15,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      mesh.quaternion.setFromRotationMatrix(basis);
      mesh.position.copy(plane.origin);
      mesh.userData.index = r.index;
      this.regionGroup.add(mesh);
      this.regionMeshes.push(mesh);
    }
  }

  /** Raycast the pointer against region fills; returns the region index or null. */
  pickRegion(clientX: number, clientY: number): number | null {
    const ndc = this.toNdc(clientX, clientY);
    this.edgeRaycaster.setFromCamera(ndc, this.camera);
    const hits = this.edgeRaycaster.intersectObjects(this.regionMeshes, false);
    return hits.length > 0 ? (hits[0].object.userData.index as number) : null;
  }

  clearExtrudeRegions() {
    this.regionGroup.clear();
    this.regionMeshes = [];
  }

  /** Raycast the pointer against solid faces; returns the hit point + world normal. */
  pickFace(clientX: number, clientY: number): { o: [number, number, number]; n: [number, number, number] } | null {
    const ndc = this.toNdc(clientX, clientY);
    this.edgeRaycaster.setFromCamera(ndc, this.camera);
    const hits = this.edgeRaycaster.intersectObjects(this.bodyMeshes, false);
    if (hits.length === 0 || !hits[0].face) return null;
    const p = hits[0].point;
    const n = hits[0].face.normal.clone().transformDirection(hits[0].object.matrixWorld).normalize();
    return { o: [p.x, p.y, p.z], n: [n.x, n.y, n.z] };
  }

  /** Highlight the selected edges (whole edge in orange) given their ref points. */
  setSelectedEdges(reps: [number, number, number][]) {
    this.markerGroup.clear();
    for (const rep of reps) {
      const c = this.curveByRep(rep);
      if (c) this.markerGroup.add(edgeHighlight(c.pts, 0xff8c00));
      this.markerGroup.add(this.marker(rep, 0xff8c00));
    }
  }

  private curveByRep(rep: [number, number, number]) {
    return this.edgeCurves.find(
      (c) => Math.abs(c.rep[0] - rep[0]) < 1e-6 && Math.abs(c.rep[1] - rep[1]) < 1e-6 && Math.abs(c.rep[2] - rep[2]) < 1e-6
    );
  }

  /** Build a shaded solid (with crisp B-rep edges) and add it to the model. */
  addSolid(data: MeshData): THREE.Object3D {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    geom.setAttribute("normal", new THREE.BufferAttribute(data.normals, 3));
    geom.setIndex(data.indices);

    const mesh = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({ color: 0x9fb0c3, metalness: 0.15, roughness: 0.55 })
    );

    const group = new THREE.Group();
    group.add(mesh);
    this.bodyMeshes.push(mesh);

    if (data.edges.length > 0) {
      const eg = new THREE.BufferGeometry();
      eg.setAttribute("position", new THREE.BufferAttribute(data.edges, 3));
      const segs = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x141619 }));
      group.add(segs);
      this.pickableEdges.push(segs);
    }
    for (const c of data.edgeCurves) {
      this.edgeCurves.push({ pts: c.points.map((p) => new THREE.Vector3(p[0], p[1], p[2])), rep: c.rep });
    }

    this.modelGroup.add(group);
    return group;
  }

  /** Frame the camera to look at the whole model. */
  frameModel() {
    const box = new THREE.Box3().setFromObject(this.modelGroup);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const dir = new THREE.Vector3(1, 0.8, 1).normalize();
    this.camera.up.set(0, 1, 0);
    this.camera.position.copy(center).addScaledVector(dir, size * 1.2 || 200);
    this.controls.target.copy(center);
    this.controls.enableRotate = true;
    this.camera.lookAt(center);
    this.controls.update();
  }

  dispose() {
    cancelAnimationFrame(this.animationHandle);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
