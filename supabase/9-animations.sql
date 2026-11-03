-- 9. Animations (V.1.9) : l'archer participant voit les scores et le classement d'une animation que l'entraîneur a ouverte aux archers.
-- À exécuter une fois dans Supabase › SQL Editor, après les scripts 1 à 8 (relançable sans risque).
-- Seules les animations cochées « Ouvrir aux archers participants » sont visibles, et seulement par leurs participants.
-- Les autres participants apparaissent avec leur prénom et l'initiale du nom.
create or replace function public.archer_animations(p_owner uuid, p_archer text) returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from acces where user_id = auth.uid() and owner = p_owner and archer_id = p_archer) then raise exception 'acces refuse'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'nom', d.data->>'nom', 'date', d.data->>'date', 'lieu', d.data->>'lieu', 'jeux', coalesce(d.data->'jeux', '[]'::jsonb),
      'classement', coalesce(d.data->>'classement', 'true') <> 'false',
      'participants', coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id, 'moi', p.id = p_archer, 'scores', coalesce(d.data->'scores'->p.id, '{}'::jsonb),
          'nom', trim(coalesce(p.data->>'prenom', '') || ' ' || case when coalesce(p.data->>'nom', '') <> '' then left(p.data->>'nom', 1) || '.' else '' end)))
        from docs p where p.owner = p_owner and p.col = 'archers' and d.data->'participants' ? p.id), '[]'::jsonb))
    order by d.data->>'date' desc)
    from docs d where d.owner = p_owner and d.col = 'animations' and d.data->>'partage' = 'true' and d.data->'participants' ? p_archer), '[]'::jsonb);
end $$;
revoke execute on function public.archer_animations(uuid, text) from public, anon;
grant execute on function public.archer_animations(uuid, text) to authenticated;
