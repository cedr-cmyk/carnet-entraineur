-- 4. Espace archer : infos du club, documents partagés et réponses aux entraînements proposés
-- À exécuter une fois dans Supabase › SQL Editor, après les scripts 2 et 3 (relançable sans risque).

-- Un document est partagé quand l'entraîneur coche des clubs (« * » = tous les clubs)
create or replace function public.doc_partage(p_doc jsonb, p_clubs jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(p_doc->'partageClubs') = 'array' and (p_doc->'partageClubs' ? '*'
    or exists (select 1 from jsonb_array_elements_text(p_doc->'partageClubs') x where coalesce(p_clubs, '[]'::jsonb) ? x))
$$;

-- Un entraînement est proposé à l'archer : séance de son club, à venir, ouverte à son public (jeunes = 17 ans ou moins dans la saison)
create or replace function public.seance_pour(p_seance jsonb, p_archer jsonb) returns boolean language sql immutable as $$
  select coalesce(p_seance->>'public', '') <> ''
    and coalesce(p_archer->'clubIds', '[]'::jsonb) ? (p_seance->>'clubId')
    and coalesce(p_seance->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
    and (p_seance->>'public' = 'tous'
      or coalesce(p_archer->>'role', '') in ('encadrant', 'les-deux')
      or coalesce(p_archer->>'naissance', '') !~ '^\d{4}'
      or ((left(p_seance->>'date', 4)::int + case when substr(p_seance->>'date', 6, 2)::int >= 9 then 1 else 0 end) - left(p_archer->>'naissance', 4)::int <= 17) = (p_seance->>'public' = 'jeunes'))
$$;

create or replace function public.espace_archer(p_owner uuid, p_archer text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ar jsonb; enc boolean; jour text := to_char(current_date, 'YYYY-MM-DD'); fin text := to_char(current_date + 42, 'YYYY-MM-DD');
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  select data into ar from docs where owner = p_owner and col = 'archers' and id = p_archer;
  enc := coalesce(ar->>'role', '') in ('encadrant', 'les-deux');
  return jsonb_build_object(
    'archer', jsonb_build_object('id', p_archer, 'prenom', ar->>'prenom', 'nom', ar->>'nom', 'arcs', ar->'arcs', 'clubIds', ar->'clubIds', 'federations', ar->'federations', 'role', coalesce(ar->>'role', 'archer')),
    'clubs', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nom', data->>'nom', 'couleur', data->>'couleur', 'lieu', data->>'lieu'))
      from docs where owner = p_owner and col = 'clubs' and coalesce(ar->'clubIds', '[]'::jsonb) ? id), '[]'::jsonb),
    'entrees', coalesce((select jsonb_agg(data || jsonb_build_object('id', id)) from docs
      where owner = p_owner and col = 'carnetEntrees' and data->>'archerId' = p_archer), '[]'::jsonb),
    'carnets', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'saison', data->>'saison', 'objectifs', data->'objectifs', 'dates', data->'dates')) from docs
      where owner = p_owner and col = 'carnets' and data->>'archerId' = p_archer), '[]'::jsonb),
    'concours', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nom', data->>'nom', 'lieu', data->>'lieu', 'date', data->>'date', 'dateFin', data->>'dateFin',
        'types', data->'types', 'federation', data->>'federation', 'resultat', data->'resultats'->p_archer,
        'classements', coalesce((select jsonb_agg(jsonb_build_object('id', k->>'id', 'nom', k->>'nom', 'assetId', k->>'assetId', 'taille', k->'taille'))
          from jsonb_array_elements(case when jsonb_typeof(data->'classements') = 'array' then data->'classements' else '[]'::jsonb end) k), '[]'::jsonb))) from docs
      where owner = p_owner and col = 'concours' and jsonb_typeof(data->'resultats'->p_archer) = 'object'), '[]'::jsonb),
    'exercices', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'remarque', t.data->>'remarque', 'fait', t.data->'fait', 'seanceId', t.data->>'seanceId',
        'date', s.data->>'date', 'createdAt', t.data->'createdAt',
        'document', case when d.id is null then null else jsonb_build_object('id', d.id, 'titre', d.data->>'titre', 'description', d.data->>'description',
          'assetId', d.data->>'assetId', 'contentType', d.data->>'contentType', 'nomFichier', d.data->>'nomFichier') end))
      from docs t
      left join docs d on d.owner = t.owner and d.col = 'documents' and d.id = t.data->>'documentId'
      left join docs s on s.owner = t.owner and s.col = 'seances' and s.id = t.data->>'seanceId'
      where t.owner = p_owner and t.col = 'attributions' and t.data->>'archerId' = p_archer and t.data->>'visible' = 'true'), '[]'::jsonb),
    'evaluations', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'date', data->>'date', 'notes', data->'notes', 'observation', data->>'observation')) from docs
      where owner = p_owner and col = 'evaluations' and data->>'archerId' = p_archer and data->>'partage' = 'true'), '[]'::jsonb),
    -- infos importantes du club (sans club coché = tous les clubs), tant qu'elles ne sont pas expirées
    'annonces', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'titre', data->>'titre', 'texte', data->>'texte', 'date', data->>'date', 'jusquau', data->>'jusquau', 'clubIds', data->'clubIds', 'important', data->'important'))
      from docs where owner = p_owner and col = 'annonces' and (coalesce(data->>'jusquau', '') = '' or data->>'jusquau' >= jour)
        and (jsonb_typeof(data->'clubIds') is distinct from 'array' or jsonb_array_length(data->'clubIds') = 0
          or exists (select 1 from jsonb_array_elements_text(data->'clubIds') x where coalesce(ar->'clubIds', '[]'::jsonb) ? x))), '[]'::jsonb),
    -- documents partagés avec tout le club (calendrier des concours, règlement…)
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'titre', data->>'titre', 'description', data->>'description', 'assetId', data->>'assetId',
        'contentType', data->>'contentType', 'nomFichier', data->>'nomFichier', 'partageLe', data->'partageLe'))
      from docs where owner = p_owner and col = 'documents' and doc_partage(data, ar->'clubIds')), '[]'::jsonb),
    -- entraînements proposés des 6 prochaines semaines, avec la réponse de l'archer ; les encadrants voient aussi qui vient
    'entrainements', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'date', s.data->>'date', 'heure', s.data->>'heure', 'groupe', s.data->>'groupe',
        'theme', s.data->>'theme', 'lieu', s.data->>'lieu', 'clubId', s.data->>'clubId', 'public', s.data->>'public',
        'reponse', (select r.data->>'reponse' from docs r where r.owner = p_owner and r.col = 'reponses' and r.id = 'r_' || s.id || '_' || p_archer),
        'presents', case when enc then coalesce((select jsonb_agg(trim(coalesce(a.data->>'prenom', '') || ' ' || coalesce(a.data->>'nom', '')) order by a.data->>'nom', a.data->>'prenom')
          from docs r join docs a on a.owner = r.owner and a.col = 'archers' and a.id = r.data->>'archerId'
          where r.owner = p_owner and r.col = 'reponses' and r.data->>'seanceId' = s.id and r.data->>'reponse' = 'present'), '[]'::jsonb) end,
        'absents', case when enc then coalesce((select jsonb_agg(trim(coalesce(a.data->>'prenom', '') || ' ' || coalesce(a.data->>'nom', '')) order by a.data->>'nom', a.data->>'prenom')
          from docs r join docs a on a.owner = r.owner and a.col = 'archers' and a.id = r.data->>'archerId'
          where r.owner = p_owner and r.col = 'reponses' and r.data->>'seanceId' = s.id and r.data->>'reponse' = 'absent'), '[]'::jsonb) end)
        order by s.data->>'date', s.data->>'heure')
      from docs s where s.owner = p_owner and s.col = 'seances' and seance_pour(s.data, ar) and s.data->>'date' >= jour and s.data->>'date' <= fin), '[]'::jsonb));
end $$;

-- L'archer (ou son parent) répond présent / absent à un entraînement proposé ; réponse vide = retirer sa réponse
create or replace function public.archer_repondre(p_owner uuid, p_archer text, p_seance text, p_reponse text) returns void language plpgsql security definer set search_path = public as $$
declare ar jsonb; s jsonb; rid text := 'r_' || p_seance || '_' || p_archer;
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  select data into ar from docs where owner = p_owner and col = 'archers' and id = p_archer;
  select data into s from docs where owner = p_owner and col = 'seances' and id = p_seance;
  if s is null or not seance_pour(s, ar) or s->>'date' < to_char(current_date, 'YYYY-MM-DD') then raise exception 'entrainement non propose'; end if;
  if coalesce(p_reponse, '') = '' then delete from docs where owner = p_owner and col = 'reponses' and id = rid; return; end if;
  if p_reponse not in ('present', 'absent') then raise exception 'reponse invalide'; end if;
  insert into docs (owner, col, id, data, updated_at) values (p_owner, 'reponses', rid,
    jsonb_build_object('seanceId', p_seance, 'archerId', p_archer, 'reponse', p_reponse, 'at', extract(epoch from now()) * 1000), now())
    on conflict (owner, col, id) do update set data = excluded.data, updated_at = now();
end $$;

-- Fichiers lisibles par l'archer : fiches rendues visibles, classements de ses concours, documents partagés avec son club
create or replace function public.archer_peut_lire(p_name text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from acces a
    join docs t on t.owner = a.owner and t.col = 'attributions' and t.data->>'archerId' = a.archer_id and t.data->>'visible' = 'true'
    join docs d on d.owner = a.owner and d.col = 'documents' and d.id = t.data->>'documentId'
    where a.user_id = auth.uid() and a.owner::text = split_part(p_name, '/', 1) and d.data->>'assetId' = split_part(p_name, '/', 2))
  or exists (
    select 1 from acces a
    join docs c on c.owner = a.owner and c.col = 'concours' and jsonb_typeof(c.data->'resultats'->a.archer_id) = 'object' and jsonb_typeof(c.data->'classements') = 'array'
    cross join lateral jsonb_array_elements(c.data->'classements') k
    where a.user_id = auth.uid() and a.owner::text = split_part(p_name, '/', 1) and k->>'assetId' = split_part(p_name, '/', 2))
  or exists (
    select 1 from acces a
    join docs ar on ar.owner = a.owner and ar.col = 'archers' and ar.id = a.archer_id
    join docs d on d.owner = a.owner and d.col = 'documents' and public.doc_partage(d.data, ar.data->'clubIds')
    where a.user_id = auth.uid() and a.owner::text = split_part(p_name, '/', 1) and d.data->>'assetId' = split_part(p_name, '/', 2))
$$;

revoke execute on function public.espace_archer(uuid, text), public.archer_repondre(uuid, text, text, text) from public, anon;
grant execute on function public.espace_archer(uuid, text), public.archer_repondre(uuid, text, text, text) to authenticated;
