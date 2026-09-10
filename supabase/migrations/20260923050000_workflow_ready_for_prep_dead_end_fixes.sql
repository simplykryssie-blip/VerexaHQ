-- Fixes 3 real dead-ends the workflow QA agent found in "Individual/Sched C
-- -- Ready for Prep" (findings 7409c23a and 67e5664c), all on workspace
-- b41f7ee8-e811-4d4d-8156-5ebf43014462 (Summit Tax & Financial Services,
-- a demo workspace):
--
-- 1. Step 5e249daf (quote.status) only branches on accepted/declined --
--    draft, sent, and no-quote-on-file all fall through to a silent
--    dead-end. Opt into retry_until_matched so the run waits until the
--    quote is actually decided instead of completing prematurely.
--
-- 2 & 3. Steps e8f8896d and ca36c6d1 (engagement.engagement_letter_status)
--    only branch on completed/pending -- not_sent and declined fall
--    through the same way. retry_until_matched handles not_sent (a
--    transient pre-send state that resolves once the letter goes out).
--    declined is terminal and needs a real branch: routed to the existing
--    9ae4008d "engagement letter still unsigned" task step, whose own
--    description already anticipates this exact case ("...or move to
--    Stalled/nurturing if they've decided not to proceed"), so this reuses
--    an existing human-touch step rather than inventing a new action.

update public.automation_steps
set action_config = jsonb_build_object('retry_until_matched', true, 'retry_timeout_days', 90)
where id in (
  '5e249daf-1acd-4d60-b1cc-da43f58c74cc',
  'e8f8896d-1efc-47c0-b207-d2a7da468af5',
  'ca36c6d1-ed7d-48b0-9ca5-931671a1b209'
);

insert into public.automation_step_edges (automation_id, from_step_id, to_step_id, branch_conditions, label, sort_order)
values
  (
    '3ab3846e-a570-4bc5-9fc5-b6cb2ab4eaf5',
    'e8f8896d-1efc-47c0-b207-d2a7da468af5',
    '9ae4008d-fedd-4cb7-bff1-0110c473a18a',
    '[{"conditions":[{"op":"eq","field":"engagement.engagement_letter_status","value":"declined"}]}]'::jsonb,
    'Engagement declined',
    2
  ),
  (
    '3ab3846e-a570-4bc5-9fc5-b6cb2ab4eaf5',
    'ca36c6d1-ed7d-48b0-9ca5-931671a1b209',
    '9ae4008d-fedd-4cb7-bff1-0110c473a18a',
    '[{"conditions":[{"op":"eq","field":"engagement.engagement_letter_status","value":"declined"}]}]'::jsonb,
    'Engagement declined',
    2
  );
