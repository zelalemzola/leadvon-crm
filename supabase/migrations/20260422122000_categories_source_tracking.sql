-- Track where categories came from so admin UI can label imported categories.
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS source_external_value text;

CREATE INDEX IF NOT EXISTS idx_categories_source_system
  ON public.categories (source_system);
