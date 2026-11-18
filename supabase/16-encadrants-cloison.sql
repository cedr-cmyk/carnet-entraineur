-- V.1.10 : un encadrant ne voit plus que ce qui concerne ses clubs.
--  - Documents : ceux partagés à tous les archers ou à l'un de ses clubs (plus tous les documents du carnet).
--  - Concours : selon son droit « Concours », ceux qu'il a créés ou où un archer de ses clubs est inscrit.
-- À lancer une fois dans Supabase (SQL Editor), après le script 15. Peut être relancé sans risque.

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
  -- documents : seulement ceux partagés à tous les archers ou à l'un de ses clubs ; dossiers et fiches séance en lecture
  elsif p_col = 'documents' then return not p_ecrire and (case when jsonb_typeof(p_data->'partageClubs') = 'array' then p_data->'partageClubs' else '[]'::jsonb end) ?| array(select jsonb_array_elements_text(cl) union select '*');
  elsif p_col in ('dossiers', 'fiches') then return not p_ecrire;
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
  -- concours : selon le droit « Concours », et seulement ceux qu'il a créés ou où un archer de ses clubs est inscrit
  elsif p_col = 'concours' then
    return (case when p_ecrire then coalesce(d->>'concours', '') = 'gerer' else coalesce(d->>'concours', '') in ('voir', 'gerer') end)
      and (coalesce(p_data->>'creePar', '') = auth.uid()::text
        or exists (select 1 from jsonb_object_keys(case when jsonb_typeof(p_data->'resultats') = 'object' then p_data->'resultats' else '{}'::jsonb end) k where public.enc_archer_ok(p_owner, d, k)));
  end if;
  return false;
end $$;
