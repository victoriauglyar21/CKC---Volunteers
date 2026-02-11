ALTER TABLE public.shift_assignments
  ADD COLUMN IF NOT EXISTS notes text;
