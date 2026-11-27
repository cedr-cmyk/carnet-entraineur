-- V.1.10 : discipline de test « Fléchettes ».
-- L'entraîneur l'ouvre sur la fiche de l'archer (espace.flechettes = true), seulement pour les archers Testeur ou Partenaire.
-- L'archer testeur peut la demander depuis ses paramètres (Mes disciplines). Les parties sont rangées dans son carnet comme les autres tirs.
-- À lancer une fois dans Supabase (SQL Editor), après le script 24. Peut être relancé sans risque.
-- Effet sur ce qui existe : aucun (campagne et run-archery se demandent comme avant).

create or replace function public.archer_demander(p_owner uuid, p_archer text, p_quoi text) returns void language plpgsql security definer set search_path = public as $$
declare esp jsonb;
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  if p_quoi not in ('campagne', 'run', 'flechettes') then raise exception 'discipline inconnue'; end if;
  if p_quoi = 'flechettes' and not public.archer_a_badge(p_owner, p_archer, array['testeur', 'partenaire']) then raise exception 'reserve aux testeurs'; end if;
  select coalesce(case when jsonb_typeof(data->'espace') = 'object' then data->'espace' end, '{}'::jsonb) into esp from docs where owner = p_owner and col = 'archers' and id = p_archer;
  if not found then raise exception 'archer introuvable'; end if;
  if esp->>p_quoi = 'true' then return; end if;  -- déjà ouverte
  esp := jsonb_set(case when jsonb_typeof(esp->'demandes') = 'object' then esp else esp || '{"demandes":{}}'::jsonb end, array['demandes', p_quoi],
    jsonb_build_object('date', to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD'), 'statut', 'attente'));
  update docs set data = data || jsonb_build_object('espace', esp), updated_at = now() where owner = p_owner and col = 'archers' and id = p_archer;
end $$;
revoke all on function public.archer_demander(uuid, text, text) from public, anon;
grant execute on function public.archer_demander(uuid, text, text) to authenticated;
