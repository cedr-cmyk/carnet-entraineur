-- V.1.10 : avantages des archers partenaires.
--  • Fil des partenaires : un espace d'échange entre l'entraîneur et tous ses archers partenaires (collection « filPartenaires »).
--  • Demande de stage personnalisé : le partenaire envoie sa demande (type « stage ») avec ses retours.
--  • Contenus en avant-première : un document peut arriver chez les partenaires avant les clubs (clubsLe = date à partir de laquelle les clubs le voient).
-- À lancer une fois dans Supabase (SQL Editor), après le script 18. Peut être relancé sans risque.
-- Effet sur la 1.9 : aucun, tant que tu ne mets pas de date « avant-première » sur un document (ce réglage n'existe qu'en 1.10).

-- Fil des partenaires : les 200 derniers messages (les plus anciens d'abord)
create or replace function public.archer_fil(p_owner uuid, p_archer text) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  if not public.archer_a_badge(p_owner, p_archer, array['partenaire']) then raise exception 'reserve aux partenaires'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'auteur', data->>'auteur', 'nom', data->>'nom', 'texte', data->>'texte', 'createdAt', (data->>'createdAt')::bigint)
      order by (data->>'createdAt')::bigint)
    from (select * from docs where owner = p_owner and col = 'filPartenaires' and coalesce(data->>'createdAt', '') ~ '^[0-9]+$'
          order by (data->>'createdAt')::bigint desc limit 200) x), '[]'::jsonb);
end $$;

create or replace function public.archer_fil_ecrire(p_owner uuid, p_archer text, p_texte text) returns text language plpgsql security definer set search_path = public as $$
declare t text := left(btrim(coalesce(p_texte, '')), 1500); ar jsonb; rid text;
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  if not public.archer_a_badge(p_owner, p_archer, array['partenaire']) then raise exception 'reserve aux partenaires'; end if;
  if length(t) < 1 then raise exception 'message vide'; end if;
  if (select count(*) from docs where owner = p_owner and col = 'filPartenaires' and data->>'auteur' = p_archer and updated_at > now() - interval '1 day') >= 50 then
    raise exception 'trop de messages aujourd''hui'; end if;
  select data into ar from docs where owner = p_owner and col = 'archers' and id = p_archer;
  rid := 'f' || replace(gen_random_uuid()::text, '-', '');
  insert into docs (owner, col, id, data) values (p_owner, 'filPartenaires', rid, jsonb_build_object('auteur', p_archer,
    'nom', btrim(coalesce(ar->>'prenom', '') || ' ' || left(coalesce(ar->>'nom', ''), 1) || case when coalesce(ar->>'nom', '') <> '' then '.' else '' end),
    'texte', t, 'createdAt', (extract(epoch from now()) * 1000)::bigint));
  return rid;
end $$;
revoke all on function public.archer_fil(uuid, text), public.archer_fil_ecrire(uuid, text, text) from public, anon;
grant execute on function public.archer_fil(uuid, text), public.archer_fil_ecrire(uuid, text, text) to authenticated;

-- Retours : en plus des problèmes et des idées, le partenaire peut demander un stage personnalisé
create or replace function public.archer_retour(p_owner uuid, p_archer text, p_type text, p_texte text) returns text language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_texte, '')); rid text;
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  if not public.archer_a_badge(p_owner, p_archer, array['testeur', 'partenaire']) then raise exception 'reserve aux testeurs et partenaires'; end if;
  if p_type not in ('bug', 'idee', 'stage') then raise exception 'type inconnu'; end if;
  if p_type = 'stage' and not public.archer_a_badge(p_owner, p_archer, array['partenaire']) then raise exception 'reserve aux partenaires'; end if;
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

-- Documents : avant-première. Partagé aux clubs seulement à partir de clubsLe (les partenaires / archers choisis le voient tout de suite)
create or replace function public.doc_partage_archer(p_doc jsonb, p_clubs jsonb, p_archer text) returns boolean language sql stable security definer set search_path = public as $$
  select (coalesce(jsonb_typeof(p_doc->'partageArchers') = 'array' and p_doc->'partageArchers' ? p_archer, false)
      or (coalesce(public.doc_partage(p_doc, p_clubs), false)
          and coalesce(p_doc->>'clubsLe', '') <= to_char(now() at time zone 'Europe/Paris', 'YYYY-MM-DD')
          and not coalesce(jsonb_typeof(p_doc->'partageExclus') = 'array' and p_doc->'partageExclus' ? p_archer, false))
      or (jsonb_typeof(p_doc->'partageBadges') = 'array' and jsonb_array_length(p_doc->'partageBadges') > 0
          and not coalesce(jsonb_typeof(p_doc->'partageExclus') = 'array' and p_doc->'partageExclus' ? p_archer, false)
          and exists (select 1 from docs a where a.col = 'archers' and a.id = p_archer
                      and exists (select 1 from jsonb_array_elements_text(p_doc->'partageBadges') b where a.data->'espace'->'badges'->>b = 'true'))))
$$;
