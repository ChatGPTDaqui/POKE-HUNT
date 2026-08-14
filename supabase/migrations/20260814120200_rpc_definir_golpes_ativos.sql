-- RPC `definir_golpes_ativos` — os 4 golpes que o POKE leva pra luta.
--
-- Escrita como RPC, e nao como acao do server Node, porque a camada de acoes
-- migrou pra Postgres (RPC-everything, migrations 2026-08-11). Segue o molde de
-- `alternar_habilidade`, que faz a mesma coisa pro campo vizinho
-- `disabled_abilities`.
--
-- POR QUE A VALIDACAO MORA AQUI, e nao na tela: desde a Fase D o cliente nao
-- escreve progresso. Um botao desabilitado no menu Equipes e conforto; a regra
-- ("no maximo 4", "so golpe que o POKE conhece", "nao troca dentro de hunt") so
-- vale se o Postgres recusar. Sem isto, um fetch a mao poe 20 golpes no POKE.

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

  -- Hunt aberta = sessao sem `closed_at`. Preferido a `players.current_map_id`
  -- porque a sessao e escrita pelo servidor; o `current_map_id` e eco do
  -- estado do jogador e pode ficar para tras.
  if exists (select 1 from dev.game_sessions s where s.user_id = v_user_id and s.closed_at is null) then
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
    -- O Ataque Basico e o golpe de area do Nivel 50 existem FORA dos 4 slots
    -- (o primeiro e o fallback universal, o segundo e sempre disponivel).
    -- Aceitar qualquer um dos dois aqui deixaria o jogador gastar um slot num
    -- golpe que ele ja tem de graca. O prefixo `aoe50_` espelha
    -- src/data/typedAoeMoves.ts#typedAoeMoveKey.
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
revoke all on function dev.definir_golpes_ativos(uuid, text[]) from public;
grant execute on function dev.definir_golpes_ativos(uuid, text[]) to authenticated;

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

  if exists (select 1 from public.game_sessions s where s.user_id = v_user_id and s.closed_at is null) then
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
revoke all on function public.definir_golpes_ativos(uuid, text[]) from public;
grant execute on function public.definir_golpes_ativos(uuid, text[]) to authenticated;
