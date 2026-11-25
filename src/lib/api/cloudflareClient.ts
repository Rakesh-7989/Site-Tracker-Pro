/**
 * SiteTrack Pro — Cloudflare Native Client Adapter
 *
 * Provides a clean interface for Frontend components to consume Cloudflare Workers APIs
 * (Auth, D1, R2 Storage, Razorpay) with seamless fallback support.
 */

export const CLOUDFLARE_API_DEFAULT_URL = "https://sitetrack-api.boyapatirakesh-mahespaddy.workers.dev/api";

const API_BASE =
  (import.meta.env?.VITE_CLOUDFLARE_API_URL as string) ||
  (import.meta.env?.VITE_BACKEND_PROVIDER === "cloudflare" ? CLOUDFLARE_API_DEFAULT_URL : "/api");

export function isCloudflareBackendEnabled(): boolean {
  return (
    import.meta.env?.VITE_BACKEND_PROVIDER === "cloudflare" ||
    Boolean(import.meta.env?.VITE_CLOUDFLARE_API_URL)
  );
}

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

  async register(input: {
    email: string;
    password: string;
    fullName?: string;
    orgName: string;
    orgSlug: string;
    orgType?: string;
  }): Promise<{ ok: boolean; session?: AuthSession; error?: string }> {
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = (await res.json()) as {
        ok: boolean;
        token?: string;
        user?: AuthSession["user"];
        organization?: { id: string; slug: string; name: string };
        error?: string;
      };
      if (!res.ok || !data.ok || !data.token) {
        return { ok: false, error: data.error || "Registration failed" };
      }

      this.setToken(data.token);
      return {
        ok: true,
        session: {
          token: data.token,
          user: data.user!,
          organizations: data.organization
            ? [{ ...data.organization, plan: "basic", role: "admin", is_admin: true }]
            : [],
        },
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
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

async function cfRequest<T>(
  path: string,
  options: { method?: string; orgId?: string; body?: unknown } = {}
): Promise<{ ok: boolean; data?: T; error?: string }> {
  const token = cloudflareAuth.getToken();
  if (!token) return { ok: false, error: "authentication required" };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (options.orgId) headers["X-Org-Id"] = options.orgId;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const json = (await res.json()) as { ok?: boolean; error?: string } & T;
    if (!res.ok || json.ok === false) {
      return { ok: false, error: json.error || `HTTP ${res.status}` };
    }
    return { ok: true, data: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const cloudflareApi = {
  listProjects: (orgId?: string) => cfRequest<{ projects: unknown[] }>("/projects", { orgId }),
  createProject: (input: { name: string; type?: string; budget?: number }, orgId?: string) =>
    cfRequest<{ id: string }>("/projects", { method: "POST", orgId, body: input }),
  getProject: (projectId: string, orgId?: string) =>
    cfRequest<{ project: unknown }>(`/projects/${projectId}`, { orgId }),

  listTasks: (projectId: string, orgId?: string) =>
    cfRequest<{ tasks: unknown[] }>(`/projects/${projectId}/tasks`, { orgId }),
  createTask: (projectId: string, input: { title: string; description?: string; milestoneId?: string; priority?: string; dueDate?: string }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/tasks`, { method: "POST", orgId, body: input }),
  updateTaskStatus: (projectId: string, taskId: string, status: "todo" | "in_progress" | "review" | "done", orgId?: string) =>
    cfRequest<{ id: string; status: string }>(`/projects/${projectId}/tasks/${taskId}`, { method: "PATCH", orgId, body: { status } }),

  listMilestones: (projectId: string, orgId?: string) =>
    cfRequest<{ milestones: unknown[] }>(`/projects/${projectId}/milestones`, { orgId }),
  createMilestone: (projectId: string, input: { title: string; description?: string; dueDate?: string; weight?: number }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/milestones`, { method: "POST", orgId, body: input }),

  listDprs: (projectId: string, orgId?: string) =>
    cfRequest<{ dprs: unknown[] }>(`/projects/${projectId}/dpr`, { orgId }),
  createDpr: (projectId: string, input: { transcriptText?: string; voiceAudioUrl?: string; photoLat?: number; photoLon?: number }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/dpr`, { method: "POST", orgId, body: input }),

  listAttendance: (projectId: string, date?: string, orgId?: string) =>
    cfRequest<{ attendance: unknown[] }>(`/projects/${projectId}/attendance${date ? `?date=${encodeURIComponent(date)}` : ""}`, { orgId }),
  recordAttendance: (projectId: string, input: { attendeeKind: "labour" | "staff" | "visitor"; attendeeName: string; date?: string; status?: string; hours?: number }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/attendance`, { method: "POST", orgId, body: input }),

  listInvoices: (projectId: string, orgId?: string) =>
    cfRequest<{ invoices: unknown[] }>(`/projects/${projectId}/invoices`, { orgId }),
  createInvoice: (projectId: string, input: { invoiceNumber: string; issueDate: string; dueDate?: string; subtotal: number; gstRate?: number; tdsRate?: number }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/invoices`, { method: "POST", orgId, body: input }),

  listExpenses: (projectId: string, orgId?: string) =>
    cfRequest<{ expenses: unknown[] }>(`/projects/${projectId}/expenses`, { orgId }),
  createExpense: (projectId: string, input: { category: string; description: string; amount: number; gst?: number; paidTo?: string; paidVia?: string; refNo?: string; expenseDate?: string }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/expenses`, { method: "POST", orgId, body: input }),

  listOrgMembers: (orgId: string) =>
    cfRequest<{ members: unknown[] }>(`/orgs/${orgId}/members`, { orgId }),

  listVendors: (orgId?: string) => cfRequest<{ vendors: unknown[] }>("/vendors", { orgId }),
  createVendor: (input: { name: string; contactPerson?: string; phone?: string; email?: string; gstin?: string; category?: string }, orgId?: string) =>
    cfRequest<{ id: string }>("/vendors", { method: "POST", orgId, body: input }),

  listBoqItems: (projectId: string, orgId?: string) =>
    cfRequest<{ items: unknown[] }>(`/projects/${projectId}/boq`, { orgId }),
  createBoqItem: (projectId: string, input: { itemCode?: string; itemName: string; unit?: string; qty: number; rate: number }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/boq`, { method: "POST", orgId, body: input }),

  listPurchaseOrders: (projectId: string, orgId?: string) =>
    cfRequest<{ purchaseOrders: unknown[] }>(`/projects/${projectId}/purchase-orders`, { orgId }),
  createPurchaseOrder: (projectId: string, input: { vendorId: string; poNumber: string; totalAmount: number; taxAmount?: number }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/purchase-orders`, { method: "POST", orgId, body: input }),

  listDrawings: (projectId: string, orgId?: string) =>
    cfRequest<{ drawings: unknown[] }>(`/projects/${projectId}/drawings`, { orgId }),
  createDrawing: (projectId: string, input: { title: string; discipline?: string; drawingNumber: string; currentFileKey: string; fileFormat?: string; status?: string }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/drawings`, { method: "POST", orgId, body: input }),

  listNotifications: (orgId?: string) => cfRequest<{ notifications: unknown[] }>("/notifications", { orgId }),
  markNotificationRead: (notificationId: string, orgId?: string) =>
    cfRequest<{ id: string; read: boolean }>(`/notifications/${notificationId}/read`, { method: "PATCH", orgId }),
};

