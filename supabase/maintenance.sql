-- Mode maintenance (V.1.7.7) : pendant une mise à jour, l'entraîneur met l'appli en pause pour les archers.
-- Les archers l'ouvrent hors ligne avec un message ; ce qu'ils notent est gardé sur leur téléphone et part à la fin.
-- Script indépendant, peut être relancé sans risque.
create table if not exists public.maintenance (
  id int primary key default 1 check (id = 1),
  actif boolean not null default false,
  depuis timestamptz,
  maj timestamptz default now()
);
alter table public.maintenance enable row level security;
revoke all on public.maintenance from public, anon, authenticated;
insert into public.maintenance (id) values (1) on conflict (id) do nothing;

-- Tout compte connecté peut savoir si la maintenance est en cours
create or replace function public.etat_maintenance() returns jsonb language sql stable security definer set search_path = public
as $$ select coalesce((select jsonb_build_object('actif', actif, 'depuis', depuis) from maintenance where id = 1), '{"actif": false}'::jsonb) $$;

-- Seul l'entraîneur l'allume ou l'éteint
create or replace function public.basculer_maintenance(p_actif boolean) returns jsonb language plpgsql security definer set search_path = public
as $$
begin
  if not est_coach() then raise exception 'reserve a l''entraineur'; end if;
  insert into maintenance (id, actif, depuis, maj) values (1, p_actif, case when p_actif then now() end, now())
    on conflict (id) do update set actif = excluded.actif, depuis = excluded.depuis, maj = now();
  return etat_maintenance();
end $$;

revoke all on function public.etat_maintenance() from public, anon;
grant execute on function public.etat_maintenance() to authenticated;
revoke all on function public.basculer_maintenance(boolean) from public, anon;
grant execute on function public.basculer_maintenance(boolean) to authenticated;
