-- V.1.10 : l'entraîneur est prévenu quand quelqu'un crée un compte sur le carnet.
--  Sur son accueil : les comptes créés depuis sa dernière visite, avec l'adresse, la date, et à quoi le compte est relié
--  (fiche d'un de ses archers, encadrant, ou rien du tout = compte sans aucun accès).
-- À lancer une fois dans Supabase (SQL Editor), après le script 23. Peut être relancé sans risque.
-- Ne fait que lire : ne change rien aux comptes ni aux données.

create or replace function public.comptes_recents() returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.est_coach() then raise exception 'reserve a l''entraineur'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', u.id,
      'email', u.email,
      'creeLe', (extract(epoch from u.created_at) * 1000)::bigint,
      'confirme', u.email_confirmed_at is not null,
      'derniere', case when u.last_sign_in_at is null then null else (extract(epoch from u.last_sign_in_at) * 1000)::bigint end,
      'archers', coalesce((select jsonb_agg(a.archer_id) from acces a where a.user_id = u.id and a.owner = auth.uid()), '[]'::jsonb),
      'encadrant', exists (select 1 from encadrants e where e.uid = u.id and e.owner = auth.uid()))
    order by u.created_at desc)
    from (select * from auth.users where id <> auth.uid() order by created_at desc limit 300) u), '[]'::jsonb);
end $$;
revoke all on function public.comptes_recents() from public, anon;
grant execute on function public.comptes_recents() to authenticated;
