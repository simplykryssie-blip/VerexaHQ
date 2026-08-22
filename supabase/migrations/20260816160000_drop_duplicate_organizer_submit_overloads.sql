-- submit_public_organizer_response and submit_public_organizer_response_with_signup
-- each had two live overloads differing only by a trailing p_client_id uuid
-- DEFAULT NULL parameter. Because the extra parameter has a default, a
-- PostgREST call supplying only the shorter arg set is a valid match for
-- both signatures -- confirmed live: calling with just the 6 base args
-- raises "function ... is not unique" (42725), PostgREST's PGRST203.
--
-- The longer signature's body is a strict superset of the shorter one
-- (v_client_id := coalesce(p_client_id, find_or_create_public_lead(...)) is
-- exactly what the shorter version always did unconditionally), and
-- PublicOrganizerForm.tsx -- the only caller of either function -- already
-- always supplies p_client_id by the time it reaches submit(). Dropping the
-- shorter overloads is a pure simplification: one canonical signature per
-- function, no behavior change for the only real caller, and it removes a
-- landmine that only avoided breaking every submission because of how
-- carefully the current frontend happens to populate p_client_id.
drop function if exists public.submit_public_organizer_response(uuid, text, text, text, text, jsonb);
drop function if exists public.submit_public_organizer_response_with_signup(uuid, text, text, text, text, jsonb, uuid);
