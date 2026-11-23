-- V.1.10 : l'entraîneur enregistre les scores d'une animation sans écraser ce que les marqueurs (QR codes) ou les inscriptions
-- sur place viennent d'ajouter : seules les parties modifiées sont envoyées et appliquées sur la version à jour de l'animation.
-- p_ops = [{ "c": ["scores","a1","j1"], "v": [2,1] }, { "c": ["choix","e1","j1"], "d": true }, …]  (c = chemin, v = valeur, d = effacer)
-- À lancer une fois dans Supabase (SQL Editor), après le script 22. Peut être relancé sans risque. Ne change rien pour la 1.9.

create or replace function public.anim_coach_maj(p_id text, p_ops jsonb) returns void language plpgsql security definer set search_path = public as $$
declare d jsonb; op jsonb; ch text[]; i int;
begin
  if auth.uid() is null then raise exception 'non connecte'; end if;
  if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) > 500 then raise exception 'modifications invalides'; end if;
  select data into d from docs where owner = auth.uid() and col = 'animations' and id = p_id for update;
  if not found then raise exception 'animation absente'; end if;
  for op in select * from jsonb_array_elements(p_ops) loop
    if jsonb_typeof(op->'c') <> 'array' or jsonb_array_length(op->'c') = 0 or jsonb_array_length(op->'c') > 6 then raise exception 'chemin invalide'; end if;
    ch := array(select jsonb_array_elements_text(op->'c'));
    if coalesce((op->>'d')::boolean, false) then d := d #- ch;
    else
      for i in 1 .. array_length(ch, 1) - 1 loop   -- crée les niveaux qui manquent
        if jsonb_typeof(d #> ch[1:i]) is distinct from 'object' then d := jsonb_set(d, ch[1:i], '{}'::jsonb, true); end if;
      end loop;
      d := jsonb_set(d, ch, coalesce(op->'v', 'null'::jsonb), true);
    end if;
  end loop;
  update docs set data = d, updated_at = now() where owner = auth.uid() and col = 'animations' and id = p_id;
end $$;
revoke all on function public.anim_coach_maj(text, jsonb) from public, anon;
grant execute on function public.anim_coach_maj(text, jsonb) to authenticated;
