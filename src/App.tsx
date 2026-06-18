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
import { DraftPropertyManager } from "./ui/DraftPropertyManager";
import { ExtrudePropertyManager } from "./ui/ExtrudePropertyManager";
import { StatusBar } from "./ui/StatusBar";
import { ChatPanel } from "./ui/ChatPanel";
import { AiDrawDialog } from "./ui/AiDrawDialog";
import { Notice } from "./ui/Notice";
import { FeedbackButton } from "./ui/FeedbackButton";
import { FeedbackAdmin } from "./ui/FeedbackAdmin";
import { AuthModal } from "./ui/AuthModal";
import { ChangePasswordModal } from "./ui/ChangePasswordModal";
import { ProjectsModal } from "./ui/ProjectsModal";
import { ViewportCanvas } from "./viewport/ViewportCanvas";
import { useViewportStore } from "./state/store";
import { useEffect } from "react";

export function App() {
  const mode = useViewportStore((s) => s.mode);
  const edgeSelect = useViewportStore((s) => s.edgeSelect);
  const shellSession = useViewportStore((s) => s.shellSession);
  const draftSession = useViewportStore((s) => s.draftSession);
  const extrudeSession = useViewportStore((s) => s.extrudeSession);
  const checkAuth = useViewportStore((s) => s.checkAuth);

  useEffect(() => { void checkAuth(); }, [checkAuth]);

  const leftPanel = edgeSelect ? (
    <FilletPropertyManager />
  ) : shellSession ? (
    <ShellPropertyManager />
  ) : draftSession ? (
    <DraftPropertyManager />
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
      <FeedbackButton />
      <FeedbackAdmin />
      <AuthModal />
      <ChangePasswordModal />
      <ProjectsModal />
    </div>
  );
}
