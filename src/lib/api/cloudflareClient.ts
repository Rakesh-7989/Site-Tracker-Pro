/**
 * SiteTrack Pro — Cloudflare Native Client Adapter
 *
 * Provides a clean interface for Frontend components to consume Cloudflare Workers APIs
 * (Auth, D1, R2 Storage, Razorpay) with seamless fallback support.
 */

const API_BASE = (import.meta.env?.VITE_CLOUDFLARE_API_URL as string) || "/api";

export interface AuthSession {
  token: string;
  user: {
    id: string;
    email: string;
    fullName?: string;
  };
  organizations: Array<{
    id: string;
    slug: string;
    name: string;
    plan: string;
    role: string;
    is_admin: boolean;
  }>;
}

const TOKEN_KEY = "sitetrack_cf_token";

export const cloudflareAuth = {
  getToken(): string | null {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
  },

  setToken(token: string): void {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(TOKEN_KEY, token);
    }
  },

  clearToken(): void {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
    }
  },

  async login(email: string, password: string): Promise<{ ok: boolean; session?: AuthSession; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json() as { ok: boolean; token?: string; user?: AuthSession["user"]; organizations?: AuthSession["organizations"]; error?: string };
      if (!res.ok || !data.ok || !data.token) {
        return { ok: false, error: data.error || "Login failed" };
      }

      this.setToken(data.token);
      return {
        ok: true,
        session: {
          token: data.token,
          user: data.user!,
          organizations: data.organizations || [],
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  async me(): Promise<{ ok: boolean; user?: AuthSession["user"]; organizations?: AuthSession["organizations"]; error?: string }> {
    const token = this.getToken();
    if (!token) return { ok: false, error: "No active session" };

    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { ok: boolean; user?: AuthSession["user"]; organizations?: AuthSession["organizations"]; error?: string };
      if (!res.ok || !data.ok) return { ok: false, error: data.error || "Session invalid" };
      return { ok: true, user: data.user, organizations: data.organizations };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  logout(): void {
    this.clearToken();
  },
};

export const cloudflareStorage = {
  async upload(file: File | Blob, folder = "uploads", filename?: string): Promise<{ ok: boolean; key?: string; url?: string; error?: string }> {
    const token = cloudflareAuth.getToken();
    const headers: Record<string, string> = {
      "Content-Type": file.type || "application/octet-stream",
      "x-folder": folder,
    };
    if (filename) headers["x-filename"] = filename;
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const res = await fetch(`${API_BASE}/storage/upload`, {
        method: "POST",
        headers,
        body: file,
      });
      const data = await res.json() as { ok: boolean; key?: string; url?: string; error?: string };
      return data;
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },

  getFileUrl(key: string): string {
    return `${API_BASE}/storage/files/${key}`;
  },
};

