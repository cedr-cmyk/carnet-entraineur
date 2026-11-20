-- V.1.10 : avantages des badges (Testeur, Archer partenaire).
--  • L'archer qui a un badge peut signaler un problème ou proposer une idée depuis son espace : ça arrive dans le carnet de l'entraîneur
--    (collection « retours »), qui répond et indique où ça en est ; l'archer suit ses retours et les réponses.
--  • Documents réservés : un document peut être partagé avec tous les archers partenaires (ou tous les testeurs) d'un coup (partageBadges).
--  • Avatars exclusifs : réservés aux archers partenaires.
-- À lancer une fois dans Supabase (SQL Editor), après le script 16. Peut être relancé sans risque.

-- L'archer a-t-il ce badge ? (rangé par l'entraîneur dans espace.badges de sa fiche)
create or replace function public.archer_a_badge(p_owner uuid, p_archer text, p_badges text[]) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from docs where owner = p_owner and col = 'archers' and id = p_archer
    and exists (select 1 from unnest(p_badges) b where data->'espace'->'badges'->>b = 'true'))
$$;
revoke all on function public.archer_a_badge(uuid, text, text[]) from public, anon;

-- Signaler un problème (bug) ou proposer une idée (idee)
create or replace function public.archer_retour(p_owner uuid, p_archer text, p_type text, p_texte text) returns text language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_texte, '')); rid text;
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  if not public.archer_a_badge(p_owner, p_archer, array['testeur', 'partenaire']) then raise exception 'reserve aux testeurs et partenaires'; end if;
  if p_type not in ('bug', 'idee') then raise exception 'type inconnu'; end if;
  if length(t) < 3 then raise exception 'texte trop court'; end if;
  t := left(t, 2000);
  if (select count(*) from docs where owner = p_owner and col = 'retours' and data->>'archerId' = p_archer
      and updated_at > now() - interval '1 day') >= 30 then raise exception 'trop de retours aujourd''hui'; end if;
  rid := 'r' || replace(gen_random_uuid()::text, '-', '');
  insert into docs (owner, col, id, data) values (p_owner, 'retours', rid, jsonb_build_object(
    'archerId', p_archer, 'type', p_type, 'texte', t, 'date', to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD'),
    'createdAt', (extract(epoch from now()) * 1000)::bigint, 'statut', 'nouveau', 'reponse', ''));
  return rid;
end $$;

-- Les retours de l'archer, avec la réponse et le statut donnés par l'entraîneur (les plus récents d'abord)
create or replace function public.archer_mes_retours(p_owner uuid, p_archer text) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'type', data->>'type', 'texte', data->>'texte', 'date', data->>'date',
      'statut', coalesce(data->>'statut', 'nouveau'), 'reponse', coalesce(data->>'reponse', ''), 'reponseLe', data->>'reponseLe') order by (data->>'createdAt') desc nulls last)
    from (select * from docs where owner = p_owner and col = 'retours' and data->>'archerId' = p_archer order by (data->>'createdAt') desc nulls last limit 100) x), '[]'::jsonb);
end $$;
revoke all on function public.archer_retour(uuid, text, text, text), public.archer_mes_retours(uuid, text) from public, anon;
grant execute on function public.archer_retour(uuid, text, text, text), public.archer_mes_retours(uuid, text) to authenticated;

-- Documents : en plus des clubs et des archers choisis, partage à tous les archers qui ont un badge (partageBadges : ["partenaire"], ["testeur"])
create or replace function public.doc_partage_archer(p_doc jsonb, p_clubs jsonb, p_archer text) returns boolean language sql stable security definer set search_path = public as $$
  select (coalesce(jsonb_typeof(p_doc->'partageArchers') = 'array' and p_doc->'partageArchers' ? p_archer, false)
      or (coalesce(public.doc_partage(p_doc, p_clubs), false)
          and not coalesce(jsonb_typeof(p_doc->'partageExclus') = 'array' and p_doc->'partageExclus' ? p_archer, false))
      or (jsonb_typeof(p_doc->'partageBadges') = 'array' and jsonb_array_length(p_doc->'partageBadges') > 0
          and not coalesce(jsonb_typeof(p_doc->'partageExclus') = 'array' and p_doc->'partageExclus' ? p_archer, false)
          and exists (select 1 from docs a where a.col = 'archers' and a.id = p_archer
                      and exists (select 1 from jsonb_array_elements_text(p_doc->'partageBadges') b where a.data->'espace'->'badges'->>b = 'true'))))
$$;

-- Avatars : les dessins exclusifs sont réservés aux archers partenaires
create or replace function public.archer_avatar(p_owner uuid, p_archer text, p_avatar jsonb) returns void language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  if p_avatar is null or jsonb_typeof(p_avatar) = 'null' then v := 'null'::jsonb;
  else
    if coalesce(p_avatar->>'id', '') !~ '^[a-z]{2,20}$' or coalesce(p_avatar->>'fond', '') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'avatar invalide'; end if;
    if p_avatar->>'id' in ('couronne', 'medaille', 'trophee', 'blason') and not public.archer_a_badge(p_owner, p_archer, array['partenaire']) then
      raise exception 'avatar reserve aux partenaires'; end if;
    v := jsonb_build_object('id', p_avatar->>'id', 'fond', p_avatar->>'fond');
  end if;
  update docs set data = data || jsonb_build_object('avatar', v), updated_at = now() where owner = p_owner and col = 'archers' and id = p_archer;
end $$;
