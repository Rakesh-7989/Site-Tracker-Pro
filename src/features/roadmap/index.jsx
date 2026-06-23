// SiteTrack Pro — PlanGate utility (premium feature upsell wrapper).
// Extracted from Batch 2/3 roadmap views (all ported to v3 standalone files).
// Kept as a shared utility used by vendor-dashboard and detail tabs in App.jsx.

import { Ic } from "../../components/ui.jsx";
import { canUseFeature, upsellLine } from "../../lib/planGating.js";

/**
 * PlanGate — wrap any premium UI with this. If the active plan can use the
 * feature, returns children. Otherwise shows a soft upsell card.
 *
 *   <PlanGate plan={user.plan} feature="ar_overlay" planName="Business">
 *     <ARDrawingOverlay/>
 *   </PlanGate>
 */
export function PlanGate({plan="basic",feature,planName="Business",children,compact=false}){
  if(canUseFeature(plan,feature)) return children;
  const upsell = upsellLine(plan,feature);
  if(compact) return <div className="text-[11px] font-bold text-amber-700 italic">{upsell}</div>;
  return(
    <div className="bg-white rounded-2xl p-6 text-center" style={{border:"1px dashed var(--st-line)"}}>
      <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-amber-50 flex items-center justify-center"><Ic n="shield" s={20} c="text-amber-700"/></div>
      <div className="font-display text-lg font-semibold text-ink-900 tracking-editorial mb-1">{planName} plan unlocks this</div>
      <p className="text-ink-500 text-xs max-w-md mx-auto leading-relaxed">{upsell}</p>
    </div>
  );
}
