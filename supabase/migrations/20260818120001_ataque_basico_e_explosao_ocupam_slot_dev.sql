-- Espelho do 20260818120000 no schema `dev`.
--
-- O banco carrega DOIS conjuntos das RPCs, `public` e `dev`, e uma alteracao
-- que so toca um deixa o outro com a regra antiga. Aqui isso apareceria como
-- "esse golpe nao ocupa slot" ao por o Ataque Basico num slot pelo ambiente
-- dev, muito depois de o public ja estar certo — o tipo de divergencia que so
-- e descoberta quando alguem testa no lugar errado. Conferido apos aplicar: as
-- duas copias respondem igual.
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
        -- Todo POKE tem o Ataque Basico; ele nunca entra em `unlocked_abilities`.
        continue when v_id = 'basic_attack';
        if not (v_id = any (coalesce(v_conhecidos, array[]::text[]))) then
          raise exception 'esse POKE nao conhece esse golpe' using errcode = 'P0001';
        end if;
      end loop;

      update dev.pokemon_instances
        set active_abilities = p_ability_ids, updated_at = now()
        where id = p_poke_id;

      return jsonb_build_object('ok', true);
    end;
    $fn$;
  $sql$;

  execute 'revoke execute on function dev.definir_golpes_ativos(uuid, text[]) from anon';
  execute 'grant execute on function dev.definir_golpes_ativos(uuid, text[]) to authenticated';
end
$mig$;
