-- Espelho do 20260821210000 no schema `dev`.
--
-- O banco carrega DOIS conjuntos das RPCs, `public` e `dev`, e uma alteracao
-- que so toca um deixa o outro com a regra antiga. Aqui a divergencia
-- apareceria como a escolha de golpes continuando TRAVADA no ambiente dev
-- (toda edicao recusada com "esse POKE nao conhece esse golpe") depois de o
-- public ja estar destravado — exatamente o cenario que o ambiente dev existe
-- pra testar antes.
--
-- Guardado por `if exists`: ambiente novo nasce sem o schema `dev`, e sem a
-- guarda a migration inteira falharia ali.
do $mig$
begin
  if not exists (select 1 from pg_namespace where nspname = 'dev') then
    raise notice 'schema dev ausente — nada a espelhar';
    return;
  end if;

  execute $sql$
    create or replace function dev.definir_golpes_ativos(
      p_poke_id uuid,
      p_ability_ids text[]
    ) returns jsonb
    language plpgsql
    security definer
    set search_path = dev, public
    as $fn$
    declare
      v_user_id uuid := auth.uid();
      v_conhecidos text[];
      v_limpos text[];
      v_ignorados text[];
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

      -- Golpe que o POKE nao conhece e DESCARTADO, nao mais motivo de recusa —
      -- ver a nota completa em 20260821210000. `with ordinality` preserva a
      -- ordem escolhida pelo jogador, que e a rotacao de combate.
      select
        coalesce(array_agg(x order by n) filter (
          where x = 'basic_attack' or x = any (coalesce(v_conhecidos, array[]::text[]))
        ), array[]::text[]),
        coalesce(array_agg(x order by n) filter (
          where x <> 'basic_attack' and not (x = any (coalesce(v_conhecidos, array[]::text[])))
        ), array[]::text[])
      into v_limpos, v_ignorados
      from unnest(p_ability_ids) with ordinality as t(x, n);

      update dev.pokemon_instances
        set active_abilities = v_limpos, updated_at = now()
        where id = p_poke_id;

      return jsonb_build_object('ok', true, 'ignorados', v_ignorados);
    end;
    $fn$;
  $sql$;

  execute 'revoke execute on function dev.definir_golpes_ativos(uuid, text[]) from anon';
  execute 'grant execute on function dev.definir_golpes_ativos(uuid, text[]) to authenticated';
end
$mig$;
