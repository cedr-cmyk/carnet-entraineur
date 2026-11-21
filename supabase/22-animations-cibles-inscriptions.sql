-- V.1.10 : animations sans l'appli, suite du script 21.
--  • Saisie par cible : cibles = [{id, nom, membres, jeton, marqueurId}] ; le QR d'une cible permet de compter les flèches de ceux qui y tirent.
--  • Marqueur d'équipe (marqueurId) : la personne de l'équipe qui a le QR, affichée sur la page.
--  • Inscription sur place : si lienPublic.inscription est coché, chacun s'ajoute lui-même aux invités depuis la page du QR code.
-- À lancer une fois dans Supabase (SQL Editor), après le script 21. Peut être relancé sans risque. Ne change rien pour la 1.9.

create or replace function public.anim_public(p_token text, p_jeton text default null) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r record; e jsonb; c jsonb; jeux jsonb; eqs jsonb; parts jsonb; mon jsonb; cib jsonb; ess jsonb; sc boolean; grps jsonb;
begin
  if coalesce(length(p_token), 0) < 16 then return null; end if;
  select owner, id, data into r from docs where col = 'animations' and data->'lienPublic'->>'token' = p_token and data->'lienPublic'->>'actif' = 'true' limit 1;
  if not found then return null; end if;
  sc := coalesce(r.data->'lienPublic'->>'scores', 'true') <> 'false';
  if coalesce(length(p_jeton), 0) >= 16 then
    select q into e from jsonb_array_elements(coalesce(r.data->'equipes', '[]'::jsonb)) q where q->>'jeton' = p_jeton limit 1;
    if e is null then select q into c from jsonb_array_elements(coalesce(r.data->'cibles', '[]'::jsonb)) q where q->>'jeton' = p_jeton limit 1; end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', j->>'id', 'nom', j->>'nom', 'regle', coalesce(j->>'regle', ''),
      'zones', (select coalesce(jsonb_agg(jsonb_build_object('nom', z->>'nom') order by i), '[]'::jsonb) from jsonb_array_elements(coalesce(j->'zones', '[]'::jsonb)) with ordinality t(z, i)))), '[]'::jsonb)
    into jeux from jsonb_array_elements(coalesce(r.data->'jeux', '[]'::jsonb)) j;
  select coalesce(jsonb_agg(jsonb_build_object('id', q->>'id', 'nom', q->>'nom', 'membres', q->'membres', 'marqueur', q->>'marqueurId')), '[]'::jsonb)
    into eqs from jsonb_array_elements(coalesce(r.data->'equipes', '[]'::jsonb)) q where jsonb_array_length(coalesce(q->'membres', '[]'::jsonb)) > 0;
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'groupe', p.grp,
      'nom', trim(coalesce(p.data->>'prenom', '') || ' ' || case when coalesce(p.data->>'nom', '') <> '' then left(p.data->>'nom', 1) || '.' else '' end),
      'scores', case when sc then (select coalesce(jsonb_object_agg(j->>'id', public.anim_points(r.data, p.id, j->>'id')), '{}'::jsonb) from jsonb_array_elements(coalesce(r.data->'jeux', '[]'::jsonb)) j) else '{}'::jsonb end)), '[]'::jsonb)
    into parts from (select a.id, a.data, 'Archers du club' as grp from docs a where a.owner = r.owner and a.col = 'archers'
                     union all select g->>'id', g, coalesce(nullif(g->>'groupe', ''), 'Invités') from jsonb_array_elements(coalesce(r.data->'invites', '[]'::jsonb)) g where coalesce(g->>'id', '') <> '') p
    where coalesce(r.data->'participants', '[]'::jsonb) ? p.id;
  if e is not null then
    select coalesce(jsonb_object_agg(j->>'id', (select coalesce(jsonb_agg(jsonb_build_object('id', s->>'id', 'le', s->'le',
          'retenu', coalesce(r.data->'retenus'->(e->>'id')->>(j->>'id') = s->>'id', false),
          'choisi', coalesce(r.data->'choix'->(e->>'id')->>(j->>'id') = s->>'id', false), 'scores', coalesce(s->'scores', '{}'::jsonb)) order by k), '[]'::jsonb)
        from jsonb_array_elements(coalesce(r.data->'essais'->(e->>'id')->(j->>'id'), '[]'::jsonb)) with ordinality u(s, k))), '{}'::jsonb)
      into ess from jsonb_array_elements(coalesce(r.data->'jeux', '[]'::jsonb)) j;
    mon := jsonb_build_object('id', e->>'id', 'nom', e->>'nom', 'membres', coalesce(e->'membres', '[]'::jsonb), 'marqueur', e->>'marqueurId', 'essais', ess);
  end if;
  -- saisie par cible (sans équipe) : les flèches comptées de chacun, jeu par jeu
  if c is not null then
    cib := jsonb_build_object('id', c->>'id', 'nom', c->>'nom', 'membres', coalesce(c->'membres', '[]'::jsonb), 'marqueur', c->>'marqueurId',
      'scores', (select coalesce(jsonb_object_agg(m, coalesce(r.data->'scores'->m, '{}'::jsonb)), '{}'::jsonb) from jsonb_array_elements_text(coalesce(c->'membres', '[]'::jsonb)) m));
  end if;
  select coalesce(jsonb_agg(distinct g->>'groupe'), '[]'::jsonb) into grps from jsonb_array_elements(coalesce(r.data->'invites', '[]'::jsonb)) g where coalesce(g->>'groupe', '') <> '';
  return jsonb_build_object('nom', r.data->>'nom', 'date', r.data->>'date', 'lieu', r.data->>'lieu', 'regles', coalesce(r.data->>'regles', ''),
    'classement', coalesce(r.data->>'classement', 'true') <> 'false', 'scores', sc, 'saisie', coalesce(r.data->>'saisieChefs', 'true') <> 'false',
    'fleches', r.data->'fleches', 'jeux', jeux, 'equipes', eqs, 'participants', parts, 'monEquipe', mon, 'maCible', cib, 'equipeInconnue', p_jeton is not null and e is null and c is null,
    'inscription', coalesce(r.data->'lienPublic'->>'inscription', 'false') = 'true', 'groupes', grps);
end $$;

-- Cible : compter les flèches d'un participant de la cible, sur un jeu (p_compte null = effacer)
create or replace function public.anim_public_cible(p_token text, p_jeton text, p_jeu text, p_cible text, p_compte jsonb) returns void language plpgsql security definer set search_path = public as $$
declare r record; d jsonb; c jsonb; n int; v jsonb;
begin
  if coalesce(length(p_token), 0) < 16 or coalesce(length(p_jeton), 0) < 16 then raise exception 'lien invalide'; end if;
  select owner, id into r from docs where col = 'animations' and data->'lienPublic'->>'token' = p_token and data->'lienPublic'->>'actif' = 'true' limit 1;
  if not found then raise exception 'lien invalide'; end if;
  select data into d from docs where owner = r.owner and col = 'animations' and id = r.id for update;
  if coalesce(d->>'saisieChefs', 'true') = 'false' then raise exception 'saisie fermee'; end if;
  select q into c from jsonb_array_elements(coalesce(d->'cibles', '[]'::jsonb)) q where q->>'jeton' = p_jeton limit 1;
  if c is null then raise exception 'lien invalide'; end if;
  if not coalesce(c->'membres', '[]'::jsonb) ? p_cible then raise exception 'pas sur cette cible'; end if;
  select jsonb_array_length(coalesce(j->'zones', '[]'::jsonb)) into n from jsonb_array_elements(coalesce(d->'jeux', '[]'::jsonb)) j where j->>'id' = p_jeu;
  if n is null then raise exception 'jeu introuvable'; end if;
  if p_compte is not null and jsonb_typeof(p_compte) = 'null' then p_compte := null; end if;
  if p_compte is not null then
    if jsonb_typeof(p_compte) <> 'array' or jsonb_array_length(p_compte) <> n then raise exception 'score invalide'; end if;
    for v in select * from jsonb_array_elements(p_compte) loop
      if jsonb_typeof(v) <> 'number' or (v#>>'{}')::numeric not between 0 and 99 or (v#>>'{}')::numeric <> trunc((v#>>'{}')::numeric) then raise exception 'score invalide'; end if;
    end loop;
    if jsonb_typeof(d->'fleches') = 'number' and (select sum((v2#>>'{}')::numeric) from jsonb_array_elements(p_compte) v2) > (d->>'fleches')::numeric then raise exception 'trop de fleches'; end if;
    update docs set data = jsonb_set(data, '{scores}', coalesce(data->'scores', '{}'::jsonb) || jsonb_build_object(p_cible, coalesce(data->'scores'->p_cible, '{}'::jsonb) || jsonb_build_object(p_jeu, p_compte))), updated_at = now()
      where owner = r.owner and col = 'animations' and id = r.id;
  else
    update docs set data = jsonb_set(data, array['scores', p_cible], coalesce(data->'scores'->p_cible, '{}'::jsonb) - p_jeu), updated_at = now()
      where owner = r.owner and col = 'animations' and id = r.id and data->'scores' ? p_cible;
  end if;
end $$;

-- Inscription sur place : la personne s'ajoute aux invités (et aux participants). Renvoie son identifiant.
create or replace function public.anim_public_inscrire(p_token text, p_prenom text, p_nom text, p_groupe text) returns text language plpgsql security definer set search_path = public as $$
declare r record; d jsonb; gid text; pr text := left(btrim(coalesce(p_prenom, '')), 40); nm text := left(btrim(coalesce(p_nom, '')), 40); gr text := left(btrim(coalesce(p_groupe, '')), 40);
begin
  if coalesce(length(p_token), 0) < 16 then raise exception 'lien invalide'; end if;
  select owner, id into r from docs where col = 'animations' and data->'lienPublic'->>'token' = p_token and data->'lienPublic'->>'actif' = 'true'
    and data->'lienPublic'->>'inscription' = 'true' limit 1;
  if not found then raise exception 'inscriptions fermees'; end if;
  if length(pr) < 1 then raise exception 'prenom manquant'; end if;
  select data into d from docs where owner = r.owner and col = 'animations' and id = r.id for update;
  if jsonb_array_length(coalesce(d->'invites', '[]'::jsonb)) >= 400 then raise exception 'complet'; end if;
  gid := 'g' || substr(md5(random()::text || clock_timestamp()::text), 1, 10);
  update docs set data = data || jsonb_build_object(
      'invites', coalesce(data->'invites', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('id', gid, 'prenom', pr, 'nom', nm, 'groupe', gr, 'inscrit', true)),
      'participants', coalesce(data->'participants', '[]'::jsonb) || jsonb_build_array(gid)), updated_at = now()
    where owner = r.owner and col = 'animations' and id = r.id;
  return gid;
end $$;

revoke all on function public.anim_public(text, text), public.anim_public_cible(text, text, text, text, jsonb), public.anim_public_inscrire(text, text, text, text) from public;
grant execute on function public.anim_public(text, text), public.anim_public_cible(text, text, text, text, jsonb), public.anim_public_inscrire(text, text, text, text) to anon, authenticated;
