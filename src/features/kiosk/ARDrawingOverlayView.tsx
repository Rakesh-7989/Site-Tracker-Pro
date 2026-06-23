// SiteTrack Pro — AR Drawing Overlay (/kiosk/ar).
// Phone camera overlay for as-built verification.

import { PlanGate } from "@/auth";

export function ARDrawingOverlayView(): JSX.Element {
  return <PlanGate feature="ar_overlay">
    <div className="min-h-screen bg-ink-900 text-cream p-8 grid place-items-center">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-4 opacity-30">&#9670;</div>
        <h1 className="text-3xl font-light mb-2">AR Drawing Overlay</h1>
        <p className="text-cream/50 text-sm mb-6">
          Point your phone camera at a wall or slab to see the released drawing overlaid in real time.
        </p>
        <div className="bg-ink-700/40 rounded-3xl p-8 border border-amber-600/25">
          <div className="text-amber-400 text-lg font-bold mb-2">Camera access required</div>
          <p className="text-cream/40 text-xs">
            This feature uses the device camera and WebXR. Open on a mobile device with a rear camera.
            The drawing overlay matches GPS + compass bearing against the released drawing set.
          </p>
        </div>
      </div>
    </div>
  </PlanGate>;
}
