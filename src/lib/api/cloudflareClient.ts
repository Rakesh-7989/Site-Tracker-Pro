/**
 * SiteTrack Pro — Cloudflare Native Client Adapter
 *
 * Provides a clean interface for Frontend components to consume Cloudflare Workers APIs
 * (Auth, D1, R2 Storage, Razorpay) with seamless fallback support.
 */

import { isIdentityRole, type IdentityRole } from "@/auth/roles";

export const CLOUDFLARE_API_DEFAULT_URL = "https://sitetrack-api.boyapatirakesh-mahespaddy.workers.dev/api";
export const CF_AUTH_EVENT = "sitetrack-cf-auth-change";

const API_BASE =
  (import.meta.env?.VITE_CLOUDFLARE_API_URL as string) ||
  (import.meta.env?.VITE_BACKEND_PROVIDER === "cloudflare"
    ? (typeof window !== "undefined" ? "/api" : CLOUDFLARE_API_DEFAULT_URL)
    : "/api");

export function resolveCloudflareBackendEnabled(env: {
  VITE_BACKEND_PROVIDER?: string;
  VITE_BACKEND?: string;
  VITE_CLOUDFLARE_API_URL?: string;
}): boolean {
  const explicit = (env.VITE_BACKEND_PROVIDER || env.VITE_BACKEND || "").toLowerCase();
  if (explicit === "supabase" || explicit === "local") return false;
  if (explicit === "cloudflare") return true;
  return Boolean(env.VITE_CLOUDFLARE_API_URL);
}

export function isCloudflareBackendEnabled(): boolean {
  return resolveCloudflareBackendEnabled(
    (import.meta.env ?? {}) as {
      VITE_BACKEND_PROVIDER?: string;
      VITE_BACKEND?: string;
      VITE_CLOUDFLARE_API_URL?: string;
    }
  );
}

export interface CfUserPayload {
  id: string;
  email: string;
  fullName?: string;
  full_name?: string;
  is_platform_admin?: number | boolean;
}

export interface CfOrgPayload {
  id: string;
  slug: string;
  name: string;
  plan: string;
  role: string;
  is_admin: boolean | number;
}

export interface AuthSession {
  token: string;
  user: CfUserPayload;
  organizations: CfOrgPayload[];
}

function emitAuthChange(signedIn: boolean): void {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent(CF_AUTH_EVENT, { detail: { signedIn } }));
  }
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
      emitAuthChange(true);
    }
  },

  clearToken(): void {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(TOKEN_KEY);
      emitAuthChange(false);
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
    const token = this.getToken();
    if (token) {
      fetch(`${API_BASE}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    this.clearToken();
  },
};

export function toAppAuthSession(
  user: CfUserPayload,
  organizations: CfOrgPayload[],
  preferredOrgId?: string | null,
): import("@/auth/types").AuthSession {
  const isStaff = Boolean(user.is_platform_admin);
  const orgs: import("@/auth/types").OrgMembership[] = organizations.map((o) => ({
    orgId: o.id,
    orgName: o.name,
    orgSlug: o.slug,
    segment: null,
    isAdmin: Boolean(o.is_admin),
    joinedAt: new Date(0).toISOString(),
    status: "active",
  }));
  const activeOrgId =
    preferredOrgId && orgs.some((o) => o.orgId === preferredOrgId)
      ? preferredOrgId
      : (orgs[0]?.orgId ?? null);
  const firstRole = organizations[0]?.role;
  const identityRole: IdentityRole = isStaff
    ? "superadmin"
    : orgs.some((o) => o.isAdmin)
      ? "orgadmin"
      : isIdentityRole(firstRole)
        ? firstRole
        : "pm";

  return {
    user: {
      id: user.id,
      email: user.email,
      identityRole,
      name: user.fullName || user.full_name || user.email.split("@")[0] || "User",
      avatarUrl: null,
      isStaff,
      staffTier: isStaff ? "owner" : null,
      profileCompleted: true,
      mustChangePassword: false,
    },
    orgs,
    activeOrgId,
    projectMemberships: [],
    capabilityOverrides: [],
  };
}

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
  createMilestone: (projectId: string, input: { title: string; description?: string; dueDate?: string; weight?: number; orderIndex?: number }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/milestones`, { method: "POST", orgId, body: input }),
  updateMilestoneStatus: (projectId: string, milestoneId: string, status: "pending" | "in_progress" | "completed" | "blocked", orgId?: string) =>
    cfRequest<{ id: string; status: string }>(`/projects/${projectId}/milestones/${milestoneId}`, { method: "PATCH", orgId, body: { status } }),

  listRiskSignals: (projectId: string, orgId?: string) =>
    cfRequest<{ signals: unknown[] }>(`/projects/${projectId}/risk-signals`, { orgId }),

  listMaterialRequests: (projectId: string, orgId?: string) =>
    cfRequest<{ materialRequests: unknown[] }>(`/projects/${projectId}/material-requests`, { orgId }),
  createMaterialRequest: (projectId: string, input: { item: string; unit?: string; qty: number; needDate?: string; reason?: string; notes?: string }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/material-requests`, { method: "POST", orgId, body: input }),

  listSafetyIncidents: (projectId: string, orgId?: string) =>
    cfRequest<{ incidents: unknown[] }>(`/projects/${projectId}/safety`, { orgId }),
  createSafetyIncident: (projectId: string, input: { description: string; severity: "near_miss" | "first_aid" | "minor" | "major" | "fatal"; category?: string; location?: string; actionTaken?: string; incidentDate?: string }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/safety`, { method: "POST", orgId, body: input }),

  listInspections: (projectId: string, orgId?: string) =>
    cfRequest<{ inspections: unknown[] }>(`/projects/${projectId}/inspections`, { orgId }),
  createInspection: (projectId: string, input: { type: string; scope?: string; scheduledDate?: string; inspectorName?: string; observations?: string }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/inspections`, { method: "POST", orgId, body: input }),

  listPunchItems: (projectId: string, orgId?: string) =>
    cfRequest<{ punchItems: unknown[] }>(`/projects/${projectId}/punch`, { orgId }),
  createPunchItem: (projectId: string, input: { location: string; defect: string; trade?: string; severity?: string; unitId?: string; assignedTo?: string; dueDate?: string }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/punch`, { method: "POST", orgId, body: input }),

  listMeasurementBook: (projectId: string, orgId?: string) =>
    cfRequest<{ entries: unknown[] }>(`/projects/${projectId}/measurement-book`, { orgId }),
  createMeasurementBookEntry: (projectId: string, input: { mbNo: string; pageNo?: number; boqItemId?: string; description: string; location?: string; blockId?: string; floorId?: string; unit?: string; length?: number; breadth?: number; depth?: number; qty: number; rate?: number; notes?: string }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/measurement-book`, { method: "POST", orgId, body: input }),

  listLeads: (orgId?: string, stage?: string) =>
    cfRequest<{ leads: unknown[] }>(`/crm/leads${stage ? `?stage=${encodeURIComponent(stage)}` : ""}`, { orgId }),
  createLead: (input: { name: string; company?: string; phone?: string; email?: string; source?: string; budget?: number; stage?: string; notes?: string; ownerId?: string }, orgId?: string) =>
    cfRequest<{ id: string }>("/crm/leads", { method: "POST", orgId, body: input }),
  updateLead: (leadId: string, patch: { name?: string; company?: string | null; phone?: string | null; email?: string | null; source?: string | null; budget?: number | null; stage?: string; notes?: string | null; ownerId?: string | null; wonAmount?: number | null; lostReason?: string | null }, orgId?: string) =>
    cfRequest<{ id: string }>(`/crm/leads/${leadId}`, { method: "PATCH", orgId, body: patch }),

  listLeadQuotations: (leadId: string, orgId?: string) =>
    cfRequest<{ quotations: unknown[] }>(`/crm/leads/${leadId}/quotations`, { orgId }),
  createLeadQuotation: (leadId: string, input: { amount: number; status?: string; validUntil?: string }, orgId?: string) =>
    cfRequest<{ id: string }>(`/crm/leads/${leadId}/quotations`, { method: "POST", orgId, body: input }),

  listShareLinks: (projectId: string, orgId?: string) =>
    cfRequest<{ shareLinks: unknown[] }>(`/projects/${projectId}/share-links`, { orgId }),
  createShareLink: (projectId: string, input: { label?: string; passwordHash?: string; expiresAt?: string; allowDownload?: boolean; maxViews?: number }, orgId?: string) =>
    cfRequest<{ id: string; token: string }>(`/projects/${projectId}/share-links`, { method: "POST", orgId, body: input }),

  listHandoverSignatures: (projectId: string, orgId?: string) =>
    cfRequest<{ signatures: unknown[] }>(`/projects/${projectId}/handover-signatures`, { orgId }),
  createHandoverSignature: (projectId: string, input: { signatureData: string }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/handover-signatures`, { method: "POST", orgId, body: input }),

  listDprs: (projectId: string, orgId?: string) =>
    cfRequest<{ dprs: unknown[] }>(`/projects/${projectId}/dpr`, { orgId }),
  createDpr: (projectId: string, input: { transcriptText?: string; voiceAudioUrl?: string; photoLat?: number; photoLon?: number }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/dpr`, { method: "POST", orgId, body: input }),

  listAttendance: (projectId: string, date?: string, orgId?: string) =>
    cfRequest<{ records?: unknown[]; attendance?: unknown[] }>(`/projects/${projectId}/attendance${date ? `?date=${encodeURIComponent(date)}` : ""}`, { orgId }),
  recordAttendance: (projectId: string, input: { attendeeKind: "labour" | "staff" | "visitor"; labourId?: string; profileId?: string; attendeeName: string; date?: string; status?: string; hours?: number; inTime?: string; outTime?: string; source?: string }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/attendance`, { method: "POST", orgId, body: input }),

  listLabourRegister: (projectId: string, orgId?: string) =>
    cfRequest<{ workers: unknown[] }>(`/projects/${projectId}/labour`, { orgId }),
  createLabourWorker: (projectId: string, input: { name: string; trade?: string; wage?: number; joined?: string }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/labour`, { method: "POST", orgId, body: input }),

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
    cfRequest<{ id: string; amount?: number }>(`/projects/${projectId}/boq`, { method: "POST", orgId, body: input }),
  updateBoqItemStatus: (projectId: string, itemId: string, status: string, orgId?: string) =>
    cfRequest<{ updated: boolean }>(`/projects/${projectId}/boq/${itemId}`, { method: "PATCH", orgId, body: { status } }),

  listInventoryTransactions: (projectId: string, orgId?: string) =>
    cfRequest<{ transactions: unknown[] }>(`/projects/${projectId}/inventory`, { orgId }),
  recordInventoryTransaction: (projectId: string, input: { txnDate?: string; material: string; unit?: string; qty: number; direction: "inward" | "outward" | "return" | "wastage"; source?: string; refNo?: string; poId?: string; notes?: string }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/inventory`, { method: "POST", orgId, body: input }),

  listChatChannels: (orgId?: string) =>
    cfRequest<{ channels: unknown[] }>("/chat/channels", { orgId }),
  createChatChannel: (input: { name: string; description?: string }, orgId?: string) =>
    cfRequest<{ id: string; name: string }>("/chat/channels", { method: "POST", orgId, body: input }),
  listChatMessages: (channelId: string, orgId?: string) =>
    cfRequest<{ messages: unknown[] }>(`/chat/channels/${channelId}/messages`, { orgId }),
  postChatMessage: (channelId: string, input: { body: string; parentId?: string; senderName?: string; mentions?: string[] }, orgId?: string) =>
    cfRequest<{ id: string }>(`/chat/channels/${channelId}/messages`, { method: "POST", orgId, body: input }),

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

  inviteOrgMember: (orgId: string, input: { email: string; role: string }) =>
    cfRequest<{ id: string; token: string }>(`/orgs/${orgId}/invitations`, { method: "POST", orgId, body: input }),
  removeOrgMember: (orgId: string, profileId: string) =>
    cfRequest<{ removed: string }>(`/orgs/${orgId}/members/${profileId}`, { method: "DELETE", orgId }),
  mintPlanPaymentLink: (input: { plan: "basic" | "pro" | "business"; period?: "monthly" | "annual" }, orgId?: string) =>
    cfRequest<{ linkId: string; shortUrl: string }>("/payments/razorpay-plan-link", { method: "POST", orgId, body: input }),
  submitSignupRequest: (input: { firmName: string; contactName: string; email: string; phone?: string; plan?: string; message?: string }) =>
    cfRequest<{ id: string }>("/public/signup-requests", { method: "POST", body: input }),

  listRfis: (projectId: string, orgId?: string) =>
    cfRequest<{ rfis: unknown[] }>(`/projects/${projectId}/rfi`, { orgId }),
  createRfi: (projectId: string, input: { no: string; subject: string; question: string; category?: string; dueDate?: string }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/rfi`, { method: "POST", orgId, body: input }),
  updateRfi: (projectId: string, rfiId: string, input: { status?: string; response?: string }, orgId?: string) =>
    cfRequest<{ updated: boolean }>(`/projects/${projectId}/rfi/${rfiId}`, { method: "PATCH", orgId, body: input }),

  listChangeOrders: (projectId: string, orgId?: string) =>
    cfRequest<{ changeOrders: unknown[] }>(`/projects/${projectId}/change-orders`, { orgId }),
  createChangeOrder: (projectId: string, input: { no: string; description: string; scopeChange?: string; costImpact?: number; scheduleImpact?: number; reason?: string }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/change-orders`, { method: "POST", orgId, body: input }),
  updateChangeOrderStatus: (projectId: string, coId: string, status: string, orgId?: string) =>
    cfRequest<{ updated: boolean }>(`/projects/${projectId}/change-orders/${coId}`, { method: "PATCH", orgId, body: { status } }),

  listRaBills: (projectId: string, orgId?: string) =>
    cfRequest<{ raBills: unknown[] }>(`/projects/${projectId}/ra-bills`, { orgId }),
  createRaBill: (projectId: string, input: { no: string; subcontractor?: string; scope?: string; billAmount: number; cumulative?: number; retentionPct?: number; billDate?: string }, orgId?: string) =>
    cfRequest<{ id: string }>(`/projects/${projectId}/ra-bills`, { method: "POST", orgId, body: input }),
  updateRaBillStatus: (projectId: string, billId: string, input: { status: string; paidAmount?: number }, orgId?: string) =>
    cfRequest<{ updated: boolean }>(`/projects/${projectId}/ra-bills/${billId}`, { method: "PATCH", orgId, body: input }),
};

