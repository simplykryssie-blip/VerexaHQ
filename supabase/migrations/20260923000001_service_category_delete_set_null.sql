-- Allow service categories to be deleted without orphaning client service-interest rows.
-- The relationship is optional: when a category is removed, the interest remains
-- intact but loses its category association. Services already have the same
-- SET NULL behavior for service_categories.service_category_id.

ALTER TABLE public.client_service_interests
  DROP CONSTRAINT IF EXISTS client_service_interests_service_category_id_fkey;

ALTER TABLE public.client_service_interests
  ADD CONSTRAINT client_service_interests_service_category_id_fkey
  FOREIGN KEY (service_category_id)
  REFERENCES public.service_categories(id)
  ON DELETE SET NULL
  ON UPDATE NO ACTION;
