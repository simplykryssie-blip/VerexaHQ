-- Services / automation routing: category-level defaults.
-- A service-specific pipeline remains the override. If a service has no
-- process_id, automation routing can fall back to this category pipeline.

ALTER TABLE public.service_categories
  ADD COLUMN IF NOT EXISTS process_id uuid;

ALTER TABLE public.service_categories
  DROP CONSTRAINT IF EXISTS service_categories_process_id_fkey;

ALTER TABLE public.service_categories
  ADD CONSTRAINT service_categories_process_id_fkey
  FOREIGN KEY (process_id)
  REFERENCES public.processes(id)
  ON DELETE SET NULL
  ON UPDATE NO ACTION;

CREATE INDEX IF NOT EXISTS idx_service_categories_process_id
  ON public.service_categories(process_id);

-- Keep the category routing tenant-safe: a category may only point to a
-- pipeline owned by the same workspace (system pipelines are not selectable).
CREATE OR REPLACE FUNCTION public.validate_service_category_process_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.process_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.processes p
    WHERE p.id = NEW.process_id
      AND p.workspace_id = NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'The category pipeline must belong to the same workspace';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_service_category_process_workspace
  ON public.service_categories;

CREATE TRIGGER trg_validate_service_category_process_workspace
  BEFORE INSERT OR UPDATE OF process_id, workspace_id
  ON public.service_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_service_category_process_workspace();

REVOKE ALL ON FUNCTION public.validate_service_category_process_workspace() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_service_category_process_workspace() TO service_role;
