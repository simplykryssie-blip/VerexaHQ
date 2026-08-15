-- Advisor: function_search_path_mutable. Pure string-substitution function
-- with no unqualified object references, so exploitability was low, but
-- pinning search_path is free and closes the finding.
alter function public.render_engagement_letter_merge_fields(text, text, text, text, text) set search_path to 'public';
