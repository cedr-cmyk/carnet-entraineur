-- V.1.10 : infos programmées. L'entraîneur écrit une info maintenant et choisit le jour où elle apparaît chez les archers (publieLe).
-- Avant ce jour, elle reste dans son carnet (« programmée ») et n'est pas envoyée aux archers.
-- À lancer une fois dans Supabase (SQL Editor), après le script 12. Peut être relancé sans risque.
-- (Reprend la fonction espace_archer du script 6, avec ce seul changement sur les annonces.)

create or replace function public.espace_archer(p_owner uuid, p_archer text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ar jsonb; enc boolean; jour text := to_char(current_date, 'YYYY-MM-DD'); fin text := to_char(current_date + 42, 'YYYY-MM-DD');
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  select data into ar from docs where owner = p_owner and col = 'archers' and id = p_archer;
  enc := coalesce(ar->>'role', '') in ('encadrant', 'les-deux');
  return jsonb_build_object(
    'archer', jsonb_build_object('id', p_archer, 'prenom', ar->>'prenom', 'nom', ar->>'nom', 'arcs', ar->'arcs', 'clubIds', ar->'clubIds', 'federations', ar->'federations', 'role', coalesce(ar->>'role', 'archer'), 'avatar', ar->'avatar', 'espace', ar->'espace', 'naissance', ar->>'naissance'),
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
          'assetId', d.data->>'assetId', 'contentType', d.data->>'contentType', 'nomFichier', d.data->>'nomFichier', 'video', d.data->>'video') end))
      from docs t
      left join docs d on d.owner = t.owner and d.col = 'documents' and d.id = t.data->>'documentId'
      left join docs s on s.owner = t.owner and s.col = 'seances' and s.id = t.data->>'seanceId'
      where t.owner = p_owner and t.col = 'attributions' and t.data->>'archerId' = p_archer and t.data->>'visible' = 'true'), '[]'::jsonb),
    -- mots libres de l'entraîneur (V.1.8) : l'archer répond ou archive
    'mots', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'date', data->>'date', 'texte', data->>'texte', 'reponse', coalesce(data->>'reponse', ''), 'reponseLe', data->'reponseLe',
        'archive', coalesce(data->>'archive', 'false') = 'true') order by data->>'date' desc) from docs
      where owner = p_owner and col = 'mots' and data->>'archerId' = p_archer), '[]'::jsonb),
    'evaluations', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'date', data->>'date', 'notes', data->'notes', 'observation', data->>'observation')) from docs
      where owner = p_owner and col = 'evaluations' and data->>'archerId' = p_archer and data->>'partage' = 'true'), '[]'::jsonb),
    -- réglages des profils choisis par l'entraîneur (Paramètres › Espace archers)
    'reglagesEspace', coalesce((select jsonb_build_object('profils', data->'profils', 'age', data->'profilAge', 'defaut', data->'profilDefaut', 'noms', data->'profilNoms',
        'perso', data->'profilsPerso', 'regles', data->'reglesAuto', 'sinon', data->'profilSinon', 'archives', data->'saisonsArchivees',
        'fetes', case when data->'fetesArchers' = 'false'::jsonb then null else data->'fetes' end, 'fetesMessage', coalesce(data->'fetesMessage', 'true'::jsonb) <> 'false'::jsonb, 'fetesAnim', coalesce(data->'fetesAnim', 'true'::jsonb) <> 'false'::jsonb,
        -- valeurs proposées pour un nouveau tir (Paramètres › Séances), par fédération
        'tir', jsonb_build_object('base', jsonb_build_object('distance', data->'distance', 'blason', data->'blason', 'fpv', data->'fpv', 'nbVolees', data->'nbVolees'), 'fed', data->'fed')) from docs
      where owner = p_owner and col = 'parametres' and id = 'general'), '{}'::jsonb),
    -- séances du club où l'archer a été pointé présent (journal, sans compteur), avec les titres des fiches travaillées
    'seances', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'date', s.data->>'date', 'heure', s.data->>'heure', 'groupe', s.data->>'groupe', 'theme', s.data->>'theme',
        'lieu', s.data->>'lieu', 'clubId', s.data->>'clubId',
        'exercices', coalesce((select jsonb_agg(d.data->>'titre') from jsonb_array_elements_text(case when jsonb_typeof(s.data->'exercices') = 'array' then s.data->'exercices' else '[]'::jsonb end) x
          join docs d on d.owner = s.owner and d.col = 'documents' and d.id = x), '[]'::jsonb)) order by s.data->>'date' desc)
      from docs s where s.owner = p_owner and s.col = 'seances' and jsonb_typeof(s.data->'presents') = 'array' and s.data->'presents' ? p_archer
        and s.data->>'date' <= to_char(current_date, 'YYYY-MM-DD')), '[]'::jsonb),
    -- infos importantes du club (sans club coché = tous les clubs), tant qu'elles ne sont pas expirées
    'annonces', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'titre', data->>'titre', 'texte', data->>'texte', 'date', data->>'date', 'jusquau', data->>'jusquau', 'clubIds', data->'clubIds', 'important', data->'important'))
      from docs where owner = p_owner and col = 'annonces' and (coalesce(data->>'jusquau', '') = '' or data->>'jusquau' >= jour) and coalesce(data->>'publieLe', '') <= jour
        and (jsonb_typeof(data->'clubIds') is distinct from 'array' or jsonb_array_length(data->'clubIds') = 0
          or exists (select 1 from jsonb_array_elements_text(data->'clubIds') x where coalesce(ar->'clubIds', '[]'::jsonb) ? x))), '[]'::jsonb),
    -- documents partagés avec tout le club (calendrier des concours, règlement…)
    'documents', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'titre', data->>'titre', 'description', data->>'description', 'assetId', data->>'assetId',
        'contentType', data->>'contentType', 'nomFichier', data->>'nomFichier', 'video', data->>'video', 'partageLe', data->'partageLe'))
      from docs where owner = p_owner and col = 'documents' and doc_partage_archer(data, ar->'clubIds', p_archer)), '[]'::jsonb),
    -- entraînements proposés des 6 prochaines semaines, avec la réponse de l'archer ; les encadrants voient aussi qui vient
    'entrainements', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'date', s.data->>'date', 'heure', s.data->>'heure', 'groupe', s.data->>'groupe',
        'theme', s.data->>'theme', 'lieu', s.data->>'lieu', 'clubId', s.data->>'clubId', 'public', s.data->>'public',
        'reponse', (select r.data->>'reponse' from docs r where r.owner = p_owner and r.col = 'reponses' and r.id = 'r_' || s.id || '_' || p_archer),
        'presents', case when enc then coalesce((select jsonb_agg(trim(coalesce(a.data->>'prenom', '') || ' ' || coalesce(a.data->>'nom', '')) order by a.data->>'nom', a.data->>'prenom')
          from docs r join docs a on a.owner = r.owner and a.col = 'archers' and a.id = r.data->>'archerId'
          where r.owner = p_owner and r.col = 'reponses' and r.data->>'seanceId' = s.id and r.data->>'reponse' = 'present'), '[]'::jsonb) end,
        'absents', case when enc then coalesce((select jsonb_agg(trim(coalesce(a.data->>'prenom', '') || ' ' || coalesce(a.data->>'nom', '')) order by a.data->>'nom', a.data->>'prenom')
          from docs r join docs a on a.owner = r.owner and a.col = 'archers' and a.id = r.data->>'archerId'
          where r.owner = p_owner and r.col = 'reponses' and r.data->>'seanceId' = s.id and r.data->>'reponse' = 'absent'), '[]'::jsonb) end,
        -- parmi les présents, ceux qui encadrent ; et combien de personnes concernées n'ont pas encore répondu
        'presentsEnc', case when enc then coalesce((select jsonb_agg(trim(coalesce(a.data->>'prenom', '') || ' ' || coalesce(a.data->>'nom', '')))
          from docs r join docs a on a.owner = r.owner and a.col = 'archers' and a.id = r.data->>'archerId'
          where r.owner = p_owner and r.col = 'reponses' and r.data->>'seanceId' = s.id and r.data->>'reponse' = 'present' and coalesce(a.data->>'role', '') in ('encadrant', 'les-deux')), '[]'::jsonb) end,
        'sansReponse', case when enc then (select count(*) from docs a where a.owner = p_owner and a.col = 'archers' and coalesce(a.data->>'actif', '') <> 'false' and seance_pour(s.data, a.data)
          and not exists (select 1 from docs r where r.owner = p_owner and r.col = 'reponses' and r.id = 'r_' || s.id || '_' || a.id)) end)
        order by s.data->>'date', s.data->>'heure')
      from docs s where s.owner = p_owner and s.col = 'seances' and seance_pour(s.data, ar) and s.data->>'date' >= jour and s.data->>'date' <= fin), '[]'::jsonb));
end $$;
grant execute on function public.espace_archer(uuid, text) to authenticated;
