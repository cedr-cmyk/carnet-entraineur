-- 9. Animations (V.1.9) : espace archer pour les animations.
--   · un archer participant voit les scores et le classement d'une animation que l'entraîneur a ouverte aux archers ;
--   · un chef d'équipe voit l'animation dès qu'il est nommé et compte les flèches de son équipe, essai par essai.
--     Une équipe peut refaire un jeu : c'est l'entraîneur qui choisit l'essai qui compte (un seul essai = compté d'office).
--   · les points des zones ne sont jamais envoyés aux archers : ils ne reçoivent que les noms des zones et les scores finaux.
--   · les règles (texte, et PDF ou image choisis dans les documents) sont lisibles par ceux qui voient l'animation.
-- À exécuter une fois dans Supabase › SQL Editor, APRÈS les scripts 1 à 8 (relançable sans risque).

drop function if exists public.archer_anim_score(uuid, text, text, text, text, jsonb);

-- Flèches comptées pour un archer sur un jeu (essai qui compte s'il est en équipe)
create or replace function public.anim_compte(d jsonb, x text, j text) returns jsonb language plpgsql immutable set search_path = public as $$
declare eid text; l jsonb; r text; c jsonb;
begin
  select e->>'id' into eid from jsonb_array_elements(coalesce(d->'equipes', '[]'::jsonb)) e where coalesce(e->'membres', '[]'::jsonb) ? x limit 1;
  if eid is null then return d->'scores'->x->j; end if;
  l := coalesce(d->'essais'->eid->j, '[]'::jsonb);
  if jsonb_array_length(l) = 0 then return d->'scores'->x->j; end if;
  r := d->'retenus'->eid->>j;
  select s->'scores'->x into c from jsonb_array_elements(l) s where s->>'id' = r;
  if c is not null or (r is not null and exists (select 1 from jsonb_array_elements(l) s where s->>'id' = r)) then return c; end if;
  if jsonb_array_length(l) = 1 then return l->0->'scores'->x; end if;
  return null;
end $$;

create or replace function public.anim_points(d jsonb, x text, j text) returns numeric language sql immutable set search_path = public as $$
  select case when c is null then null else
    (select coalesce(sum(coalesce((c->>((t.i - 1)::int))::numeric, 0) * coalesce((t.z->>'points')::numeric, 0)), 0)
       from jsonb_array_elements(coalesce((select jj->'zones' from jsonb_array_elements(coalesce(d->'jeux', '[]'::jsonb)) jj where jj->>'id' = j limit 1), '[]'::jsonb)) with ordinality t(z, i)) end
  from (select public.anim_compte(d, x, j) as c) s
$$;

create or replace function public.archer_animations(p_owner uuid, p_archer text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; e jsonb; jeux jsonb; eqs jsonb; parts jsonb; mon jsonb; ess jsonb; out jsonb := '[]'::jsonb; ouvert boolean;
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  for r in select id, data from docs where owner = p_owner and col = 'animations' order by data->>'date' desc loop
    ouvert := coalesce(r.data->>'partage', 'false') = 'true';
    e := null;
    select q into e from jsonb_array_elements(coalesce(r.data->'equipes', '[]'::jsonb)) q where q->>'chefId' = p_archer limit 1;
    if not ((ouvert and coalesce(r.data->'participants', '[]'::jsonb) ? p_archer) or e is not null) then continue; end if;
    -- jeux sans les points
    select coalesce(jsonb_agg(jsonb_build_object('id', j->>'id', 'nom', j->>'nom', 'regle', coalesce(j->>'regle', ''),
        'regleAsset', (select g.data->>'assetId' from docs g where g.owner = p_owner and g.col = 'documents' and g.id = j->>'regleDoc'),
        'zones', (select coalesce(jsonb_agg(jsonb_build_object('nom', z->>'nom') order by i), '[]'::jsonb) from jsonb_array_elements(coalesce(j->'zones', '[]'::jsonb)) with ordinality t(z, i)))), '[]'::jsonb)
      into jeux from jsonb_array_elements(coalesce(r.data->'jeux', '[]'::jsonb)) j;
    select coalesce(jsonb_agg(jsonb_build_object('id', q->>'id', 'nom', q->>'nom', 'chefId', q->>'chefId', 'membres', q->'membres')), '[]'::jsonb)
      into eqs from jsonb_array_elements(coalesce(r.data->'equipes', '[]'::jsonb)) q where jsonb_array_length(coalesce(q->'membres', '[]'::jsonb)) > 0;
    -- participants : tous si l'animation est ouverte, sinon l'équipe du chef ; scores finaux seulement si ouverte
    select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'moi', p.id = p_archer,
        'nom', trim(coalesce(p.data->>'prenom', '') || ' ' || case when coalesce(p.data->>'nom', '') <> '' then left(p.data->>'nom', 1) || '.' else '' end),
        'scores', case when ouvert then (select coalesce(jsonb_object_agg(j->>'id', public.anim_points(r.data, p.id, j->>'id')), '{}'::jsonb) from jsonb_array_elements(coalesce(r.data->'jeux', '[]'::jsonb)) j) else '{}'::jsonb end)), '[]'::jsonb)
      into parts from docs p where p.owner = p_owner and p.col = 'archers' and coalesce(r.data->'participants', '[]'::jsonb) ? p.id
        and (ouvert or (e is not null and coalesce(e->'membres', '[]'::jsonb) ? p.id));
    mon := null;
    if e is not null then
      select coalesce(jsonb_object_agg(j->>'id', (select coalesce(jsonb_agg(jsonb_build_object('id', s->>'id', 'le', s->'le',
            'retenu', coalesce(r.data->'retenus'->(e->>'id')->>(j->>'id') = s->>'id', false), 'scores', coalesce(s->'scores', '{}'::jsonb)) order by k), '[]'::jsonb)
          from jsonb_array_elements(coalesce(r.data->'essais'->(e->>'id')->(j->>'id'), '[]'::jsonb)) with ordinality u(s, k))), '{}'::jsonb)
        into ess from jsonb_array_elements(coalesce(r.data->'jeux', '[]'::jsonb)) j;
      mon := jsonb_build_object('id', e->>'id', 'nom', e->>'nom', 'membres', coalesce(e->'membres', '[]'::jsonb), 'essais', ess);
    end if;
    out := out || jsonb_build_array(jsonb_build_object('id', r.id, 'nom', r.data->>'nom', 'date', r.data->>'date', 'lieu', r.data->>'lieu',
      'classement', coalesce(r.data->>'classement', 'true') <> 'false', 'partage', ouvert, 'saisie', coalesce(r.data->>'saisieChefs', 'true') <> 'false',
      'fleches', r.data->'fleches', 'jeux', jeux, 'regles', coalesce(r.data->>'regles', ''),
      'reglesAsset', (select g.data->>'assetId' from docs g where g.owner = p_owner and g.col = 'documents' and g.id = r.data->>'reglesDoc'), 'equipes', eqs, 'participants', parts, 'monEquipe', mon));
  end loop;
  return out;
end $$;
revoke execute on function public.archer_animations(uuid, text) from public, anon;
grant execute on function public.archer_animations(uuid, text) to authenticated;

-- Chef d'équipe : p_essai vide = nouvel essai ; p_cible + p_compte = flèches d'un archer de son équipe (p_compte null = effacer) ;
-- p_essai sans p_cible ni p_compte = supprimer l'essai. Un essai choisi par l'entraîneur est verrouillé. Renvoie l'identifiant de l'essai.
create or replace function public.archer_anim_essai(p_owner uuid, p_archer text, p_anim text, p_jeu text, p_essai text, p_cible text, p_compte jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare d jsonb; e jsonb; eid text; n int; l jsonb; nl jsonb := '[]'::jsonb; s jsonb; v jsonb; trouve boolean := false; nouv boolean := false;
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  select data into d from docs where owner = p_owner and col = 'animations' and id = p_anim for update;
  if d is null then raise exception 'animation introuvable'; end if;
  if coalesce(d->>'saisieChefs', 'true') = 'false' then raise exception 'saisie fermee'; end if;
  select q into e from jsonb_array_elements(coalesce(d->'equipes', '[]'::jsonb)) q where q->>'chefId' = p_archer limit 1;
  if e is null then raise exception 'pas chef d''equipe'; end if;
  eid := e->>'id';
  select jsonb_array_length(coalesce(j->'zones', '[]'::jsonb)) into n from jsonb_array_elements(coalesce(d->'jeux', '[]'::jsonb)) j where j->>'id' = p_jeu;
  if n is null then raise exception 'jeu introuvable'; end if;
  if p_cible is not null and not coalesce(e->'membres', '[]'::jsonb) ? p_cible then raise exception 'pas dans ton equipe'; end if;
  if p_compte is not null and jsonb_typeof(p_compte) = 'null' then p_compte := null; end if;
  if p_compte is not null then
    if jsonb_typeof(p_compte) <> 'array' or jsonb_array_length(p_compte) <> n then raise exception 'score invalide'; end if;
    for v in select * from jsonb_array_elements(p_compte) loop
      if jsonb_typeof(v) <> 'number' or (v#>>'{}')::numeric not between 0 and 99 or (v#>>'{}')::numeric <> trunc((v#>>'{}')::numeric) then raise exception 'score invalide'; end if;
    end loop;
    if jsonb_typeof(d->'fleches') = 'number' and (select sum((v2#>>'{}')::numeric) from jsonb_array_elements(p_compte) v2) > (d->>'fleches')::numeric then raise exception 'trop de fleches'; end if;
  end if;
  l := coalesce(d->'essais'->eid->p_jeu, '[]'::jsonb);
  if coalesce(p_essai, '') = '' then
    nouv := true; p_essai := 'k' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
    l := l || jsonb_build_array(jsonb_build_object('id', p_essai, 'le', (extract(epoch from now()) * 1000)::bigint, 'par', 'chef', 'scores', '{}'::jsonb));
  elsif d->'retenus'->eid->>p_jeu = p_essai then raise exception 'essai retenu';
  end if;
  for s in select * from jsonb_array_elements(l) loop
    if s->>'id' = p_essai then
      trouve := true;
      if not nouv and p_cible is null and p_compte is null then continue; end if; -- suppression de l'essai
      if p_cible is not null then
        s := jsonb_set(s, '{scores}', case when p_compte is null then coalesce(s->'scores', '{}'::jsonb) - p_cible
                                          else coalesce(s->'scores', '{}'::jsonb) || jsonb_build_object(p_cible, p_compte) end);
      end if;
    end if;
    nl := nl || jsonb_build_array(s);
  end loop;
  if not trouve then raise exception 'essai introuvable'; end if;
  update docs set data = jsonb_set(data, '{essais}', coalesce(data->'essais', '{}'::jsonb)
      || jsonb_build_object(eid, coalesce(data->'essais'->eid, '{}'::jsonb) || jsonb_build_object(p_jeu, nl))), updated_at = now()
    where owner = p_owner and col = 'animations' and id = p_anim;
  return case when not nouv and p_cible is null and p_compte is null then null else p_essai end;
end $$;
revoke execute on function public.archer_anim_essai(uuid, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.archer_anim_essai(uuid, text, text, text, text, text, jsonb) to authenticated;
revoke execute on function public.anim_compte(jsonb, text, text) from public, anon;
revoke execute on function public.anim_points(jsonb, text, text) from public, anon;

-- Lecture des fichiers par les archers : reprend le script 8 et ajoute les règles des animations
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
  -- image d'un thème de fête (Paramètres › Général), visible par les archers si le thème leur est diffusé
  or exists (
    select 1 from acces a
    join docs p on p.owner = a.owner and p.col = 'parametres' and p.id = 'general'
    where a.user_id = auth.uid() and a.owner::text = split_part(p_name, '/', 1) and coalesce(p.data->>'fetesArchers', 'true') <> 'false'
      and split_part(p_name, '/', 2) in (coalesce(p.data#>>'{fetes,noel,image,assetId}', ''), coalesce(p.data#>>'{fetes,fetes,image,assetId}', '')) and split_part(p_name, '/', 2) <> '')
  -- image d'un thème créé par l'entraîneur (V.1.9 : Octobre rose, Movember, Mars bleu…)
  or exists (
    select 1 from acces a
    join docs p on p.owner = a.owner and p.col = 'parametres' and p.id = 'general' and jsonb_typeof(p.data#>'{fetes,perso}') = 'array'
    cross join lateral jsonb_array_elements(p.data#>'{fetes,perso}') t
    where a.user_id = auth.uid() and a.owner::text = split_part(p_name, '/', 1) and coalesce(p.data->>'fetesArchers', 'true') <> 'false'
      and t#>>'{image,assetId}' = split_part(p_name, '/', 2) and split_part(p_name, '/', 2) <> '')
  -- règles d'une animation (V.1.9, script 9) : pour le chef d'équipe, et pour les participants si l'animation leur est ouverte
  or exists (
    select 1 from acces a
    join docs n on n.owner = a.owner and n.col = 'animations'
    join docs d on d.owner = a.owner and d.col = 'documents' and d.data->>'assetId' = split_part(p_name, '/', 2)
      and (d.id = n.data->>'reglesDoc' or exists (select 1 from jsonb_array_elements(coalesce(n.data->'jeux', '[]'::jsonb)) j where j->>'regleDoc' = d.id))
    where a.user_id = auth.uid() and a.owner::text = split_part(p_name, '/', 1)
      and ((n.data->>'partage' = 'true' and coalesce(n.data->'participants', '[]'::jsonb) ? a.archer_id)
        or exists (select 1 from jsonb_array_elements(coalesce(n.data->'equipes', '[]'::jsonb)) e where e->>'chefId' = a.archer_id)))
$$;
