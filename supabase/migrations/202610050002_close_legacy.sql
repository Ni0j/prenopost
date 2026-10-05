-- Apply only after the static frontend is serving the new submission RPC.
begin;
revoke all on function public.submit_rejection(jsonb,uuid) from public, anon, authenticated;
revoke all on function public.draw_rejection(uuid) from public, anon, authenticated;
commit;
