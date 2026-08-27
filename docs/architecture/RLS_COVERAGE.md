# RLS Coverage Matrix — auto-generated

> Generated 2026-08-20T07:34:06.881Z by `node scripts/ci/rls-coverage.mjs` (Phase 0 / 0.8 — SEC-02 + DB-05; Phase 1.1 — RBAC V2 shadow).
> **Do not edit by hand.** Regenerate with `npm run check:rls:coverage`.

## Summary

- Public tables: **150**
- RLS enabled (or allowlisted infra): **150 / 150** (100%)
- Tables exposing authenticated/anon DML without RLS: **0** ✅
- Policies: **421** (SELECT 177 / INSERT 66 / UPDATE 56 / DELETE 36 / ALL 86)
- Permissive-ALL write policies: **86**
- Policies referencing a RBAC V2 shadow gate (Policy-Core): **19** across **5** tables
- Capabilities in app catalog: **119**
- Capability tokens in the RLS map: **26**
- Drift (RLS-map tokens missing from capabilities.ts): **0** ✅

## Matrix

| Table | RLS | S | I | U | D | ALL | Perm-ALL | Helper gates | V2 gates | Auth DML | Anon DML |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| activity_log | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | SELECT | — |
| approval_chains | ✅ | 2 | 0 | 0 | 0 | 2 | 2 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| attachments | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | — | — |
| attendance | ✅ | 2 | 1 | 1 | 0 | 1 | 1 | 5 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| audit_anchors | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 1 | 0 | — | — |
| audit_log_v2 | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | SELECT | — |
| authorization_audit | ✅ | 1 | 1 | 0 | 0 | 0 | 0 | 1 | 0 | INSERT,SELECT | — |
| billing_history | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | — | — |
| blocks | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| boq_items | ✅ | 2 | 0 | 0 | 0 | 2 | 2 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| branding | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| budget_changes | ✅ | 1 | 1 | 1 | 0 | 0 | 0 | 3 | 0 | INSERT,SELECT,UPDATE | — |
| buildings | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| buildnow_anchors | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | — | — |
| cashfree_events | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | — | — |
| change_orders | ✅ | 2 | 0 | 0 | 0 | 2 | 2 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| checklist_items | ✅ | 2 | 0 | 0 | 0 | 2 | 2 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| client_portal_permissions | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| collection_documents | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 4 | DELETE,INSERT,SELECT | — |
| comments | ✅ | 1 | 1 | 1 | 0 | 0 | 0 | 3 | 0 | — | — |
| compliance | ✅ | 2 | 0 | 0 | 0 | 2 | 2 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| consultancy_reports | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| corrective_actions | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| cost_forecasts | ✅ | 1 | 1 | 1 | 0 | 0 | 0 | 3 | 0 | INSERT,SELECT,UPDATE | — |
| daily_snapshots | ✅ | 1 | 1 | 0 | 0 | 0 | 0 | 2 | 0 | — | — |
| delegations | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| deliverables | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| design_workflow | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| diary | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | — | — |
| digest_dispatches | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | SELECT | — |
| digest_subscriptions | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| download_events | ✅ | 1 | 1 | 0 | 0 | 0 | 0 | 2 | 0 | INSERT,SELECT | — |
| dpr_delivery_log | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | SELECT | — |
| dpr_messages | ✅ | 1 | 1 | 1 | 0 | 0 | 0 | 3 | 0 | INSERT,SELECT,UPDATE | — |
| drawing_comments | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| drawings | ✅ | 3 | 1 | 1 | 0 | 1 | 1 | 6 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| equipment | ✅ | 2 | 0 | 0 | 0 | 2 | 2 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| estimate | ✅ | 2 | 0 | 0 | 0 | 2 | 2 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| event_outbox | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | SELECT | — |
| expenses | ✅ | 2 | 1 | 0 | 0 | 0 | 0 | 3 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| external_inspectors | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| fee_phases | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| ffe_entries | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| floors | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| forecast | ✅ | 1 | 1 | 0 | 0 | 0 | 0 | 2 | 0 | — | — |
| handover_signatures | ✅ | 1 | 1 | 0 | 0 | 0 | 0 | 2 | 0 | INSERT,SELECT | — |
| inspection_checklists | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| inspection_results | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| inspections | ✅ | 2 | 0 | 0 | 0 | 2 | 2 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| interior_rooms | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| inventory_transactions | ✅ | 2 | 0 | 0 | 0 | 2 | 2 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| invoice_lines | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| invoices | ✅ | 3 | 1 | 1 | 0 | 1 | 1 | 5 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| issues | ✅ | 2 | 1 | 1 | 0 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| labour_register | ✅ | 2 | 1 | 1 | 1 | 1 | 1 | 6 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| lead_agreements | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| lead_meetings | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| lead_quotations | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| leads | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 4 | DELETE,INSERT,SELECT,UPDATE | — |
| material_prices | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| material_requests | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| materials | ✅ | 2 | 1 | 1 | 1 | 0 | 0 | 5 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| measurement_book | ✅ | 1 | 1 | 1 | 0 | 0 | 0 | 3 | 0 | INSERT,SELECT,UPDATE | — |
| messages | ✅ | 2 | 2 | 0 | 0 | 0 | 0 | 4 | 0 | INSERT,SELECT | — |
| milestones | ✅ | 2 | 1 | 1 | 1 | 1 | 1 | 6 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| mood_boards | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| notification_rules | ✅ | 2 | 0 | 0 | 0 | 2 | 2 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| notification_templates | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 1 | 0 | SELECT | — |
| notifications | ✅ | 1 | 1 | 1 | 0 | 0 | 0 | 2 | 0 | SELECT,UPDATE | — |
| notify_config | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | — |
| ops_toggles | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| org_feature_flags | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| org_integrations | ✅ | 1 | 0 | 0 | 0 | 2 | 2 | 3 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| org_invitations | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | — | — |
| org_member_roles | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| org_members | ✅ | 1 | 0 | 0 | 0 | 3 | 3 | 3 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| org_rbac_settings | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| org_role_capabilities | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| org_roles | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| organizations | ✅ | 2 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | SELECT | — |
| payment_events | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | SELECT | — |
| payments | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| permits | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| plan_upgrade_requests | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | SELECT | — |
| plans | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 1 | 0 | SELECT | SELECT |
| platform_feature_flags | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 1 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| platform_settings | ✅ | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | — |
| po_receipts | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| procurement_quotes | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 3 | DELETE,INSERT,SELECT,UPDATE | — |
| profiles | ✅ | 2 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | SELECT,UPDATE | — |
| project_access_requests | ✅ | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | INSERT,SELECT,UPDATE | — |
| project_members | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 1 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| projects | ✅ | 1 | 2 | 2 | 0 | 0 | 0 | 5 | 0 | INSERT,SELECT,UPDATE | — |
| punch | ✅ | 2 | 0 | 0 | 0 | 2 | 2 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| purchase_orders | ✅ | 3 | 1 | 1 | 0 | 1 | 1 | 6 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| ra_bills | ✅ | 2 | 1 | 0 | 0 | 1 | 1 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| rate_cards | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| rbac_capabilities | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | SELECT | — |
| rbac_profile_assignments | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| rbac_profile_bindings | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| rbac_role_profiles | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| research_collections | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 4 | DELETE,INSERT,SELECT,UPDATE | — |
| research_documents | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 4 | DELETE,INSERT,SELECT,UPDATE | — |
| resend_delivery_events | ✅ | 1 | 1 | 0 | 0 | 0 | 0 | 1 | 0 | SELECT | — |
| resource_acl_entries | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| retainers | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| review_rounds | ✅ | 1 | 1 | 1 | 0 | 0 | 0 | 3 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| rfi | ✅ | 2 | 0 | 0 | 0 | 2 | 2 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| role_capability_overrides | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| room_installations | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| rooms | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| safety | ✅ | 2 | 0 | 0 | 0 | 2 | 2 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| schema_migrations | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | — |
| share_links | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| share_tokens | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | — | — |
| shift_roster | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| signup_attempts | ✅ | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | — |
| signup_requests | ✅ | 1 | 0 | 1 | 0 | 0 | 0 | 1 | 0 | SELECT,UPDATE | — |
| site_track_migrations | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | — |
| site_updates | ✅ | 2 | 1 | 1 | 1 | 0 | 0 | 5 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| sites | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| spatial_floors | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| spatial_ref_sys | — | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | — |
| staff_area_grants | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | SELECT | — |
| staff_invites | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| staff_only_features | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | — | — |
| statutory_approvals | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| sub_contractors | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 0 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| submittals | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| subscriptions | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | — | — |
| tasks | ✅ | 2 | 0 | 0 | 0 | 3 | 3 | 5 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| teams | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | — | — |
| templates | ✅ | 2 | 0 | 0 | 0 | 2 | 2 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| time_entries | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| units | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| usage_metrics | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | — | — |
| user_project_locations | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| vendor_performance | ✅ | 1 | 1 | 1 | 0 | 0 | 0 | 3 | 0 | INSERT,SELECT,UPDATE | — |
| vendor_profiles | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | SELECT | — |
| vendor_project_scopes | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| vendors | ✅ | 1 | 0 | 0 | 0 | 1 | 1 | 2 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| voice_transcripts | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | — |
| whatsapp_log | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | — | — |
| whatsapp_quota_counter | ✅ | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | — | — |
| wip_aging | ✅ | 1 | 1 | 1 | 0 | 0 | 0 | 3 | 0 | INSERT,SELECT,UPDATE | — |
| workflow_definitions | ✅ | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | SELECT | — |
| workflow_instances | ✅ | 1 | 1 | 1 | 0 | 0 | 0 | 3 | 0 | INSERT,SELECT,UPDATE | — |
| workflow_transitions | ✅ | 1 | 1 | 0 | 0 | 0 | 0 | 2 | 0 | INSERT,SELECT | — |
| worklogs | ✅ | 2 | 1 | 1 | 0 | 1 | 1 | 5 | 0 | DELETE,INSERT,SELECT,UPDATE | — |
| zones | ✅ | 1 | 1 | 1 | 1 | 0 | 0 | 4 | 0 | DELETE,INSERT,SELECT,UPDATE | — |

Legend: RLS ✅ = `enable row level security` present · Perm-ALL = number of `PERMISSIVE ... FOR ALL` policies (a broad write surface) · Helper gates = policies whose USING/WITH CHECK references a canonical gate helper · V2 gates = policies referencing `v2_policy_check`/`v2_check_access` (RBAC V2 shadow adoption, Phase 1.1) · Auth/Anon DML = DML grants to that role.