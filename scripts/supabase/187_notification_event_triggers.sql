-- SiteTrack Pro — B4b: Notification Event Triggers.
-- Creates notifications for drawing comments, approval status changes,
-- revision chain events, share link access, and other key actions.
-- These feed the delivery pipeline (notify-deliver EF).

BEGIN;

-- 1. Drawing comment notification trigger
CREATE OR REPLACE FUNCTION public.notify_drawing_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_org_id uuid;
  v_recipients uuid[];
  v_user_id uuid;
  v_drawing_title text;
  v_comment_body text;
  v_parent_comment uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Get drawing info
    SELECT d.project_id, d.title, p.org_id
    INTO v_project_id, v_drawing_title, v_org_id
    FROM public.drawings d
    JOIN public.projects p ON p.id = d.project_id
    WHERE d.id = NEW.drawing_id;

    IF NOT FOUND THEN RETURN NEW; END IF;

    -- Get recipients: project members (pm/project_admin/design_head/consultant_head/orgadmin)
    -- + drawing author (if different) + parent comment author (if reply)
    SELECT array_agg(DISTINCT om.profile_id)
    INTO v_recipients
    FROM public.org_members om
    JOIN public.project_members pm ON pm.profile_id = om.profile_id
    WHERE om.org_id = v_org_id
      AND pm.project_id = v_project_id
      AND om.status = 'active'
      AND (om.role IN ('orgadmin', 'pm', 'project_admin', 'project_head', 'design_head', 'consultant_head')
           OR pm.role IN ('pm', 'project_admin', 'design_head', 'consultant_head', 'superadmin'));

    -- Add drawing author
    SELECT array_append(v_recipients, d.author_id) INTO v_recipients
    FROM public.drawings d WHERE d.id = NEW.drawing_id AND d.author_id IS NOT NULL;

    -- Add parent comment author (if reply)
    IF NEW.parent_id IS NOT NULL THEN
      SELECT array_append(v_recipients, c.author_id) INTO v_recipients
      FROM public.drawing_comments c WHERE c.id = NEW.parent_id AND c.author_id IS NOT NULL;
    END IF;

    -- Insert notification for each recipient (exclude the comment author themselves)
    v_comment_body := LEFT(NEW.body, 200);
    FOREACH v_user_id IN ARRAY v_recipients LOOP
      IF v_user_id <> NEW.author_id THEN
        PERFORM public.create_payment_notification(
          v_user_id,
          v_project_id,
          v_org_id,
          'drawing_comment',
          'New comment on drawing: ' || v_drawing_title,
          v_comment_body,
          '/projects/' || v_project_id || '/drawings/' || NEW.drawing_id
        );
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_drawing_comment_notify ON public.drawing_comments;
CREATE TRIGGER trg_drawing_comment_notify
AFTER INSERT ON public.drawing_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_drawing_comment();

GRANT EXECUTE ON FUNCTION public.notify_drawing_comment() TO authenticated;

-- 2. Drawing approval status change notification
CREATE OR REPLACE FUNCTION public.notify_drawing_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_recipients uuid[];
  v_user_id uuid;
  v_status_text text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.approval_status IS DISTINCT FROM NEW.approval_status THEN
    -- Get project + org
    SELECT p.org_id
    INTO v_org_id
    FROM public.projects p
    JOIN public.drawings d ON d.project_id = p.id
    WHERE d.id = NEW.id;

    IF NOT FOUND THEN RETURN NEW; END IF;

    -- Recipients: org admins + project managers + drawing author
    SELECT array_agg(DISTINCT om.profile_id)
    INTO v_recipients
    FROM public.org_members om
    JOIN public.project_members pm ON pm.profile_id = om.profile_id
    WHERE om.org_id = v_org_id
      AND pm.project_id = NEW.project_id
      AND om.status = 'active'
      AND (om.role IN ('orgadmin', 'pm', 'project_admin', 'project_head')
           OR pm.role IN ('pm', 'project_admin', 'project_head', 'superadmin'));

    -- Add drawing author
    IF NEW.author_id IS NOT NULL THEN
      v_recipients := array_append(v_recipients, NEW.author_id);
    END IF;

    v_status_text := CASE NEW.approval_status
      WHEN 'approved' THEN 'approved'
      WHEN 'rejected' THEN 'rejected'
      WHEN 'locked' THEN 'locked (final)'
      WHEN 'pending' THEN 'submitted for approval'
      ELSE NEW.approval_status
    END;

    FOREACH v_user_id IN ARRAY v_recipients LOOP
      IF v_user_id <> (SELECT author_id FROM public.drawings WHERE id = NEW.id) THEN
        PERFORM public.create_payment_notification(
          v_user_id,
          NEW.project_id,
          v_org_id,
          'drawing_approval',
          'Drawing ' || v_status_text || ': ' || NEW.title,
          'Drawing "' || NEW.title || '" has been ' || v_status_text || '.',
          '/projects/' || NEW.project_id || '/drawings/' || NEW.id
        );
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_drawing_approval_notify ON public.drawings;
CREATE TRIGGER trg_drawing_approval_notify
AFTER UPDATE ON public.drawings
FOR EACH ROW EXECUTE FUNCTION public.notify_drawing_approval();

GRANT EXECUTE ON FUNCTION public.notify_drawing_approval() TO authenticated;

-- 3. Share link access notification (when link is validated/used)
CREATE OR REPLACE FUNCTION public.notify_share_link_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_recipients uuid[];
  v_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Get org from project
    SELECT p.org_id INTO v_org_id FROM public.projects p WHERE p.id = NEW.project_id;
    IF NOT FOUND THEN RETURN NEW; END IF;

    -- Notify org admins + project managers
    SELECT array_agg(DISTINCT om.profile_id)
    INTO v_recipients
    FROM public.org_members om
    JOIN public.project_members pm ON pm.profile_id = om.profile_id
    WHERE om.org_id = v_org_id
      AND pm.project_id = NEW.project_id
      AND om.status = 'active'
      AND (om.role IN ('orgadmin', 'pm', 'project_admin', 'project_head')
           OR pm.role IN ('pm', 'project_admin', 'project_head', 'superadmin'));

    FOREACH v_user_id IN ARRAY v_recipients LOOP
      PERFORM public.create_payment_notification(
        v_user_id,
        NEW.project_id,
        v_org_id,
        'share_link_access',
        'Share link accessed: ' || NEW.label,
        'Someone accessed the share link "' || NEW.label || '" for this project.',
        '/projects/' || NEW.project_id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_share_link_access_notify ON public.share_links;
CREATE TRIGGER trg_share_link_access_notify
AFTER INSERT ON public.share_links
FOR EACH ROW EXECUTE FUNCTION public.notify_share_link_access();

GRANT EXECUTE ON FUNCTION public.notify_share_link_access() TO authenticated;

-- 4. Revision chain notification (new revision created)
CREATE OR REPLACE FUNCTION public.notify_drawing_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_recipients uuid[];
  v_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    -- Get org from parent drawing's project
    SELECT p.org_id INTO v_org_id
    FROM public.projects p
    JOIN public.drawings d ON d.project_id = p.id
    WHERE d.id = NEW.parent_id;

    IF NOT FOUND THEN RETURN NEW; END IF;

    -- Notify org admins + project managers + parent drawing author
    SELECT array_agg(DISTINCT om.profile_id)
    INTO v_recipients
    FROM public.org_members om
    JOIN public.project_members pm ON pm.profile_id = om.profile_id
    WHERE om.org_id = v_org_id
      AND pm.project_id = NEW.project_id
      AND om.status = 'active'
      AND (om.role IN ('orgadmin', 'pm', 'project_admin', 'project_head', 'design_head', 'consultant_head')
           OR pm.role IN ('pm', 'project_admin', 'design_head', 'consultant_head', 'superadmin'));

    -- Add parent drawing author
    SELECT array_append(v_recipients, d.author_id) INTO v_recipients
    FROM public.drawings d WHERE d.id = NEW.parent_id AND d.author_id IS NOT NULL;

    FOREACH v_user_id IN ARRAY v_recipients LOOP
      IF v_user_id <> NEW.author_id THEN
        PERFORM public.create_payment_notification(
          v_user_id,
          NEW.project_id,
          v_org_id,
          'drawing_revision',
          'New revision: ' || NEW.title,
          'A new revision "' || NEW.title || '" was created based on the previous version.',
          '/projects/' || NEW.project_id || '/drawings/' || NEW.id
        );
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_drawing_revision_notify ON public.drawings;
CREATE TRIGGER trg_drawing_revision_notify
AFTER INSERT ON public.drawings
FOR EACH ROW EXECUTE FUNCTION public.notify_drawing_revision();

GRANT EXECUTE ON FUNCTION public.notify_drawing_revision() TO authenticated;

-- 5. Handover signature notification
CREATE OR REPLACE FUNCTION public.notify_handover_signature()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipients uuid[];
  v_user_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT array_agg(DISTINCT om.profile_id)
    INTO v_recipients
    FROM public.org_members om
    JOIN public.project_members pm ON pm.profile_id = om.profile_id
    WHERE om.org_id = NEW.org_id
      AND pm.project_id = NEW.project_id
      AND om.status = 'active'
      AND (om.role IN ('orgadmin', 'pm', 'project_admin', 'project_head')
           OR pm.role IN ('pm', 'project_admin', 'project_head', 'superadmin'));

    FOREACH v_user_id IN ARRAY v_recipients LOOP
      IF v_user_id <> NEW.signed_by THEN
        PERFORM public.create_payment_notification(
          v_user_id,
          NEW.project_id,
          NEW.org_id,
          'handover_signature',
          'Handover signed: ' || (SELECT name FROM public.projects WHERE id = NEW.project_id),
          'Handover document signed by ' || (SELECT name FROM public.profiles WHERE id = NEW.signed_by) || '.',
          '/projects/' || NEW.project_id || '/handover'
        );
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_handover_signature_notify ON public.handover_signatures;
CREATE TRIGGER trg_handover_signature_notify
AFTER INSERT ON public.handover_signatures
FOR EACH ROW EXECUTE FUNCTION public.notify_handover_signature();

GRANT EXECUTE ON FUNCTION public.notify_handover_signature() TO authenticated;

-- Verification
DO $$ DECLARE c int; BEGIN
  SELECT count(*) INTO c FROM information_schema.triggers WHERE trigger_name LIKE 'trg_%notify';
  RAISE NOTICE '187_notification_event_triggers: % notification triggers created', c;
END $$;

COMMIT;