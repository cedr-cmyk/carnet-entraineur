-- V.1.10 : documents de chaque archer, gérés depuis sa fiche.
-- Un document partagé à tout un club peut être retiré pour un archer en particulier (partageExclus),
-- et un document peut être donné à un archer seul (partageArchers, déjà en place depuis la V.1.9).
-- À lancer une fois dans Supabase (SQL Editor), après le script 11. Peut être relancé sans risque.

create or replace function public.doc_partage_archer(p_doc jsonb, p_clubs jsonb, p_archer text) returns boolean language sql immutable as $$
  select (coalesce(jsonb_typeof(p_doc->'partageArchers') = 'array' and p_doc->'partageArchers' ? p_archer, false)
      or (coalesce(public.doc_partage(p_doc, p_clubs), false)
          and not coalesce(jsonb_typeof(p_doc->'partageExclus') = 'array' and p_doc->'partageExclus' ? p_archer, false)))
$$;
