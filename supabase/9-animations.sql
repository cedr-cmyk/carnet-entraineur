-- 9. Animations (V.1.9) : espace archer pour les animations.
--   · un archer participant voit les scores et le classement d'une animation que l'entraîneur a ouverte aux archers ;
--   · un chef d'équipe voit l'animation dès qu'il est nommé et marque les points des archers de son équipe.
-- À exécuter une fois dans Supabase › SQL Editor, après les scripts 1 à 8 (relançable sans risque).
-- Les autres participants apparaissent avec leur prénom et l'initiale du nom.

create or replace function public.archer_animations(p_owner uuid, p_archer text) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'nom', d.data->>'nom', 'date', d.data->>'date', 'lieu', d.data->>'lieu', 'jeux', coalesce(d.data->'jeux', '[]'::jsonb),
      'classement', coalesce(d.data->>'classement', 'true') <> 'false',
      'partage', coalesce(d.data->>'partage', 'false') = 'true',
      'saisie', coalesce(d.data->>'saisieChefs', 'true') <> 'false',
      'equipes', coalesce((select jsonb_agg(jsonb_build_object('id', e->>'id', 'nom', e->>'nom', 'chefId', e->>'chefId', 'membres', coalesce(e->'membres', '[]'::jsonb)))
        from jsonb_array_elements(coalesce(d.data->'equipes', '[]'::jsonb)) e where jsonb_array_length(coalesce(e->'membres', '[]'::jsonb)) > 0), '[]'::jsonb),
      'participants', coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id, 'moi', p.id = p_archer, 'scores', coalesce(d.data->'scores'->p.id, '{}'::jsonb),
          'nom', trim(coalesce(p.data->>'prenom', '') || ' ' || case when coalesce(p.data->>'nom', '') <> '' then left(p.data->>'nom', 1) || '.' else '' end)))
        from docs p where p.owner = p_owner and p.col = 'archers' and d.data->'participants' ? p.id
          -- animation non ouverte à tous : le chef ne voit que son équipe
          and (d.data->>'partage' = 'true' or exists (select 1 from jsonb_array_elements(coalesce(d.data->'equipes', '[]'::jsonb)) e
                 where e->>'chefId' = p_archer and e->'membres' ? p.id))), '[]'::jsonb))
    order by d.data->>'date' desc)
    from docs d where d.owner = p_owner and d.col = 'animations'
      and ((d.data->>'partage' = 'true' and d.data->'participants' ? p_archer)
        or exists (select 1 from jsonb_array_elements(coalesce(d.data->'equipes', '[]'::jsonb)) e where e->>'chefId' = p_archer))), '[]'::jsonb);
end $$;
revoke execute on function public.archer_animations(uuid, text) from public, anon;
grant execute on function public.archer_animations(uuid, text) to authenticated;

-- Le chef d'équipe marque les points d'un archer de son équipe (p_compte = nombre de flèches par zone ; null = effacer)
create or replace function public.archer_anim_score(p_owner uuid, p_archer text, p_anim text, p_cible text, p_jeu text, p_compte jsonb) returns void language plpgsql security definer set search_path = public as $$
declare d jsonb; n int; x jsonb;
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  select data into d from docs where owner = p_owner and col = 'animations' and id = p_anim for update;
  if d is null then raise exception 'animation introuvable'; end if;
  if coalesce(d->>'saisieChefs', 'true') = 'false' then raise exception 'saisie fermee'; end if;
  if not exists (select 1 from jsonb_array_elements(coalesce(d->'equipes', '[]'::jsonb)) e where e->>'chefId' = p_archer and e->'membres' ? p_cible) then
    raise exception 'pas dans ton equipe'; end if;
  select jsonb_array_length(coalesce(j->'zones', '[]'::jsonb)) into n from jsonb_array_elements(coalesce(d->'jeux', '[]'::jsonb)) j where j->>'id' = p_jeu;
  if n is null then raise exception 'jeu introuvable'; end if;
  if p_compte is null or jsonb_typeof(p_compte) = 'null' then
    update docs set data = jsonb_set(data, array['scores', p_cible], coalesce(data->'scores'->p_cible, '{}'::jsonb) - p_jeu), updated_at = now()
      where owner = p_owner and col = 'animations' and id = p_anim and data->'scores' ? p_cible;
    return;
  end if;
  if jsonb_typeof(p_compte) <> 'array' or jsonb_array_length(p_compte) <> n then raise exception 'score invalide'; end if;
  for x in select * from jsonb_array_elements(p_compte) loop
    if jsonb_typeof(x) <> 'number' or (x#>>'{}')::numeric not between 0 and 99 or (x#>>'{}')::numeric <> trunc((x#>>'{}')::numeric) then raise exception 'score invalide'; end if;
  end loop;
  update docs set data = jsonb_set(data, '{scores}', coalesce(data->'scores', '{}'::jsonb)
      || jsonb_build_object(p_cible, coalesce(data->'scores'->p_cible, '{}'::jsonb) || jsonb_build_object(p_jeu, p_compte))), updated_at = now()
    where owner = p_owner and col = 'animations' and id = p_anim;
end $$;
revoke execute on function public.archer_anim_score(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.archer_anim_score(uuid, text, text, text, text, jsonb) to authenticated;
