-- SiteTrack Pro — Story 1: public approve/reject via share link (anon, one-tap).
-- Allows a promoter who opens /share-link/:token to approve or reject a
-- pending drawing with a captured signature, without logging in.
-- Reuses the same gate as share_project_payload (revoked/expiry/max_views,
-- password via crypt(), single-use OTP, views++) so the link's existing
-- protections stay the single source of truth. The RPC is SECURITY DEFINER
-- and is the ONLY anon write path to drawings.approval_status.
--
-- Decision ladder (same as DrawingReviewTab):
--   pending/not_requested/rejected → approved (with signature) or rejected
--   locked / already-approved/rejected are terminal and return an error
-- so a replay cannot flip an approved drawing back.

BEGIN;

create or replace function public.approve_via_share_link(
  p_token         text,
  p_password      text default null,
  p_otp           text default null,
  p_drawing_id    uuid default null,
  p_decision      text default null,
  p_signature     text default null,
  p_approver_name text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  l public.share_links%rowtype;
  d public.drawings%rowtype;
  v_decision text;
begin
  if p_drawing_id is null then
    return jsonb_build_object('ok', false, 'error', 'drawing-required');
  end if;

  v_decision := lower(coalesce(p_decision, ''));
  if v_decision not in ('approved', 'rejected') then
    return jsonb_build_object('ok', false, 'error', 'invalid-decision');
  end if;

  select * into l from public.share_links where token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid-link');
  end if;
  if l.revoked_at is not null then
    return jsonb_build_object('ok', false, 'error', 'revoked');
  end if;
  if l.expires_at is not null and l.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  if l.max_views is not null and l.views >= l.max_views then
    return jsonb_build_object('ok', false, 'error', 'exhausted');
  end if;
  if l.password_hash is not null then
    if p_password is null or p_password = '' or crypt(p_password, l.password_hash) <> l.password_hash then
      return jsonb_build_object('ok', false, 'error', 'bad-password');
    end if;
  end if;
  -- OTP is single-use; consume it when it matches and is still valid.
  if l.otp is not null and l.otp_expires_at is not null and l.otp_expires_at > now() then
    if p_otp is null or p_otp = '' or l.otp <> p_otp then
      return jsonb_build_object('ok', false, 'error', 'bad-otp');
    end if;
    update public.share_links set otp = null, otp_expires_at = null where id = l.id;
  end if;

  select * into d from public.drawings where id = p_drawing_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'drawing-not-found');
  end if;
  if d.project_id <> l.project_id then
    return jsonb_build_object('ok', false, 'error', 'drawing-not-in-project');
  end if;
  -- Only current drawings that were released to the client are share-visible;
  -- keep the same gate for approve so a stale link cannot flip an unreleased rev.
  if d.status <> 'current' or not ('client' = any(d.released_to)) then
    return jsonb_build_object('ok', false, 'error', 'drawing-not-released');
  end if;

  if d.approval_status = 'locked' then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  if d.approval_status = v_decision then
    return jsonb_build_object('ok', false, 'error', 'already-' || v_decision);
  end if;
  -- Only pending/not_requested/rejected may move to approved/rejected via share link.
  -- Approved may only go to locked (host-only), so disallow approved→rejected via anon.
  if d.approval_status = 'approved' and v_decision = 'rejected' then
    return jsonb_build_object('ok', false, 'error', 'cannot-reject-approved');
  end if;
  if d.approval_status not in ('pending','not_requested','rejected','approved') then
    return jsonb_build_object('ok', false, 'error', 'invalid-current-status');
  end if;
  -- Pending is the normal pre-condition; allow not_requested/rejected as well so
  -- a promoter who never had "Request review" pressed can still one-tap approve
  -- from the share link. The host's explicit request step is optional for anon.
  if d.approval_status not in ('pending','not_requested','rejected') and v_decision = 'approved' then
    return jsonb_build_object('ok', false, 'error', 'not-pending');
  end if;

  if v_decision = 'approved' and (p_signature is null or length(trim(p_signature)) = 0) then
    -- Typed-name fallback is allowed, but at least something must be present
    -- so the approval is auditable. The UI always sends a data URL or typed name.
    return jsonb_build_object('ok', false, 'error', 'signature-required');
  end if;

  if v_decision = 'approved' then
    update public.drawings
       set approval_status = 'approved',
           approved_at = now(),
           approved_by = null,
           signature = p_signature,
           -- keep a human-readable approver hint in change_note when provided
           change_note = case when p_approver_name is not null and trim(p_approver_name) <> ''
                              then coalesce(change_note,'') || case when change_note is not null and change_note <> '' then E'\n' else '' end || 'Approved via share link by ' || trim(p_approver_name)
                              else change_note end
     where id = d.id;
  else
    update public.drawings
       set approval_status = 'rejected',
           approved_at = now(),
           approved_by = null,
           signature = null
     where id = d.id;
  end if;

  update public.share_links set views = views + 1 where id = l.id;

  -- Best-effort audit: a host can see this in audit_log_v2 via project_id
  begin
    insert into public.audit_log_v2 (org_id, project_id, actor_id, action, resource, resource_id, message, after)
    values (
      (select org_id from public.projects where id = l.project_id),
      l.project_id,
      null,
      'UPDATE',
      'drawings',
      d.id,
      'Share-link ' || v_decision || ' by ' || coalesce(trim(p_approver_name), 'client'),
      jsonb_build_object('approval_status', v_decision, 'via', 'share_link', 'token', left(p_token, 8) || '…')
    );
  exception when others then null; end;

  return jsonb_build_object('ok', true, 'drawing_id', d.id, 'new_status', v_decision);
end;
$$;

grant execute on function public.approve_via_share_link(text, text, text, uuid, text, text, text) to anon, authenticated;
revoke all on function public.approve_via_share_link(text, text, text, uuid, text, text, text) from public;

DO $$ BEGIN RAISE NOTICE '250_approve_via_share_link: anon approve/reject via share link live'; END $$;

COMMIT;
