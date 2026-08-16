-- Ataque Basico e o AOE de nivel 50 param de ter tratamento especial nos 4
-- slots — pedido explicito do usuario, revertendo a decisao da migration
-- 20260815190000: "o ataque basico e a explosao elemental nao sao
-- diferentes... eles podem ser retirados sim como qualquer outro golpe pode."
--
-- Aquela migration REJEITAVA explicitamente os dois ('esse golpe nao ocupa
-- slot') — sem este fix, o cliente passaria a mandar `basic_attack`/`aoe50_%`
-- dentro de `p_ability_ids` e toda chamada estouraria com erro do servidor no
-- primeiro clique.
--
-- Ataque Basico nunca esteve em `unlocked_abilities` (nao vem do learnset da
-- especie, e um fallback hand-authored — ver `src/data/abilities.ts`), entao
-- alem de tirar o bloqueio ele precisa de uma isencao PROPRIA na checagem de
-- "o POKE conhece esse golpe": sem isso passaria a estourar com "esse POKE
-- nao conhece esse golpe" em vez de "nao ocupa slot" — trocaria um bug por
-- outro. O golpe AOE ja passa normal: ele E gravado em `unlocked_abilities`
-- quando desbloqueia no nivel 50 (ver `golpesAprendidosAte`).
--
-- O limite de 4 (`array_length(...) > 4`) e a checagem de repetido NAO
-- mudam — ja implementavam a regra certa, so precisavam deixar os dois
-- golpes entrarem na conta.

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
    -- Ataque Basico e sempre "conhecido" (nunca esta na coluna
    -- unlocked_abilities), qualquer outro golpe precisa estar na lista real.
    if v_id <> 'basic_attack' and not (v_id = any (coalesce(v_conhecidos, array[]::text[]))) then
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
    if v_id <> 'basic_attack' and not (v_id = any (coalesce(v_conhecidos, array[]::text[]))) then
      raise exception 'esse POKE nao conhece esse golpe' using errcode = 'P0001';
    end if;
  end loop;

  update public.pokemon_instances
    set active_abilities = p_ability_ids, updated_at = now()
    where id = p_poke_id;

  return jsonb_build_object('ok', true);
end;
$$;
