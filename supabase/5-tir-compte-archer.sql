-- 5. L'archer note son tir compté (distance, blason, flèches placées sur la cible) pour suivre sa progression
-- À exécuter une fois dans Supabase › SQL Editor, après les scripts 2 à 4 (relançable sans risque).

create or replace function public.archer_ecrire_entree(p_owner uuid, p_archer text, p_id text, p_data jsonb) returns void language plpgsql security definer set search_path = public as $$
declare cur jsonb; allowed text[] := array['date','saison','objectif','atteint','note','emotion','commentaire','paille','visuel','blason','compte','compet','autre','scoreCompte','scoreCompet','tcDistance','tcBlason','tcTir']; k text; v jsonb := '{}'::jsonb;
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  select data into cur from docs where owner = p_owner and col = 'carnetEntrees' and id = p_id;
  if found and cur->>'archerId' is distinct from p_archer then raise exception 'acces refuse'; end if;
  if not found and p_id not like 'a\_%' then raise exception 'identifiant invalide'; end if;
  -- les lignes de concours gardent le score et les flèches saisis par l'entraîneur
  if found and cur ? 'concoursId' and coalesce(cur->>'concoursId', '') <> '' then allowed := array['atteint','note','emotion','commentaire']; end if;
  foreach k in array allowed loop if p_data ? k then v := v || jsonb_build_object(k, p_data->k); end if; end loop;
  v := v || jsonb_build_object('archerId', p_archer, 'saisiParArcher', true, 'majArcher', extract(epoch from now()) * 1000);
  insert into docs (owner, col, id, data, updated_at) values (p_owner, 'carnetEntrees', p_id, coalesce(cur, jsonb_build_object('createdAt', extract(epoch from now()) * 1000)) || v, now())
    on conflict (owner, col, id) do update set data = docs.data || v, updated_at = now();
end $$;

revoke execute on function public.archer_ecrire_entree(uuid, text, text, jsonb) from public, anon;
grant execute on function public.archer_ecrire_entree(uuid, text, text, jsonb) to authenticated;
