import { Toolbar } from "./ui/Toolbar";
import { FeatureTree } from "./ui/FeatureTree";
import { PropertyManager } from "./ui/PropertyManager";
import { SketchRibbon } from "./ui/SketchRibbon";
import { SketchOverlay } from "./ui/SketchOverlay";
import { ParametersPanel } from "./ui/ParametersPanel";
import { FeatureEditor } from "./ui/FeatureEditor";
import { RevolveDialog } from "./ui/RevolveDialog";
import { LoftDialog } from "./ui/LoftDialog";
import { SweepDialog } from "./ui/SweepDialog";
import { FilletPropertyManager } from "./ui/FilletPropertyManager";
import { ShellPropertyManager } from "./ui/ShellPropertyManager";
import { ExtrudePropertyManager } from "./ui/ExtrudePropertyManager";
import { StatusBar } from "./ui/StatusBar";
import { ChatPanel } from "./ui/ChatPanel";
import { AiDrawDialog } from "./ui/AiDrawDialog";
import { Notice } from "./ui/Notice";
import { ViewportCanvas } from "./viewport/ViewportCanvas";
import { useViewportStore } from "./state/store";

export function App() {
  const mode = useViewportStore((s) => s.mode);
  const edgeSelect = useViewportStore((s) => s.edgeSelect);
  const shellSession = useViewportStore((s) => s.shellSession);
  const extrudeSession = useViewportStore((s) => s.extrudeSession);

  const leftPanel = edgeSelect ? (
    <FilletPropertyManager />
  ) : shellSession ? (
    <ShellPropertyManager />
  ) : extrudeSession ? (
    <ExtrudePropertyManager />
  ) : mode === "sketch" ? (
    <PropertyManager />
  ) : (
    <FeatureTree />
  );

  return (
    <div className="app">
      <Toolbar />
      <SketchRibbon />
      <div className="body">
        {leftPanel}
        <div className="viewport-wrap">
          <ViewportCanvas />
          <SketchOverlay />
          <RevolveDialog />
          <LoftDialog />
          <SweepDialog />
        </div>
        {mode === "sketch" ? <ParametersPanel /> : <FeatureEditor />}
      </div>
      <StatusBar />
      <ChatPanel />
      <AiDrawDialog />
      <Notice />
    </div>
  );
}
