-- Reverte 20260815200000: Ataque Basico e o AOE de nivel 50 voltam a ser
-- REJEITADOS como golpe escolhivel nos 4 slots — pedido explicito do
-- usuario, revertendo de novo (mesma decisao ja tinha sido revertida uma
-- vez antes, na propria 20260815200000).
--
-- Ataque Basico volta a ser so fallback automatico/Struggle quando os 4
-- golpes escolhidos estao em cooldown; AOE de nivel 50 volta a ser "de
-- graca" fora do cap de 4. Nao apaga a migration anterior — so cria uma
-- nova que reverte o comportamento da RPC, mantendo o historico intacto
-- (a migration 20260815200000 ja foi aplicada e registrada em
-- schema_migrations, apagar o arquivo dela deixaria uma entrada orfa).

create or replace function dev.definir_golpes_ativos(p_poke_id uuid, p_ability_ids text[])
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_conhecidos text[];
  v_id text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  if exists (
    select 1 from dev.game_sessions s
    where s.user_id = v_user_id
      and s.closed_at is null
      and s.last_flush_at > now() - interval '2 minutes'
  ) then
    raise exception 'Saia da hunt para trocar os golpes.' using errcode = 'P0001';
  end if;

  select unlocked_abilities into v_conhecidos from dev.pokemon_instances
    where id = p_poke_id and user_id = v_user_id;
  if not found then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;

  if p_ability_ids is null then
    raise exception 'lista de golpes invalida' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_ability_ids, 1), 0) > 4 then
    raise exception 'no maximo 4 golpes' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_ability_ids, 1), 0)
     <> (select count(distinct x) from unnest(p_ability_ids) x) then
    raise exception 'golpe repetido' using errcode = 'P0001';
  end if;

  foreach v_id in array coalesce(p_ability_ids, array[]::text[]) loop
    if v_id = 'basic_attack' or v_id like 'aoe50\_%' then
      raise exception 'esse golpe nao ocupa slot' using errcode = 'P0001';
    end if;
    if not (v_id = any (coalesce(v_conhecidos, array[]::text[]))) then
      raise exception 'esse POKE nao conhece esse golpe' using errcode = 'P0001';
    end if;
  end loop;

  update dev.pokemon_instances
    set active_abilities = p_ability_ids, updated_at = now()
    where id = p_poke_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.definir_golpes_ativos(p_poke_id uuid, p_ability_ids text[])
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_conhecidos text[];
  v_id text;
begin
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  if exists (
    select 1 from public.game_sessions s
    where s.user_id = v_user_id
      and s.closed_at is null
      and s.last_flush_at > now() - interval '2 minutes'
  ) then
    raise exception 'Saia da hunt para trocar os golpes.' using errcode = 'P0001';
  end if;

  select unlocked_abilities into v_conhecidos from public.pokemon_instances
    where id = p_poke_id and user_id = v_user_id;
  if not found then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;

  if p_ability_ids is null then
    raise exception 'lista de golpes invalida' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_ability_ids, 1), 0) > 4 then
    raise exception 'no maximo 4 golpes' using errcode = 'P0001';
  end if;
  if coalesce(array_length(p_ability_ids, 1), 0)
     <> (select count(distinct x) from unnest(p_ability_ids) x) then
    raise exception 'golpe repetido' using errcode = 'P0001';
  end if;

  foreach v_id in array coalesce(p_ability_ids, array[]::text[]) loop
    if v_id = 'basic_attack' or v_id like 'aoe50\_%' then
      raise exception 'esse golpe nao ocupa slot' using errcode = 'P0001';
    end if;
    if not (v_id = any (coalesce(v_conhecidos, array[]::text[]))) then
      raise exception 'esse POKE nao conhece esse golpe' using errcode = 'P0001';
    end if;
  end loop;

  update public.pokemon_instances
    set active_abilities = p_ability_ids, updated_at = now()
    where id = p_poke_id;

  return jsonb_build_object('ok', true);
end;
$$;
