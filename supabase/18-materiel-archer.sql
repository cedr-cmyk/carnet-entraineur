-- V.1.10 : l'archer voit dans son espace le matériel que le club lui prête (type, numéro, taille, puissance, depuis quand).
-- À lancer une fois dans Supabase (SQL Editor), après le script 17. Peut être relancé sans risque. Ne change rien pour la 1.9.

create or replace function public.archer_materiel(p_owner uuid, p_archer text) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'type', data->>'type', 'numero', data->>'numero', 'taille', data->>'taille',
      'puissance', data->>'puissance', 'spine', data->>'spine', 'quantite', data->>'quantite', 'nature', data->>'nature', 'modele', data->>'modele',
      'pretLe', data->>'pretLe', 'clubId', data->>'clubId') order by data->>'type', data->>'numero')
    from docs where owner = p_owner and col = 'materiel' and data->>'archerId' = p_archer), '[]'::jsonb);
end $$;
revoke all on function public.archer_materiel(uuid, text) from public, anon;
grant execute on function public.archer_materiel(uuid, text) to authenticated;
