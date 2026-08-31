-- The QA Agent's real end-to-end infrastructure has been verified with a
-- genuine run (start_agent_run -> append_agent_run_event ->
-- record_agent_evidence -> complete_agent_run) against a demo workspace,
-- testing the actual record_signature_by_token require-both validation.
-- See .claude/skills/verexa-qa-agent/SKILL.md for how to run it.

update public.ai_agents set is_enabled = true, updated_at = now() where agent_key = 'qa';
