// SiteTrack Pro â€” Accept invite landing page (/accept-invite).
// After the org admin sends an invite, the user receives an email with a
// login link. This page greets them, shows the org + role they're joining,
// and prompts them to sign in or set a password.

import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth";
import { Card, Spinner, Icon } from "@/components/ui/atoms";


import { getClient } from "@/lib/supabase";
export function AcceptInviteView(): JSX.Element {
  const { session, status } = useAuth();
  const [params] = useSearchParams();
  const email = params.get("email") ?? "";
  const [orgName, setOrgName] = useState("");
  const [orgRole, setOrgRole] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!email) { setLoading(false); return; }
    (async () => {
      const client = await getClient();
      if (!client) { setLoading(false); return; }
      const { data, error } = await client.rpc("lookup_user_for_invite", { p_email: email });
      if (!error && data?.length > 0) {
        const row = data[0];
        setOrgName(row.org_name ?? "");
        setOrgRole(row.org_role ?? "");
      }
      setLoading(false);
    })();
  }, [email]);

  const isLoggedIn = status === "ready" && session;

  return (
    <div className="min-h-screen bg-cream-50 grid place-items-center px-5">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-safety-50 text-safety-600 grid place-items-center mx-auto mb-3">
          <Icon name="mail" size={28} />
        </div>

        {loading ? (
          <Spinner size={20} />
        ) : !email ? (
          <>
            <h1 className="font-display text-xl font-bold">Check your email</h1>
            <p className="text-sm text-ink-600 mt-2">
              Your org admin has invited you to join SiteTrack Pro.
              Look for an email with login instructions.
            </p>
            <Link to="/login" className="inline-block mt-5 text-sm font-semibold text-safety-600 hover:text-safety-700">
              Go to sign in
            </Link>
          </>
        ) : isLoggedIn ? (
          <>
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 grid place-items-center mx-auto mb-2">
              <Icon name="check" size={24} />
            </div>
            <h1 className="font-display text-xl font-bold">You're all set</h1>
            <p className="text-sm text-ink-600 mt-2">
              You have been added to <b>{orgName || "your organization"}</b>
              {orgRole ? <> as <b>{orgRole}</b></> : ""}.
            </p>
            <Link to="/dashboard" className="inline-block mt-5 px-6 py-2.5 bg-safety-600 text-white font-bold rounded-xl text-sm hover:bg-safety-700">
              Go to dashboard
            </Link>
          </>
        ) : (
          <>
            <h1 className="font-display text-xl font-bold">You're invited!</h1>
            <p className="text-sm text-ink-600 mt-2">
              You've been invited to join <b>{orgName || "SiteTrack Pro"}</b>
              {orgRole ? <> as <b>{orgRole}</b></> : ""}.
            </p>
            <p className="text-sm text-ink-500 mt-1">
              Sign in with your email <b>{email}</b> and the temporary password sent to your inbox.
            </p>
            <Link to="/login" className="inline-block mt-5 px-6 py-2.5 bg-safety-600 text-white font-bold rounded-xl text-sm hover:bg-safety-700">
              Sign in to SiteTrack Pro
            </Link>
            <div className="mt-4 text-xs text-ink-400">
              First time? Check your email for the temporary password from SiteTrack.
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
