// SiteTrack Pro — verify email screen.
//
// After registration, the user must confirm their email before signing in.
// This screen shows the confirmation status and provides a resend option.

import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth";
import { Card, Alert } from "@/components/ui/atoms";

export function VerifyEmailView(): JSX.Element {
  const { session, status } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [resendSent, setResendSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user?.email) {
      setEmail(session.user.email);
    }
  }, [session]);

  const resendConfirm = async () => {
    setError(null);
    setResendSent(true);
    setTimeout(() => {
      setResendSent(false);
    }, 3000);
  };

  useEffect(() => {
    if (session?.user?.email) {
      const timer = setTimeout(() => {
        navigate("/onboarding");
      }, 1000);
      return () => clearTimeout(timer);
    }
    return;
  }, [session, navigate]);

  if (status === "ready" && session) {
    navigate("/onboarding");
    return <div className="min-h-screen" />;
  }

  return (
    <div className="min-h-screen bg-panel text-fg-primary">
      <header className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Confirm your email</h1>
        <Link to="/login" className="text-sm font-semibold text-fg-secondary hover:text-fg-primary">Sign in</Link>
      </header>

      <div className="max-w-md mx-auto px-5 py-8">
        <Card className="p-6 space-y-4">
          {error && <Alert variant="danger">{error}</Alert>}

          <p className="text-sm text-fg-secondary mb-4">
            We sent a confirmation link to:<br />
            <strong className="text-fg-primary">{email}</strong>
          </p>

          <div>
            <button onClick={() => resendConfirm()} disabled={resendSent} className="w-full px-6 py-2.5 rounded-xl border border-border bg-bg-secondary text-sm font-semibold text-fg-primary hover:bg-bg-secondary/70 disabled:opacity-50 disabled:cursor-not-allowed">
              {resendSent ? "Sending..." : "Resend email"}
            </button>
          </div>

          <p className="text-sm text-fg-secondary">
            Didn't receive it?<br />
            <a href="javascript:void(0)" className="text-accent hover:underline">Check your spam or promotions folder</a>
          </p>

          <div className="mt-6 text-sm text-fg-tertiary">
            <p>14-day Pro trial</p>
            <p>Already have an account? <a href="/login" className="font-semibold text-accent">Sign in</a></p>
          </div>
        </Card>
      </div>
    </div>
  );
}