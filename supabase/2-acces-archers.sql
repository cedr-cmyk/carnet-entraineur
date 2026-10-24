-- 2. Accès des archers à leur espace
-- À exécuter une fois dans Supabase › SQL Editor (il peut être relancé sans risque).
-- L'entraîneur est le premier compte créé. Un archer (ou un parent) ne lit que ce que les fonctions ci-dessous lui renvoient.

-- L'entraîneur ------------------------------------------------------------
create table if not exists public.coach (uid uuid primary key references auth.users(id) on delete cascade);
alter table public.coach enable row level security;
insert into public.coach (uid) select id from auth.users order by created_at limit 1 on conflict do nothing;
create or replace function public.est_coach() returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from coach where uid = auth.uid()) $$;

-- Seul l'entraîneur lit et écrit directement le carnet et les fichiers
drop policy if exists "mes donnees" on public.docs;
drop policy if exists "carnet entraineur" on public.docs;
create policy "carnet entraineur" on public.docs for all to authenticated
  using (owner = auth.uid() and public.est_coach()) with check (owner = auth.uid() and public.est_coach());
drop policy if exists "mes fichiers" on storage.objects;
drop policy if exists "fichiers entraineur" on storage.objects;
create policy "fichiers entraineur" on storage.objects for all to authenticated
  using (bucket_id = 'fichiers' and (storage.foldername(name))[1] = auth.uid()::text and public.est_coach())
  with check (bucket_id = 'fichiers' and (storage.foldername(name))[1] = auth.uid()::text and public.est_coach());

-- Invitations et accès ----------------------------------------------------
create table if not exists public.invitations (
  code text primary key, owner uuid not null references auth.users(id) on delete cascade, archer_id text not null,
  created_at timestamptz not null default now(), used_by uuid references auth.users(id) on delete set null, used_at timestamptz);
create table if not exists public.acces (
  user_id uuid not null references auth.users(id) on delete cascade, owner uuid not null references auth.users(id) on delete cascade,
  archer_id text not null, created_at timestamptz not null default now(), primary key (user_id, owner, archer_id));
alter table public.invitations enable row level security;
alter table public.acces enable row level security;

create or replace function public.creer_invitation(p_archer text) returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not est_coach() then raise exception 'reserve a l''entraineur'; end if;
  c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  insert into invitations (code, owner, archer_id) values (c, auth.uid(), p_archer);
  return c;
end $$;

create or replace function public.utiliser_invitation(p_code text) returns text language plpgsql security definer set search_path = public as $$
declare i invitations;
begin
  select * into i from invitations where code = upper(trim(p_code)) and used_by is null;
  if not found then raise exception 'code invalide ou deja utilise'; end if;
  insert into acces (user_id, owner, archer_id) values (auth.uid(), i.owner, i.archer_id) on conflict do nothing;
  update invitations set used_by = auth.uid(), used_at = now() where code = i.code;
  return i.archer_id;
end $$;

create or replace function public.acces_archer(p_archer text) returns jsonb language sql security definer set search_path = public as $$
  select case when not est_coach() then null else jsonb_build_object(
    'acces', coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'email', u.email, 'depuis', a.created_at) order by a.created_at)
      from acces a join auth.users u on u.id = a.user_id where a.owner = auth.uid() and a.archer_id = p_archer), '[]'::jsonb),
    'codes', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'cree', created_at) order by created_at)
      from invitations where owner = auth.uid() and archer_id = p_archer and used_by is null), '[]'::jsonb)) end
$$;

create or replace function public.retirer_acces(p_user uuid, p_archer text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not est_coach() then raise exception 'reserve a l''entraineur'; end if;
  delete from acces where owner = auth.uid() and archer_id = p_archer and (p_user is null or user_id = p_user);
  if p_user is null then delete from invitations where owner = auth.uid() and archer_id = p_archer and used_by is null; end if;
end $$;

-- Espace de l'archer ------------------------------------------------------
create or replace function public.mes_acces() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('owner', a.owner, 'archer_id', a.archer_id,
    'prenom', d.data->>'prenom', 'nom', d.data->>'nom')), '[]'::jsonb)
  from acces a left join docs d on d.owner = a.owner and d.col = 'archers' and d.id = a.archer_id
  where a.user_id = auth.uid()
$$;

create or replace function public.espace_archer(p_owner uuid, p_archer text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ar jsonb;
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  select data into ar from docs where owner = p_owner and col = 'archers' and id = p_archer;
  return jsonb_build_object(
    'archer', jsonb_build_object('id', p_archer, 'prenom', ar->>'prenom', 'nom', ar->>'nom', 'arcs', ar->'arcs', 'clubIds', ar->'clubIds', 'federations', ar->'federations'),
    'clubs', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nom', data->>'nom', 'couleur', data->>'couleur'))
      from docs where owner = p_owner and col = 'clubs' and ar->'clubIds' ? id), '[]'::jsonb),
    'entrees', coalesce((select jsonb_agg(data || jsonb_build_object('id', id)) from docs
      where owner = p_owner and col = 'carnetEntrees' and data->>'archerId' = p_archer), '[]'::jsonb),
    'carnets', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'saison', data->>'saison', 'objectifs', data->'objectifs', 'dates', data->'dates')) from docs
      where owner = p_owner and col = 'carnets' and data->>'archerId' = p_archer), '[]'::jsonb),
    'concours', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nom', data->>'nom', 'lieu', data->>'lieu', 'date', data->>'date', 'dateFin', data->>'dateFin',
        'types', data->'types', 'federation', data->>'federation', 'resultat', data->'resultats'->p_archer)) from docs
      where owner = p_owner and col = 'concours' and jsonb_typeof(data->'resultats'->p_archer) = 'object'), '[]'::jsonb),
    'exercices', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'remarque', t.data->>'remarque', 'fait', t.data->'fait', 'seanceId', t.data->>'seanceId',
        'date', s.data->>'date', 'createdAt', t.data->'createdAt',
        'document', case when d.id is null then null else jsonb_build_object('id', d.id, 'titre', d.data->>'titre', 'description', d.data->>'description',
          'assetId', d.data->>'assetId', 'contentType', d.data->>'contentType', 'nomFichier', d.data->>'nomFichier') end))
      from docs t
      left join docs d on d.owner = t.owner and d.col = 'documents' and d.id = t.data->>'documentId'
      left join docs s on s.owner = t.owner and s.col = 'seances' and s.id = t.data->>'seanceId'
      where t.owner = p_owner and t.col = 'attributions' and t.data->>'archerId' = p_archer and t.data->>'visible' = 'true'), '[]'::jsonb),
    'evaluations', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'date', data->>'date', 'notes', data->'notes', 'observation', data->>'observation')) from docs
      where owner = p_owner and col = 'evaluations' and data->>'archerId' = p_archer and data->>'partage' = 'true'), '[]'::jsonb));
end $$;

-- L'archer remplit son carnet : seulement ses lignes et seulement ces champs
create or replace function public.archer_ecrire_entree(p_owner uuid, p_archer text, p_id text, p_data jsonb) returns void language plpgsql security definer set search_path = public as $$
declare cur jsonb; allowed text[] := array['date','saison','objectif','atteint','note','emotion','commentaire','paille','visuel','blason','compte','compet','autre','scoreCompte','scoreCompet']; k text; v jsonb := '{}'::jsonb;
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  select data into cur from docs where owner = p_owner and col = 'carnetEntrees' and id = p_id;
  if found and cur->>'archerId' is distinct from p_archer then raise exception 'acces refuse'; end if;
  if not found and p_id not like 'a\_%' then raise exception 'identifiant invalide'; end if;
  foreach k in array allowed loop if p_data ? k then v := v || jsonb_build_object(k, p_data->k); end if; end loop;
  v := v || jsonb_build_object('archerId', p_archer, 'saisiParArcher', true, 'majArcher', extract(epoch from now()) * 1000);
  insert into docs (owner, col, id, data, updated_at) values (p_owner, 'carnetEntrees', p_id, coalesce(cur, jsonb_build_object('createdAt', extract(epoch from now()) * 1000)) || v, now())
    on conflict (owner, col, id) do update set data = docs.data || v, updated_at = now();
end $$;

create or replace function public.archer_supprimer_entree(p_owner uuid, p_archer text, p_id text) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  delete from docs where owner = p_owner and col = 'carnetEntrees' and id = p_id and id like 'a\_%' and data->>'archerId' = p_archer;
end $$;

-- Fichiers des fiches visibles par l'archer
create or replace function public.archer_peut_lire(p_name text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from acces a
    join docs t on t.owner = a.owner and t.col = 'attributions' and t.data->>'archerId' = a.archer_id and t.data->>'visible' = 'true'
    join docs d on d.owner = a.owner and d.col = 'documents' and d.id = t.data->>'documentId'
    where a.user_id = auth.uid() and a.owner::text = split_part(p_name, '/', 1) and d.data->>'assetId' = split_part(p_name, '/', 2))
$$;
drop policy if exists "fiches des archers" on storage.objects;
create policy "fiches des archers" on storage.objects for select to authenticated using (bucket_id = 'fichiers' and public.archer_peut_lire(name));

-- Droits d'exécution : uniquement pour les comptes connectés
revoke execute on function public.creer_invitation(text), public.acces_archer(text), public.retirer_acces(uuid, text),
  public.utiliser_invitation(text), public.mes_acces(), public.espace_archer(uuid, text),
  public.archer_ecrire_entree(uuid, text, text, jsonb), public.archer_supprimer_entree(uuid, text, text) from public, anon;
grant execute on function public.creer_invitation(text), public.acces_archer(text), public.retirer_acces(uuid, text),
  public.utiliser_invitation(text), public.mes_acces(), public.espace_archer(uuid, text),
  public.archer_ecrire_entree(uuid, text, text, jsonb), public.archer_supprimer_entree(uuid, text, text) to authenticated;
