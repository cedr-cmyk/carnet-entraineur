-- 7. Liaison avec Canva (V.1.9) : l'appli récupère elle-même le PDF à jour des fiches Canva choisies par l'entraîneur
--    et le range dans l'onglet Documents. Les jetons Canva restent sur le serveur : ni l'appli ni les archers n'y ont accès.
-- À exécuter une fois dans Supabase › SQL Editor, après les scripts 1 à 6 (relançable sans risque).
-- La fonction « canva » (supabase/functions/canva) doit aussi être déployée : voir le guide d'installation.

-- Jetons de connexion à Canva, un par entraîneur. Lus et écrits uniquement par la fonction « canva » (clé de service).
create table if not exists public.canva_lien (
  owner uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  access_token text,
  expire_le timestamptz,
  connecte_le timestamptz not null default now(),
  nom text
);
alter table public.canva_lien enable row level security;
-- aucune règle d'accès : seuls les programmes du serveur (clé de service) passent

-- Connexions en cours (quelques minutes, le temps de valider chez Canva)
create table if not exists public.canva_oauth (
  state text primary key,
  owner uuid not null references auth.users(id) on delete cascade,
  verifier text not null,
  retour text,
  cree_le timestamptz not null default now()
);
alter table public.canva_oauth enable row level security;

-- L'appli peut savoir si l'entraîneur est relié à Canva, sans jamais voir les jetons
create or replace function public.canva_etat() returns jsonb language sql stable security definer set search_path = public as $$
  select case when not public.est_coach() then null else
    coalesce((select jsonb_build_object('connecte', true, 'depuis', connecte_le, 'nom', nom) from canva_lien where owner = auth.uid()),
      jsonb_build_object('connecte', false)) end
$$;
revoke execute on function public.canva_etat() from public, anon;
grant execute on function public.canva_etat() to authenticated;
