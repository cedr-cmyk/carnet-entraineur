-- 8. Thèmes créés par l'entraîneur (V.1.9) : les archers peuvent voir l'image (bannière) de ces thèmes, comme pour Noël et les fêtes.
--    Les thèmes eux-mêmes passent déjà par l'espace des archers (réglage « fetes ») : seule la lecture des images change.
-- À exécuter une fois dans Supabase › SQL Editor, APRÈS le script 6 (relançable sans risque).

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
$$;
