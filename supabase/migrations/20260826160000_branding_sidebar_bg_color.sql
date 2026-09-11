-- Lets a workspace (or an ERO, for its whitelabeled PTINs) recolor the
-- staff sidebar background, not just the accent used for its active item.
-- sidebar_text_color already existed but was unused (readability risk with
-- a freely-chosen background); both are now applied together, with the
-- app auto-picking readable text from the background's luminance unless
-- sidebar_text_color is explicitly set.
alter table public.branding add column sidebar_bg_color text;
