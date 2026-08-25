import type { TypedSupabaseClient } from "@/lib/supabase";

export async function reviewSignupRequest(
  client: TypedSupabaseClient,
  input: { requestId: string; action: "approve" | "reject"; notes?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { data, error } = await client.functions.invoke("review_signup_request", {
      body: {
        requestId: input.requestId,
        action: input.action,
        ...(input.notes ? { notes: input.notes } : {}),
      },
    });
    if (error) return { ok: false, error: error.message };
    const body = data as { ok?: boolean; error?: string } | null;
    if (body && body.ok === false) {
      return { ok: false, error: body.error ?? "review-failed" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
