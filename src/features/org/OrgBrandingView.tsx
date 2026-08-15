// SiteTrack Pro — Org Branding (/org/branding). "White-label" the active org:
// tagline + accent + logo URL. Writes the org-level `branding` row (migration 23).

import { useCallback, useEffect, useState } from "react";
import { useAuth, useCan, useOrgSwitcher } from "@/auth";
import { Card, Button, Spinner, Alert, Icon, AccessDenied } from "@/components/ui/atoms";
import { Input, Select } from "@/components/ui/forms";
import { getClient } from "@/lib/supabase";
import { getOrgBranding, upsertOrgBranding, BRANDING_PRESETS, type OrgBrandingForm } from "@/app/brandingQueries";
import { getOrgSubdomain, setOrgSubdomain } from "@/app/subdomainQueries";

const ACCENT_OPTS = BRANDING_PRESETS.map(p => ({ value: p.accent, label: p.label }));

export function OrgBrandingView(): JSX.Element {
  const { session } = useAuth();
  const { activeOrg } = useOrgSwitcher();
  const canManage = useCan("org:branding:manage", activeOrg ? { orgId: activeOrg.orgId } : {});
  if (!session) return <></>;
  if (!activeOrg) return <Alert variant="warning">Select an organization first.</Alert>;
  if (!canManage) return <AccessDenied message="Org branding requires org admin." />;
  return <Inner orgId={activeOrg.orgId} />;
}

function Inner({ orgId }: { orgId: string }): JSX.Element {
  const [form, setForm] = useState<OrgBrandingForm>({ logoUrl: "", tagline: "Construction Suite", accent: "blue" });
  const [subdomain, setSubdomain] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [subSaving, setSubSaving] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);
  const [subDone, setSubDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setLoading(false); return; }
    const res = await getOrgBranding(client, orgId);
    if (res.ok && res.data) {
      setForm({
        logoUrl: res.data.logoUrl ?? "",
        tagline: res.data.tagline ?? "",
        accent: (res.data.accent as OrgBrandingForm["accent"]) || "blue",
      });
    } else if (!res.ok) {
      setError(res.error);
    }
    const subRes = await getOrgSubdomain(client, orgId);
    if (subRes.ok) setSubdomain(subRes.data ?? "");
    setLoading(false);
  }, [orgId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true); setError(null); setDone(false);
    const client = await getClient();
    if (!client) { setError("Backend not configured."); setSaving(false); return; }
    const res = await upsertOrgBranding(client, orgId, {
      logoUrl: form.logoUrl.trim() || null,
      tagline: form.tagline.trim() || null,
      accent: form.accent,
    });
    if (!res.ok) setError(res.error);
    else setDone(true);
    setSaving(false);
  };

  const saveSubdomain = async () => {
    setSubSaving(true); setSubError(null); setSubDone(false);
    const client = await getClient();
    if (!client) { setSubError("Backend not configured."); setSubSaving(false); return; }
    const res = await setOrgSubdomain(client, orgId, subdomain);
    if (!res.ok) setSubError(res.error);
    else setSubDone(true);
    setSubSaving(false);
  };

  if (loading) return <div className="grid place-items-center py-12"><Spinner size={24} /></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-4 md:p-6">
      <h1 className="font-display text-xl md:text-2xl font-bold text-fg-primary">Org branding</h1>
      <p className="text-sm text-fg-secondary -mt-2">White-label this org: tagline, accent color, and logo shown in the top bar.</p>
      {error && <Alert variant="danger">{error}</Alert>}
      {done && <Alert variant="success">Branding saved.</Alert>}

      <Card className="p-4 space-y-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Tagline</span>
          <Input className="mt-1" value={form.tagline} onChange={e => setForm(prev => ({ ...prev, tagline: e.target.value }))} placeholder="e.g. Buildco Premium Homes" />
        </div>
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Accent</span>
          <Select fit className="mt-1 w-56" value={form.accent} onChange={e => setForm(prev => ({ ...prev, accent: e.target.value as OrgBrandingForm["accent"] }))} options={ACCENT_OPTS} />
        </div>
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">Logo URL (optional)</span>
          <Input className="mt-1" value={form.logoUrl} onChange={e => setForm(prev => ({ ...prev, logoUrl: e.target.value }))} placeholder="https://yourbrand.com/logo.png" />
          <p className="text-xs text-fg-tertiary mt-1">PNG / JPG / SVG. Recommended size: 120×40px.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => void save()} disabled={saving}>{saving ? <Spinner size={14} /> : <Icon name="check" size={14} />} Save branding</Button>
          <div className="flex gap-2 items-center">
            {BRANDING_PRESETS.map(p => (
              <button key={p.id} type="button" onClick={() => setForm(prev => ({ ...prev, accent: p.accent, tagline: p.tagline }))} className="w-7 h-7 rounded-full ring-offset-2" title={`${p.label} preset`} style={{ backgroundColor: p.accent }} aria-label={`Apply ${p.label} preset`} />
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-tertiary">White-label subdomain</span>
            <Icon name="plug" size={14} className="text-fg-tertiary" />
          </div>
          <p className="text-xs text-fg-secondary mt-1">
            Serve this org on its own branded subdomain (e.g. <span className="font-mono text-fg-primary">yourco.sitetrack.in</span>). Landing, login, and the whole app auto-apply this org's logo + accent and auto-switch members into it. Leave empty to use the shared app URL.
          </p>
        </div>
        {subError && <Alert variant="danger">{subError}</Alert>}
        {subDone && <Alert variant="success">Subdomain saved. Ask your site admin to wire the wildcard DNS record.</Alert>}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Input className="mt-1" value={subdomain} onChange={e => setSubdomain(e.target.value)} placeholder="yourco" />
            <p className="text-xs text-fg-tertiary mt-1">Letters, numbers and hyphens only.</p>
          </div>
          <span className="text-sm text-fg-secondary pb-2">.sitetrack.in</span>
          <Button onClick={() => void saveSubdomain()} disabled={subSaving}>{subSaving ? <Spinner size={14} /> : <Icon name="check" size={14} />} Save</Button>
        </div>
      </Card>
    </div>
  );
}
