import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { useT } from "@/i18n";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/forms";
import { Alert } from "@/components/ui/Alert";

export function LoginView() {
  const { signIn, session, isLoading } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isLoading && session) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn(email.trim(), password);
    setBusy(false);
    if (res.ok) navigate("/dashboard", { replace: true });
    else setError(res.error ?? "Sign-in failed");
  }

  return (
    <main className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-fg-primary">{t("auth.appTitle")}</h1>
          <p className="mt-1 text-sm text-fg-secondary">{t("auth.subtitle")}</p>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          {error && <Alert variant="error">{error}</Alert>}
          <Input
            label={t("auth.email")}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label={t("auth.password")}
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" loading={busy} size="lg">
            {t("auth.signIn")}
          </Button>
        </form>
      </div>
    </main>
  );
}
