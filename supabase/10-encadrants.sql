-- V.1.10 : accès des encadrants et animateurs au carnet de l'entraîneur.
-- L'entraîneur donne un accès à une adresse mail (Paramètres › Accès). La personne crée son compte avec cette adresse,
-- confirme son mail, et arrive dans le carnet de l'entraîneur, limité aux clubs et aux droits choisis.
-- À lancer une fois dans Supabase (SQL Editor), après les scripts 1 à 9. Peut être relancé sans risque.

create table if not exists public.encadrants (
  owner uuid not null references auth.users(id) on delete cascade,      -- l'entraîneur (propriétaire du carnet)
  email text not null,                                                    -- adresse de l'encadrant, en minuscules
  uid uuid references auth.users(id) on delete set null,                  -- son compte, rattaché à sa première connexion
  nom text not null default '',
  droits jsonb not null default '{}'::jsonb,                              -- { clubs: [ids], seances: non|voir|noter, archers: non|voir|modifier }
  actif boolean not null default true,
  vu_le timestamptz,                                                      -- dernière ouverture du carnet
  created_at timestamptz not null default now(),
  primary key (owner, email));
create index if not exists encadrants_uid on public.encadrants (uid);
alter table public.encadrants enable row level security;
revoke all on public.encadrants from anon;
grant select, insert, update, delete on public.encadrants to authenticated;
drop policy if exists "entraineur gere ses encadrants" on public.encadrants;
create policy "entraineur gere ses encadrants" on public.encadrants for all to authenticated
  using (owner = auth.uid() and public.est_coach())
  with check (owner = auth.uid() and public.est_coach() and email = lower(trim(email)) and email <> '');

-- À la connexion : la personne est-elle encadrant d'un carnet ? (adresse confirmée obligatoire)
create or replace function public.mon_encadrement() returns jsonb language plpgsql security definer set search_path = public as $$
declare e text; r public.encadrants;
begin
  if auth.uid() is null then return null; end if;
  select lower(email) into e from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if e is null then return null; end if;
  update public.encadrants set uid = auth.uid() where email = e and uid is null;
  select * into r from public.encadrants where uid = auth.uid() and actif order by created_at limit 1;
  if not found then return null; end if;
  update public.encadrants set vu_le = now() where owner = r.owner and email = r.email;
  return jsonb_build_object('owner', r.owner, 'nom', r.nom, 'droits', r.droits,
    'entraineur', coalesce((select data->>'nom' from public.docs where owner = r.owner and col = 'parametres' and id = 'general'), ''));
end $$;
revoke all on function public.mon_encadrement() from public, anon;
grant execute on function public.mon_encadrement() to authenticated;

-- Droits de l'encadrant connecté sur un carnet (null = pas encadrant de ce carnet, ou accès suspendu)
create or replace function public.enc_droits(p_owner uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select droits from public.encadrants where uid = auth.uid() and owner = p_owner and actif limit 1 $$;

-- Un archer appartient-il à l'un des clubs autorisés ?
create or replace function public.enc_archer_ok(p_owner uuid, d jsonb, p_archer text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.docs a where a.owner = p_owner and a.col = 'archers' and a.id = p_archer
    and exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(a.data->'clubIds') = 'array' then a.data->'clubIds' else '[]'::jsonb end) c
                where coalesce(d->'clubs', '[]'::jsonb) ? c)) $$;

-- Ce que l'encadrant peut lire (p_ecrire = false) ou enregistrer / supprimer (p_ecrire = true) dans le carnet
create or replace function public.enc_peut(p_owner uuid, p_col text, p_id text, p_data jsonb, p_ecrire boolean) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare d jsonb; cl jsonb; s text; a text; voir_s boolean; noter_s boolean; voir_a boolean; modif_a boolean;
begin
  if auth.uid() is null or p_owner = auth.uid() then return false; end if;
  d := public.enc_droits(p_owner);
  if d is null then return false; end if;
  cl := case when jsonb_typeof(d->'clubs') = 'array' then d->'clubs' else '[]'::jsonb end;
  s := coalesce(d->>'seances', 'non'); a := coalesce(d->>'archers', 'non');
  voir_s := s in ('voir', 'noter'); noter_s := s = 'noter';
  voir_a := a in ('voir', 'modifier'); modif_a := a = 'modifier';
  if p_col = 'clubs' then return not p_ecrire and cl ? p_id;
  elsif p_col = 'parametres' then return not p_ecrire and p_id = 'general';
  elsif p_col in ('documents', 'dossiers', 'fiches') then return not p_ecrire;
  elsif p_col = 'seances' then
    return coalesce(cl ? (p_data->>'clubId'), false) and (case when p_ecrire then noter_s else voir_s end);
  elsif p_col = 'reponses' then
    return not p_ecrire and voir_s and exists (select 1 from public.docs x where x.owner = p_owner and x.col = 'seances' and x.id = p_data->>'seanceId' and cl ? (x.data->>'clubId'));
  elsif p_col = 'archers' then
    return (case when p_ecrire then modif_a else (voir_a or voir_s) end)
      and exists (select 1 from jsonb_array_elements_text(case when jsonb_typeof(p_data->'clubIds') = 'array' then p_data->'clubIds' else '[]'::jsonb end) c where cl ? c);
  elsif p_col in ('carnetEntrees', 'evaluations') then
    return (case when p_ecrire then (modif_a or noter_s) else (voir_a or voir_s) end) and public.enc_archer_ok(p_owner, d, p_data->>'archerId');
  elsif p_col in ('carnets', 'attributions') then
    return (case when p_ecrire then modif_a else voir_a end) and public.enc_archer_ok(p_owner, d, p_data->>'archerId');
  elsif p_col = 'concours' then return not p_ecrire and voir_a;
  end if;
  return false;
end $$;
revoke all on function public.enc_droits(uuid), public.enc_archer_ok(uuid, jsonb, text), public.enc_peut(uuid, text, text, jsonb, boolean) from public, anon;
grant execute on function public.enc_droits(uuid), public.enc_archer_ok(uuid, jsonb, text), public.enc_peut(uuid, text, text, jsonb, boolean) to authenticated;

drop policy if exists "encadrant lit" on public.docs;
drop policy if exists "encadrant ajoute" on public.docs;
drop policy if exists "encadrant modifie" on public.docs;
drop policy if exists "encadrant supprime" on public.docs;
create policy "encadrant lit" on public.docs for select to authenticated using (public.enc_peut(owner, col, id, data, false));
create policy "encadrant ajoute" on public.docs for insert to authenticated with check (public.enc_peut(owner, col, id, data, true));
create policy "encadrant modifie" on public.docs for update to authenticated using (public.enc_peut(owner, col, id, data, true)) with check (public.enc_peut(owner, col, id, data, true));
create policy "encadrant supprime" on public.docs for delete to authenticated using (public.enc_peut(owner, col, id, data, true));

-- Fichiers du carnet (documents, images) : lecture seule pour un encadrant actif
create or replace function public.enc_peut_lire_fichier(p_name text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.encadrants e where e.uid = auth.uid() and e.actif and e.owner::text = split_part(p_name, '/', 1)) $$;
revoke all on function public.enc_peut_lire_fichier(text) from public, anon;
grant execute on function public.enc_peut_lire_fichier(text) to authenticated;
drop policy if exists "fichiers des encadrants" on storage.objects;
create policy "fichiers des encadrants" on storage.objects for select to authenticated
  using (bucket_id = 'fichiers' and public.enc_peut_lire_fichier(name));
