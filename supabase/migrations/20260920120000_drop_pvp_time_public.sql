-- PH-567: fim da transicao da PH-563. Desde a 7.65 nenhum cliente publicado
-- le `pvp_time` nem chama `salvar_time_pvp`; a fila que olhava `pvp_time`
-- morreu na PH-565 e `pvp_snapshot_time` ja le o preset ativo. O espelho
-- (`pvp_espelhar_time`) so custava uma escrita por save. Sai tudo.

create or replace function public.salvar_preset_pvp(
  p_tipo text,
  p_posicao integer,
  p_nome text,
  p_slots jsonb
)
returns public.pvp_preset
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_slot record;
  v_pid uuid;
  v_conhecidos text[];
  v_golpes text[];
  v_vistos uuid[] := '{}';
  v_limpos jsonb := '[]'::jsonb;
  v_nome text := left(coalesce(trim(p_nome), ''), 24);
  v_pr public.pvp_preset;
begin
  if v_eu is null then raise exception 'sem sessao autenticada'; end if;
  if p_tipo not in ('ataque', 'defesa') then raise exception 'Tipo de preset invalido.'; end if;
  if p_posicao is null or p_posicao < 1 or p_posicao > 3 then raise exception 'Posicao de preset invalida.'; end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' then raise exception 'Formacao invalida.'; end if;
  if jsonb_array_length(p_slots) > 6 then raise exception 'Time de PvP aceita no maximo 6 POKEs.'; end if;

  for v_slot in select value as slot, ordinality as ord from jsonb_array_elements(p_slots) with ordinality loop
    if jsonb_typeof(v_slot.slot) <> 'object' or v_slot.slot->>'pokemon_id' is null then
      raise exception 'Slot % invalido.', v_slot.ord;
    end if;
    begin
      v_pid := (v_slot.slot->>'pokemon_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'Slot % invalido.', v_slot.ord;
    end;
    if v_pid = any (v_vistos) then
      raise exception 'Um dos POKEs informados esta repetido.';
    end if;

    select unlocked_abilities into v_conhecidos
      from public.pokemon_instances
     where id = v_pid and user_id = v_eu;
    if not found then
      raise exception 'Um dos POKEs informados nao pertence a voce.';
    end if;

    if v_slot.slot ? 'golpes' and jsonb_typeof(v_slot.slot->'golpes') <> 'array' then
      raise exception 'Golpes do slot % invalidos.', v_slot.ord;
    end if;
    v_golpes := array(select jsonb_array_elements_text(coalesce(v_slot.slot->'golpes', '[]'::jsonb)));
    if coalesce(array_length(v_golpes, 1), 0) > 4 then
      raise exception 'No maximo 4 golpes por POKE.';
    end if;
    if coalesce(array_length(v_golpes, 1), 0) <> (select count(distinct g) from unnest(v_golpes) g) then
      raise exception 'Golpe repetido no slot %.', v_slot.ord;
    end if;
    if exists (
      select 1 from unnest(v_golpes) g
       where g <> 'basic_attack' and not (g = any (coalesce(v_conhecidos, '{}')))
    ) then
      raise exception 'O POKE do slot % nao conhece um dos golpes escolhidos.', v_slot.ord;
    end if;

    v_vistos := array_append(v_vistos, v_pid);
    v_limpos := v_limpos || jsonb_build_array(jsonb_build_object(
      'pokemon_id', v_pid,
      'golpes', to_jsonb(v_golpes)
    ));
  end loop;

  perform public.pvp_garantir_presets(v_eu);

  update public.pvp_preset
     set nome = v_nome, slots = v_limpos, atualizado_em = now()
   where user_id = v_eu and tipo = p_tipo and posicao = p_posicao
  returning * into v_pr;

  return v_pr;
end
$function$;
grant execute on function public.salvar_preset_pvp(text, integer, text, jsonb) to authenticated;

create or replace function public.ativar_preset_pvp(p_tipo text, p_posicao integer)
returns public.pvp_preset
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_pr public.pvp_preset;
begin
  if v_eu is null then raise exception 'sem sessao autenticada'; end if;
  if p_tipo not in ('ataque', 'defesa') then raise exception 'Tipo de preset invalido.'; end if;
  if p_posicao is null or p_posicao < 1 or p_posicao > 3 then raise exception 'Posicao de preset invalida.'; end if;

  perform public.pvp_garantir_presets(v_eu);

  update public.pvp_preset set ativo = false
   where user_id = v_eu and tipo = p_tipo and ativo and posicao <> p_posicao;
  update public.pvp_preset set ativo = true, atualizado_em = now()
   where user_id = v_eu and tipo = p_tipo and posicao = p_posicao
  returning * into v_pr;

  return v_pr;
end
$function$;
grant execute on function public.ativar_preset_pvp(text, integer) to authenticated;

drop function if exists public.pvp_espelhar_time(uuid);
drop function if exists public.salvar_time_pvp(uuid[]);
drop function if exists public.pvp_time_pronto_ranqueado(uuid);
drop table if exists public.pvp_time;
