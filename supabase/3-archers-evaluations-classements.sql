-- 3. Espace archer : classements PDF des concours (à exécuter une fois dans Supabase › SQL Editor, relançable sans risque)
-- L'archer voit les classements PDF des concours auxquels il a participé, et peut les ouvrir.

create or replace function public.espace_archer(p_owner uuid, p_archer text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ar jsonb;
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  select data into ar from docs where owner = p_owner and col = 'archers' and id = p_archer;
  return jsonb_build_object(
    'archer', jsonb_build_object('id', p_archer, 'prenom', ar->>'prenom', 'nom', ar->>'nom', 'arcs', ar->'arcs', 'clubIds', ar->'clubIds', 'federations', ar->'federations'),
    'clubs', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nom', data->>'nom', 'couleur', data->>'couleur'))
      from docs where owner = p_owner and col = 'clubs' and ar->'clubIds' ? id), '[]'::jsonb),
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
      where owner = p_owner and col = 'evaluations' and data->>'archerId' = p_archer and data->>'partage' = 'true'), '[]'::jsonb));
end $$;

-- Fichiers lisibles par l'archer : fiches rendues visibles, et classements des concours où il a un résultat
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
$$;

revoke execute on function public.espace_archer(uuid, text) from public, anon;
grant execute on function public.espace_archer(uuid, text) to authenticated;
