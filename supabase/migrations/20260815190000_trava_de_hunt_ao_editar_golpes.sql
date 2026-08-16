-- Reintroduz a trava de "nao mexe nos golpes com a hunt em andamento" —
-- pedido explicito do usuario, revertendo a decisao da migration
-- 20260815170000 (que a tinha removido a pedido do MESMO usuario, numa leva
-- anterior). O predicado usado e o ja corrigido em 20260814120300 ("sessao
-- VIVA", nao "existe sessao") — nao o antigo que travava pra sempre depois de
-- fechar o navegador dentro de uma hunt.
--
-- Trocando de golpe no meio de uma cacada, o SERVIDOR so reconstroi o mundo
-- (e le `active_abilities`/`disabled_abilities`) na PROXIMA janela de flush
-- (<=30s) — entao a janela em andamento nunca via a troca de qualquer jeito.
-- A trava nao existe por corrupcao de estado (nao havia nenhuma); e regra de
-- jogo pedida pelo usuario: build fixo durante o combate, editavel so fora
-- dele.
--
-- Cobre as DUAS rotas que mudam quais golpes entram em combate: os 4 slots
-- (`definir_golpes_ativos`) e o liga/desliga de Ataque Basico / AOE de Nivel
-- 50 (`alternar_habilidade`) — as duas "acrescentam ou removem golpe da
-- rotacao", entao travar so uma deixaria meia-trava (o jogador ainda mexeria
-- no build via toggle com os slots bloqueados).

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

create or replace function dev.alternar_habilidade(p_poke_id uuid, p_ability_id text)
returns jsonb
language plpgsql security definer set search_path = dev, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_disabled jsonb;
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

  select disabled_abilities into v_disabled from dev.pokemon_instances
    where id = p_poke_id and user_id = v_user_id;
  if not found then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;

  update dev.pokemon_instances set
    disabled_abilities = case when coalesce(v_disabled, '{}'::jsonb) ? p_ability_id
      then coalesce(v_disabled, '{}'::jsonb) - p_ability_id
      else coalesce(v_disabled, '{}'::jsonb) || jsonb_build_object(p_ability_id, true)
    end,
    updated_at = now()
  where id = p_poke_id and user_id = v_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.alternar_habilidade(p_poke_id uuid, p_ability_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_disabled jsonb;
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

  select disabled_abilities into v_disabled from public.pokemon_instances
    where id = p_poke_id and user_id = v_user_id;
  if not found then
    raise exception 'POKE nao encontrado' using errcode = 'P0001';
  end if;

  update public.pokemon_instances set
    disabled_abilities = case when coalesce(v_disabled, '{}'::jsonb) ? p_ability_id
      then coalesce(v_disabled, '{}'::jsonb) - p_ability_id
      else coalesce(v_disabled, '{}'::jsonb) || jsonb_build_object(p_ability_id, true)
    end,
    updated_at = now()
  where id = p_poke_id and user_id = v_user_id;

  return jsonb_build_object('ok', true);
end;
$$;
