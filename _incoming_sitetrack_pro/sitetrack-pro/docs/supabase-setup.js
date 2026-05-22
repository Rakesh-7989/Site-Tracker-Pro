// ═══════════════════════════════════════════════════════════════
// SITETRACK — SUPABASE BACKEND SETUP
// Real database + auth + real-time + file storage
// ═══════════════════════════════════════════════════════════════

// ── STEP 1: Install ──────────────────────────────────────────────
// npm install @supabase/supabase-js

// ── STEP 2: Create supabase.js ───────────────────────────────────
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── STEP 3: SQL — Run in Supabase SQL Editor ─────────────────────
/*
-- USERS (extends Supabase auth.users)
create table profiles (
  id uuid references auth.users primary key,
  name text not null,
  role text check (role in ('architect','pm','client')) not null,
  avatar text,
  created_at timestamptz default now()
);

-- PROJECTS
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  location text,
  lat numeric,
  lng numeric,
  status text default 'active' check (status in ('active','completed','on_hold')),
  progress integer default 0 check (progress between 0 and 100),
  budget bigint default 0,
  start_date date,
  expected_end_date date,
  client_name text,
  client_email text,
  architect_id uuid references profiles(id),
  created_at timestamptz default now()
);

-- MILESTONES
create table milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  status text default 'pending' check (status in ('pending','in_progress','completed')),
  due_date date,
  completed_date date,
  sort_order integer default 0
);

-- SITE UPDATES
create table site_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  author_id uuid references profiles(id),
  notes text not null,
  weather text,
  workers_count integer,
  update_date date default current_date,
  created_at timestamptz default now()
);

-- UPDATE PHOTOS (Supabase Storage)
create table update_photos (
  id uuid primary key default gen_random_uuid(),
  update_id uuid references site_updates(id) on delete cascade,
  storage_path text not null,
  url text,
  created_at timestamptz default now()
);

-- EXPENSES
create table expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  category text not null,
  description text not null,
  amount bigint not null,
  expense_date date,
  added_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- ISSUES
create table issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  description text,
  severity text check (severity in ('high','medium','low')) default 'medium',
  status text check (status in ('open','resolved')) default 'open',
  reported_by uuid references profiles(id),
  resolved_by uuid references profiles(id),
  reported_date date default current_date,
  resolved_date date,
  created_at timestamptz default now()
);

-- TEAM MEMBERS
create table team_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  role text not null,
  phone text,
  status text default 'active' check (status in ('active','on_leave')),
  created_at timestamptz default now()
);

-- ATTENDANCE
create table attendance (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  member_id uuid references team_members(id) on delete cascade,
  attendance_date date default current_date,
  status text check (status in ('present','absent','half_day')) default 'absent',
  unique(project_id, member_id, attendance_date)
);

-- DRAWINGS / DOCUMENTS
create table drawings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  title text not null,
  type text not null,
  revision text default 'Rev A',
  notes text,
  status text default 'current' check (status in ('current','superseded')),
  released_to text[] default '{}',
  released_by uuid references profiles(id),
  release_date date default current_date,
  storage_path text,
  created_at timestamptz default now()
);

-- MATERIAL DELIVERIES
create table materials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  material text not null,
  quantity text,
  supplier text,
  delivery_date date,
  status text default 'expected' check (status in ('expected','received','rejected')),
  notes text,
  logged_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- MESSAGES (in-app chat)
create table messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  sender_id uuid references profiles(id),
  sender_name text,
  sender_role text,
  text text not null,
  created_at timestamptz default now()
);

-- ACTIVITY LOG
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  type text,
  action text,
  detail text,
  by_user_id uuid references profiles(id),
  by_name text,
  by_role text,
  created_at timestamptz default now()
);

-- NOTIFICATIONS
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  project_id uuid references projects(id),
  title text,
  message text,
  read boolean default false,
  created_at timestamptz default now()
);

-- ROW LEVEL SECURITY
alter table projects enable row level security;
alter table site_updates enable row level security;
alter table expenses enable row level security;
alter table messages enable row level security;

-- Architects see all projects
create policy "architects_all" on projects for all using (
  exists(select 1 from profiles where id = auth.uid() and role = 'architect')
);
-- PM sees their projects
create policy "pm_projects" on projects for select using (
  exists(select 1 from profiles where id = auth.uid() and role = 'pm')
);
-- Clients see only their projects
create policy "client_projects" on projects for select using (
  exists(select 1 from profiles p where p.id = auth.uid() and p.role = 'client' and projects.client_email = (
    select email from auth.users where id = auth.uid()
  ))
);
*/

// ── STEP 4: Auth Helpers ────────────────────────────────────────
export const authService = {
  async login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
    return { ...data.user, ...profile };
  },
  async logout() {
    await supabase.auth.signOut();
  },
  async getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    return { ...user, ...profile };
  },
};

// ── STEP 5: API Service ─────────────────────────────────────────
export const api = {
  // Projects
  async getProjects() {
    const { data, error } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async createProject(proj) {
    const { data, error } = await supabase.from('projects').insert(proj).select().single();
    if (error) throw error;
    return data;
  },
  async updateProgress(projectId, progress) {
    const { error } = await supabase.from('projects').update({ progress }).eq('id', projectId);
    if (error) throw error;
  },

  // Site Updates
  async getUpdates(projectId) {
    const { data, error } = await supabase.from('site_updates').select('*, update_photos(*)').eq('project_id', projectId).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async addUpdate(update, photos = []) {
    const { data, error } = await supabase.from('site_updates').insert(update).select().single();
    if (error) throw error;
    // Upload photos to Supabase Storage
    for (const photo of photos) {
      const path = `updates/${data.id}/${Date.now()}.jpg`;
      await supabase.storage.from('site-photos').upload(path, photo.blob);
      const { data: urlData } = supabase.storage.from('site-photos').getPublicUrl(path);
      await supabase.from('update_photos').insert({ update_id: data.id, storage_path: path, url: urlData.publicUrl });
    }
    return data;
  },

  // Milestones
  async getMilestones(projectId) {
    const { data, error } = await supabase.from('milestones').select('*').eq('project_id', projectId).order('sort_order');
    if (error) throw error;
    return data;
  },
  async updateMilestone(id, updates) {
    const { error } = await supabase.from('milestones').update(updates).eq('id', id);
    if (error) throw error;
  },

  // Issues
  async getIssues(projectId) {
    const { data, error } = await supabase.from('issues').select('*, profiles(name)').eq('project_id', projectId).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async reportIssue(issue) {
    const { data, error } = await supabase.from('issues').insert(issue).select().single();
    if (error) throw error;
    return data;
  },
  async resolveIssue(id) {
    const { error } = await supabase.from('issues').update({ status: 'resolved', resolved_date: new Date().toISOString().split('T')[0] }).eq('id', id);
    if (error) throw error;
  },

  // Expenses
  async getExpenses(projectId) {
    const { data, error } = await supabase.from('expenses').select('*').eq('project_id', projectId).order('expense_date', { ascending: false });
    if (error) throw error;
    return data;
  },
  async addExpense(expense) {
    const { data, error } = await supabase.from('expenses').insert(expense).select().single();
    if (error) throw error;
    return data;
  },

  // Materials
  async getMaterials(projectId) {
    const { data, error } = await supabase.from('materials').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  },
  async addMaterial(material) {
    const { data, error } = await supabase.from('materials').insert(material).select().single();
    if (error) throw error;
    return data;
  },
  async markMaterialReceived(id) {
    const { error } = await supabase.from('materials').update({ status: 'received' }).eq('id', id);
    if (error) throw error;
  },

  // Drawings
  async getDrawings(projectId, role) {
    let query = supabase.from('drawings').select('*').eq('project_id', projectId);
    if (role !== 'architect') query = query.contains('released_to', [role]);
    const { data, error } = await query.order('release_date', { ascending: false });
    if (error) throw error;
    return data;
  },
  async releaseDrawing(drawing) {
    const { data, error } = await supabase.from('drawings').insert(drawing).select().single();
    if (error) throw error;
    return data;
  },

  // Messages (Real-time)
  async getMessages(projectId) {
    const { data, error } = await supabase.from('messages').select('*').eq('project_id', projectId).order('created_at');
    if (error) throw error;
    return data;
  },
  async sendMessage(message) {
    const { data, error } = await supabase.from('messages').insert(message).select().single();
    if (error) throw error;
    return data;
  },
  subscribeMessages(projectId, callback) {
    return supabase.channel(`messages:${projectId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `project_id=eq.${projectId}` }, payload => callback(payload.new))
      .subscribe();
  },

  // Attendance
  async getAttendance(projectId, date) {
    const { data, error } = await supabase.from('attendance').select('*').eq('project_id', projectId).eq('attendance_date', date);
    if (error) throw error;
    return data;
  },
  async markAttendance(projectId, memberId, date, status) {
    const { error } = await supabase.from('attendance').upsert({ project_id: projectId, member_id: memberId, attendance_date: date, status }, { onConflict: 'project_id,member_id,attendance_date' });
    if (error) throw error;
  },

  // Activity Log
  async logActivity(log) {
    await supabase.from('activity_log').insert(log);
  },
  async getActivity() {
    const { data, error } = await supabase.from('activity_log').select('*, projects(name)').order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return data;
  },
};

// ── STEP 6: Real-time Subscriptions ────────────────────────────
// Add to your App component:
/*
useEffect(() => {
  if (!selectedProject) return;
  const sub = api.subscribeMessages(selectedProject, (newMsg) => {
    setMessages(prev => ({ ...prev, [selectedProject]: [...(prev[selectedProject] || []), newMsg] }));
  });
  return () => supabase.removeChannel(sub);
}, [selectedProject]);
*/

// ── STEP 7: Push Notifications (Web Push) ──────────────────────
/*
1. Get VAPID keys: npx web-push generate-vapid-keys
2. Save to Supabase Edge Function environment
3. Subscribe user:

async function subscribePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: 'YOUR_VAPID_PUBLIC_KEY'
  });
  // Save sub to Supabase
  await supabase.from('push_subscriptions').upsert({ user_id: user.id, subscription: JSON.stringify(sub) });
}

4. Send from Supabase Edge Function:
import webpush from 'npm:web-push';
webpush.setVapidDetails('mailto:you@buildco.in', PUBLIC_KEY, PRIVATE_KEY);
await webpush.sendNotification(subscription, JSON.stringify({
  title: 'SiteTrack Update',
  body: 'New site activity on Skyline Tower',
  url: '/projects/p1'
}));
*/

// ── Quick Start ─────────────────────────────────────────────────
/*
1. Go to https://supabase.com → Create free project
2. Run the SQL schema above in SQL Editor
3. Enable Auth → Email provider
4. Copy Project URL + Anon Key → paste in SUPABASE_URL/SUPABASE_ANON_KEY above
5. Replace useState() calls in App with api.getXxx() calls
6. Done! Real database with auth, real-time, and file storage
*/
