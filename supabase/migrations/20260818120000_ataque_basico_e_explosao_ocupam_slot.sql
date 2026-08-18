-- Ataque Basico e Explosao Elemental viram golpes de SLOT
-- ---------------------------------------------------------------------------
-- Pedido explicito do usuario: o maximo e 4 golpes, e esses dois sao golpes
-- comuns que o treinador escolhe como qualquer outro.
--
-- Ate aqui `definir_golpes_ativos` recusava as duas chaves com "esse golpe nao
-- ocupa slot", porque no desenho antigo elas viviam FORA dos 4: o Ataque
-- Basico era injetado como primeira posicao fixa da rotacao e a Explosao
-- Elemental era anexada depois dos escolhidos, e os dois eram liga/desliga em
-- `disabled_abilities`. Na pratica o POKE lutava com ate 6 golpes enquanto a
-- tela dizia "4/4".
--
-- Sem esta migration a mudanca do cliente ficaria pela metade e do pior jeito:
-- a tela deixaria montar a build, a RPC recusaria a gravacao, e a escolha
-- sumiria no proximo carregamento.
--
-- DUAS REGRAS DIFERENTES pras duas chaves, e a diferenca importa:
--
--   `basic_attack` nunca esta em `unlocked_abilities`. Ele nao e aprendido em
--   nivel nenhum — todo POKE simplesmente tem. Entao ele precisa de uma
--   isencao explicita da checagem de "conhece esse golpe?", senao continuaria
--   recusado, agora com a mensagem errada.
--
--   `aoe50_*` E gravado em `unlocked_abilities` no nivel 50 (o motor injeta em
--   `golpesAprendidosAte`). Ele nao precisa de isencao nenhuma: basta parar de
--   recusa-lo e a checagem normal ja faz o certo — quem nao chegou ao nivel 50
--   nao tem a chave e continua barrado.
--
-- O teto de 4 e a recusa de repetido continuam iguais. `alternar_habilidade`
-- nao muda: ligar/desligar continua valendo pra qualquer golpe, inclusive
-- estes dois, e e ortogonal a ocupar slot.
create or replace function public.definir_golpes_ativos(
  p_poke_id uuid,
  p_ability_ids text[]
) returns jsonb
language plpgsql
security definer
set search_path = public
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
    -- Todo POKE tem o Ataque Basico; ele nunca aparece em `unlocked_abilities`.
    continue when v_id = 'basic_attack';
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

-- `public` e chamavel por RPC com a anon key que vai no bundle (ver CLAUDE.md):
-- o grant tem que ser reafirmado depois do replace, e so pra quem esta logado —
-- a funcao inteira depende de `auth.uid()`.
revoke execute on function public.definir_golpes_ativos(uuid, text[]) from anon;
grant execute on function public.definir_golpes_ativos(uuid, text[]) to authenticated;
