// SiteTrack Pro — platform support tickets queries.

export type PResult<T> = { ok: true; data: T } | { ok: false; error: string };

export interface Ticket {
  id: string; subject: string; body: string; from: string; email: string;
  status: string; created: string; org_id: string;
  messages?: Array<{ id: string; by: string; text: string; time: string }>;
  replied_at?: string; closed_at?: string;
}

export interface OrgBrief { id: string; name: string; }

export async function listSupportTickets(client: any): Promise<PResult<Ticket[]>> {
  try {
    const { data, error } = await client.from("support_tickets").select("*").order("created", { ascending: false });
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: data ?? [] };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function listOrgsBrief(client: any): Promise<PResult<OrgBrief[]>> {
  try {
    const { data, error } = await client.from("orgs").select("id, name");
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: data ?? [] };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function updateSupportTicket(
  client: any, id: string, updates: Partial<Ticket>,
): Promise<PResult<void>> {
  try {
    const { error } = await client.from("support_tickets").update(updates).eq("id", id);
    if (error) return { ok: false, error: String(error.message ?? error) };
    return { ok: true, data: undefined };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}
