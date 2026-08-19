-- SiteTrack Pro — SEC-04 cross-tenant test findings (migration 222).
--
-- The SEC-04 attack matrix (`scripts/test-cross-tenant-rls.mjs`) flagged
-- CT-002 failures ("org A admin CAN read org B row") on:
--   - digest_dispatches      (56)  — broken always-true subquery pattern
--   - org_rbac_settings      (203) — FOR SELECT USING (true)
--   - rbac_profile_assignments (205) — FOR SELECT USING (true)
--   - vendor_project_scopes  (204) — FOR SELECT USING (true)
--
-- Root causes:
-- 1. digest_subscriptions/digest_dispatches used
--      org_id = (select org_id from profiles where id = auth.uid())
--    but profiles has NO org_id column; inside a policy the unqualified
--    `org_id` correlates to the OUTER table → always TRUE (same bug as 221).
-- 2. The RBAC V2 catalog/mgmt tables opened reads to any authenticated with
--    FOR SELECT USING (true). They carry org_id (org-scoped rows), so every
--    logged-in user could enumerate another org's RBAC mode, profile
--    assignments, vendor scopes, ACL entries and client permissions.
--
-- Same-class latent leaks fixed here too (seed-skipped in the matrix but real
-- production leaks):
--   - rbac_role_profiles.rbac_profiles_read  (203) — USING (true)
--   - rbac_profile_bindings.rbac_bindings_read (203) — USING (true)
--   - resource_acl_entries.rbac_acl_read     (204) — USING (true)
--   - client_portal_permissions.client_perms_read (204) — USING (true)
--   - buildnow_anchors.buildnow_anchors_read (52) — broken subquery pattern
--
-- Fix: scope reads with the standard org-membership helper user_org_ids()
-- (active memberships only, per migration 173), keeping the superadmin
-- bypass. For the RBAC catalog tables, platform system rows (org_id IS NULL)
-- stay readable by all authenticated (they are shared metadata — same as
-- rbac_capabilities); org-created rows become org-scoped.
-- Idempotent drop-and-recreate of the affected policies.

BEGIN;

-- ── 1. Digest (56) ─────────────────────────────────────────────────────────
drop policy if exists digest_subs_read on public.digest_subscriptions;
create policy digest_subs_read on public.digest_subscriptions
  for select to authenticated
  using (
    org_id = any(public.user_org_ids())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
  );

drop policy if exists digest_subs_write on public.digest_subscriptions;
create policy digest_subs_write on public.digest_subscriptions
  for all to authenticated
  using (
    org_id = any(public.user_org_ids())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
  )
  with check (
    org_id = any(public.user_org_ids())
  );

drop policy if exists digest_dispatch_read on public.digest_dispatches;
create policy digest_dispatch_read on public.digest_dispatches
  for select to authenticated
  using (
    exists (
      select 1 from public.digest_subscriptions s
      where s.id = digest_dispatches.subscription_id
        and s.org_id = any(public.user_org_ids())
    )
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
  );

-- ── 2. RBAC V2 catalog (203) ────────────────────────────────────────────────
-- rbac_capabilities intentionally left USING (true): platform-wide catalog
-- with no org_id (shared metadata, read-only).

drop policy if exists rbac_profiles_read on public.rbac_role_profiles;
create policy rbac_profiles_read on public.rbac_role_profiles
  for select to authenticated
  using (
    org_id is null
    or org_id = any(public.user_org_ids())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
  );

drop policy if exists rbac_bindings_read on public.rbac_profile_bindings;
create policy rbac_bindings_read on public.rbac_profile_bindings
  for select to authenticated
  using (
    exists (
      select 1 from public.rbac_role_profiles p
      where p.id = rbac_profile_bindings.profile_id
        and (p.org_id is null or p.org_id = any(public.user_org_ids()))
    )
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
  );

drop policy if exists org_rbac_settings_read on public.org_rbac_settings;
create policy org_rbac_settings_read on public.org_rbac_settings
  for select to authenticated
  using (
    org_id = any(public.user_org_ids())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
  );

-- ── 3. RBAC V2 resource ACL (204) ───────────────────────────────────────────
drop policy if exists rbac_acl_read on public.resource_acl_entries;
create policy rbac_acl_read on public.resource_acl_entries
  for select to authenticated
  using (
    org_id = any(public.user_org_ids())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
  );

drop policy if exists client_perms_read on public.client_portal_permissions;
create policy client_perms_read on public.client_portal_permissions
  for select to authenticated
  using (
    org_id = any(public.user_org_ids())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
  );

drop policy if exists vendor_scopes_read on public.vendor_project_scopes;
create policy vendor_scopes_read on public.vendor_project_scopes
  for select to authenticated
  using (
    org_id = any(public.user_org_ids())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
  );

-- ── 4. RBAC V2 assignments (205) ────────────────────────────────────────────
drop policy if exists rbac_assignments_read on public.rbac_profile_assignments;
create policy rbac_assignments_read on public.rbac_profile_assignments
  for select to authenticated
  using (
    org_id = any(public.user_org_ids())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
  );

-- ── 5. BuildNow anchors (52) — project-scoped via the project's org ─────────
drop policy if exists buildnow_anchors_read on public.buildnow_anchors;
create policy buildnow_anchors_read on public.buildnow_anchors
  for select to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = buildnow_anchors.project_id
        and p.org_id = any(public.user_org_ids())
    )
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'superadmin')
  );

COMMIT;
