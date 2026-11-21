-- V.1.10 : lien public (QR code) pour une animation, sans compte.
--  • lienPublic = { token, actif, scores } sur l'animation : quiconque a le lien voit l'animation (règles écrites, jeux, équipes, participants
--    en « Prénom N. ») et, si l'entraîneur l'a choisi, les scores finaux. Les points des zones ne sont jamais envoyés.
--  • equipes[].jeton : lien de saisie d'une équipe — la personne qui l'a compte les flèches de son équipe, comme un chef d'équipe.
--  • L'entraîneur coupe le lien quand il veut (actif = false) : les QR codes ne marchent plus.
-- À lancer une fois dans Supabase (SQL Editor), après le script 20. Peut être relancé sans risque. Ne change rien pour la 1.9.

create or replace function public.anim_public(p_token text, p_jeton text default null) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; e jsonb; jeux jsonb; eqs jsonb; parts jsonb; mon jsonb; ess jsonb; sc boolean;
begin
  if coalesce(length(p_token), 0) < 16 then return null; end if;
  select owner, id, data into r from docs where col = 'animations' and data->'lienPublic'->>'token' = p_token and data->'lienPublic'->>'actif' = 'true' limit 1;
  if not found then return null; end if;
  sc := coalesce(r.data->'lienPublic'->>'scores', 'true') <> 'false';
  if coalesce(length(p_jeton), 0) >= 16 then
    select q into e from jsonb_array_elements(coalesce(r.data->'equipes', '[]'::jsonb)) q where q->>'jeton' = p_jeton limit 1;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', j->>'id', 'nom', j->>'nom', 'regle', coalesce(j->>'regle', ''),
      'zones', (select coalesce(jsonb_agg(jsonb_build_object('nom', z->>'nom') order by i), '[]'::jsonb) from jsonb_array_elements(coalesce(j->'zones', '[]'::jsonb)) with ordinality t(z, i)))), '[]'::jsonb)
    into jeux from jsonb_array_elements(coalesce(r.data->'jeux', '[]'::jsonb)) j;
  select coalesce(jsonb_agg(jsonb_build_object('id', q->>'id', 'nom', q->>'nom', 'membres', q->'membres')), '[]'::jsonb)
    into eqs from jsonb_array_elements(coalesce(r.data->'equipes', '[]'::jsonb)) q where jsonb_array_length(coalesce(q->'membres', '[]'::jsonb)) > 0;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id,
      'nom', trim(coalesce(p.data->>'prenom', '') || ' ' || case when coalesce(p.data->>'nom', '') <> '' then left(p.data->>'nom', 1) || '.' else '' end),
      'scores', case when sc then (select coalesce(jsonb_object_agg(j->>'id', public.anim_points(r.data, p.id, j->>'id')), '{}'::jsonb) from jsonb_array_elements(coalesce(r.data->'jeux', '[]'::jsonb)) j) else '{}'::jsonb end)), '[]'::jsonb)
    into parts from docs p where p.owner = r.owner and p.col = 'archers' and coalesce(r.data->'participants', '[]'::jsonb) ? p.id;
  if e is not null then
    select coalesce(jsonb_object_agg(j->>'id', (select coalesce(jsonb_agg(jsonb_build_object('id', s->>'id', 'le', s->'le',
          'retenu', coalesce(r.data->'retenus'->(e->>'id')->>(j->>'id') = s->>'id', false),
          'choisi', coalesce(r.data->'choix'->(e->>'id')->>(j->>'id') = s->>'id', false), 'scores', coalesce(s->'scores', '{}'::jsonb)) order by k), '[]'::jsonb)
        from jsonb_array_elements(coalesce(r.data->'essais'->(e->>'id')->(j->>'id'), '[]'::jsonb)) with ordinality u(s, k))), '{}'::jsonb)
      into ess from jsonb_array_elements(coalesce(r.data->'jeux', '[]'::jsonb)) j;
    mon := jsonb_build_object('id', e->>'id', 'nom', e->>'nom', 'membres', coalesce(e->'membres', '[]'::jsonb), 'essais', ess);
  end if;
  return jsonb_build_object('nom', r.data->>'nom', 'date', r.data->>'date', 'lieu', r.data->>'lieu', 'regles', coalesce(r.data->>'regles', ''),
    'classement', coalesce(r.data->>'classement', 'true') <> 'false', 'scores', sc, 'saisie', coalesce(r.data->>'saisieChefs', 'true') <> 'false',
    'fleches', r.data->'fleches', 'jeux', jeux, 'equipes', eqs, 'participants', parts, 'monEquipe', mon, 'equipeInconnue', p_jeton is not null and e is null);
end $$;

-- Saisie d'une équipe par son lien (mêmes règles que le chef d'équipe : archer_anim_essai)
create or replace function public.anim_public_essai(p_token text, p_jeton text, p_jeu text, p_essai text, p_cible text, p_compte jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare r record; d jsonb; e jsonb; eid text; n int; l jsonb; nl jsonb := '[]'::jsonb; s jsonb; v jsonb; trouve boolean := false; nouv boolean := false;
begin
  if coalesce(length(p_token), 0) < 16 or coalesce(length(p_jeton), 0) < 16 then raise exception 'lien invalide'; end if;
  select owner, id into r from docs where col = 'animations' and data->'lienPublic'->>'token' = p_token and data->'lienPublic'->>'actif' = 'true' limit 1;
  if not found then raise exception 'lien invalide'; end if;
  select data into d from docs where owner = r.owner and col = 'animations' and id = r.id for update;
  if coalesce(d->>'saisieChefs', 'true') = 'false' then raise exception 'saisie fermee'; end if;
  select q into e from jsonb_array_elements(coalesce(d->'equipes', '[]'::jsonb)) q where q->>'jeton' = p_jeton limit 1;
  if e is null then raise exception 'lien invalide'; end if;
  eid := e->>'id';
  select jsonb_array_length(coalesce(j->'zones', '[]'::jsonb)) into n from jsonb_array_elements(coalesce(d->'jeux', '[]'::jsonb)) j where j->>'id' = p_jeu;
  if n is null then raise exception 'jeu introuvable'; end if;
  if p_cible = '@garder' then
    if not exists (select 1 from jsonb_array_elements(coalesce(d->'essais'->eid->p_jeu, '[]'::jsonb)) q where q->>'id' = p_essai) then raise exception 'essai introuvable'; end if;
    update docs set data = jsonb_set(data, '{choix}', coalesce(data->'choix', '{}'::jsonb)
        || jsonb_build_object(eid, coalesce(data->'choix'->eid, '{}'::jsonb) || jsonb_build_object(p_jeu, p_essai))), updated_at = now()
      where owner = r.owner and col = 'animations' and id = r.id;
    return p_essai;
  end if;
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
    if jsonb_array_length(l) >= 20 then raise exception 'trop de parties'; end if;
    nouv := true; p_essai := 'k' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
    l := l || jsonb_build_array(jsonb_build_object('id', p_essai, 'le', (extract(epoch from now()) * 1000)::bigint, 'par', 'lien', 'scores', '{}'::jsonb));
  elsif d->'retenus'->eid->>p_jeu = p_essai then raise exception 'essai retenu';
  end if;
  for s in select * from jsonb_array_elements(l) loop
    if s->>'id' = p_essai then
      trouve := true;
      if not nouv and p_cible is null and p_compte is null then continue; end if;
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
    where owner = r.owner and col = 'animations' and id = r.id;
  if not nouv and p_cible is null and p_compte is null then
    update docs set data = jsonb_set(data, array['choix', eid], coalesce(data->'choix'->eid, '{}'::jsonb) - p_jeu)
      where owner = r.owner and col = 'animations' and id = r.id and data->'choix'->eid->>p_jeu = p_essai;
  end if;
  return case when not nouv and p_cible is null and p_compte is null then null else p_essai end;
end $$;

revoke all on function public.anim_public(text, text), public.anim_public_essai(text, text, text, text, text, jsonb) from public;
grant execute on function public.anim_public(text, text), public.anim_public_essai(text, text, text, text, text, jsonb) to anon, authenticated;
