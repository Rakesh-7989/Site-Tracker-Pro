// SiteTrack Pro — project rate cards (v4 C2).
// DB: rate_cards (migration 141). RLS: read = project member, write = managers
// + org admin. UI gating via rate:manage; plan gate via 'rate_cards'.
// A rate card is the member's hourly ₹/hr for a project, effective-dated.
// The billing engine falls back to it when a time entry has no rate snapshot.

import { localDateISO } from "@/lib/dateLocal";

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const ok = <T>(d: T): Result<T> => ({ ok: true, data: d });
const er = (e: unknown): Result<never> => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const dbe = (e: { message?: string }): Result<never> => ({ ok: false, error: String(e.message ?? e) });

export interface RateCard {
  id: string;
  projectId: string;
  profileId: string;
  memberName: string | null;
  rate: number;
  effectiveFrom: string;
  notes: string | null;
  createdAt: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listRateCards(client: any, projectId: string): Promise<Result<RateCard[]>> {
  try {
    const { data, error } = await client
      .from("rate_cards")
      .select("id, project_id, profile_id, rate, effective_from, notes, created_at, profiles(name)")
      .eq("project_id", projectId)
      .order("effective_from", { ascending: false });
    if (error) return dbe(error);
    return ok(((data ?? []) as Array<Record<string, unknown>>).map(r => ({
      id: String(r.id),
      projectId: String(r.project_id ?? ""),
      profileId: String(r.profile_id ?? ""),
      memberName: (r.profiles as { name?: string } | null | undefined)?.name ?? null,
      rate: Number(r.rate ?? 0),
      effectiveFrom: String(r.effective_from ?? ""),
      notes: r.notes == null ? null : String(r.notes),
      createdAt: String(r.created_at ?? ""),
    })));
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertRateCard(client: any, input: {
  projectId: string; profileId: string; rate: number; effectiveFrom?: string; notes?: string;
}): Promise<Result<{ id: string }>> {
  try {
    const { data, error } = await client
      .from("rate_cards")
      .upsert({
        project_id: input.projectId, profile_id: input.profileId, rate: input.rate,
        effective_from: input.effectiveFrom || localDateISO(),
        notes: input.notes || null,
      }, { onConflict: "project_id,profile_id,effective_from" })
      .select("id").single();
    if (error) return dbe(error);
    return ok({ id: String(data.id) });
  } catch (e) { return er(e); }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteRateCard(client: any, id: string): Promise<Result<{ ok: true }>> {
  try {
    const { error } = await client.from("rate_cards").delete().eq("id", id);
    if (error) return dbe(error);
    return ok({ ok: true });
  } catch (e) { return er(e); }
}

/** Latest rate card for a member effective on/after `date` (null when none). */
export function effectiveRate(profileId: string, date: string, cards: RateCard[]): number | null {
  const eligible = cards.filter(c => c.profileId === profileId && c.effectiveFrom <= date);
  if (eligible.length === 0) return null;
  eligible.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  return eligible[0].rate;
}
