-- Security, Workflow, and Performance now have real skills implementing
-- their methodology (.claude/skills/verexa-security-agent/,
-- verexa-workflow-agent/, verexa-performance-agent/), matching the pattern
-- the QA agent already used -- flip them enabled to match.
update public.ai_agents set is_enabled = true, updated_at = now() where agent_key in ('security', 'workflow', 'performance');
