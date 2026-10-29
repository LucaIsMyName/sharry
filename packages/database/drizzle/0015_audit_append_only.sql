CREATE OR REPLACE FUNCTION audit_logs_reject_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- ON DELETE SET NULL clears actor_user_id and leaves the rest of the row alone.
  IF TG_OP = 'UPDATE'
     AND OLD.actor_user_id IS NOT NULL
     AND NEW.actor_user_id IS NULL
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.action IS NOT DISTINCT FROM OLD.action
     AND NEW.entity_type IS NOT DISTINCT FROM OLD.entity_type
     AND NEW.entity_id IS NOT DISTINCT FROM OLD.entity_id
     AND NEW.metadata IS NOT DISTINCT FROM OLD.metadata
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW
EXECUTE FUNCTION audit_logs_reject_mutation();
