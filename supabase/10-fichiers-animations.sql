-- 10. PDF et images des règles d'animation (V.1.9) : le chef d'équipe, et les archers autorisés, peuvent ouvrir ces fichiers.
-- À exécuter à la sortie de la 1.9, APRÈS les scripts 6, 8 et 9 (relançable sans risque).
-- Il remplace la règle de lecture des fichiers par celle du script 8, en y ajoutant les règles des animations :
-- ne pas le lancer avant le script 6, sinon les archers pourraient lire certains fichiers de la 1.8 trop tôt.

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
      and ((n.data->>'partage' = 'true' and coalesce(n.data->'participants', '[]'::jsonb) ? a.archer_id and public.anim_autorise(a.owner, a.archer_id))
        or exists (select 1 from jsonb_array_elements(coalesce(n.data->'equipes', '[]'::jsonb)) e where e->>'chefId' = a.archer_id)
        or (exists (select 1 from jsonb_array_elements(coalesce(n.data->'equipes', '[]'::jsonb)) e where coalesce(e->'membres', '[]'::jsonb) ? a.archer_id) and public.anim_autorise(a.owner, a.archer_id))))
$$;
