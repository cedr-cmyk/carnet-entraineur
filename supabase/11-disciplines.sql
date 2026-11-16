-- V.1.10 : disciplines ouvertes à chaque archer (parcours campagne, run-archery) et demandes d'accès des archers.
-- L'entraîneur ouvre une discipline sur la fiche de l'archer (espace.campagne / espace.run = true).
-- L'archer peut la demander depuis son espace : la demande arrive sur sa fiche (espace.demandes) et sur l'accueil de l'entraîneur.
-- À lancer une fois dans Supabase (SQL Editor), après le script 10. Peut être relancé sans risque.

create or replace function public.archer_demander(p_owner uuid, p_archer text, p_quoi text) returns void language plpgsql security definer set search_path = public as $$
declare esp jsonb;
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  if p_quoi not in ('campagne', 'run') then raise exception 'discipline inconnue'; end if;
  select coalesce(case when jsonb_typeof(data->'espace') = 'object' then data->'espace' end, '{}'::jsonb) into esp from docs where owner = p_owner and col = 'archers' and id = p_archer;
  if not found then raise exception 'archer introuvable'; end if;
  if esp->>p_quoi = 'true' then return; end if;  -- déjà ouverte
  esp := jsonb_set(case when jsonb_typeof(esp->'demandes') = 'object' then esp else esp || '{"demandes":{}}'::jsonb end, array['demandes', p_quoi],
    jsonb_build_object('date', to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD'), 'statut', 'attente'));
  update docs set data = data || jsonb_build_object('espace', esp), updated_at = now() where owner = p_owner and col = 'archers' and id = p_archer;
end $$;
revoke all on function public.archer_demander(uuid, text, text) from public, anon;
grant execute on function public.archer_demander(uuid, text, text) to authenticated;
