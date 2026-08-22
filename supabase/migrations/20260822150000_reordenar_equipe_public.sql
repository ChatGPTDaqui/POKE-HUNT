-- PH-75: reordenar a equipe.
--
-- Nao existia rota nenhuma pra isso. As tres acoes de equipe sao
-- `definir_ativo`, `por_na_equipe` e `tirar_da_equipe` — a ordem da fila so
-- mudava como EFEITO COLATERAL de por alguem em campo (`definir_ativo`
-- rotaciona o escolhido pro slot 0 e empurra o resto pra baixo).
--
-- Par obrigatorio deste arquivo: 20260822150001_reordenar_equipe_dev.sql.
-- Ver docs/11-operacao.md#fluxo-de-mudanca-de-schema.

-- Recebe a ordem COMPLETA da equipe, nao um par (de, para). Um par obrigaria a
-- funcao a deduzir o resto da fila, e duas chamadas concorrentes deduziriam a
-- partir de estados diferentes. Com a lista inteira o resultado e o mesmo
-- independente de quantas vezes rode.
create or replace function public.reordenar_equipe(p_ordem uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_pedidos int;
  v_total int;
  v_validos int;
  v_ativo_atual uuid;
  i int;
begin
  if v_user_id is null then
    raise exception 'nao autenticado' using errcode = '28000';
  end if;

  v_pedidos := coalesce(array_length(p_ordem, 1), 0);
  if v_pedidos = 0 then
    raise exception 'ordem vazia' using errcode = 'P0001';
  end if;

  -- Repetido passaria na contagem total e deixaria OUTRO POKE sem slot
  -- nenhum — o loop no fim escreveria duas vezes no mesmo id e nunca no que
  -- ficou de fora.
  if v_pedidos <> (select count(distinct x) from unnest(p_ordem) x) then
    raise exception 'ordem com POKE repetido' using errcode = 'P0001';
  end if;

  select count(*) into v_total
    from public.pokemon_instances
    where user_id = v_user_id and location = 'team';

  -- A lista precisa cobrir a equipe INTEIRA. Lista parcial deixaria buraco na
  -- numeracao ou dois POKEs no mesmo slot depois do update.
  if v_pedidos <> v_total then
    raise exception 'a ordem precisa conter a equipe inteira' using errcode = 'P0001';
  end if;

  -- Ownership por id, mesmo padrao das outras RPCs. Contar quantos dos ids
  -- pedidos sao mesmo da minha equipe fecha de uma vez os dois casos: id de
  -- outro jogador e id que esta na mochila.
  select count(*) into v_validos
    from public.pokemon_instances
    where user_id = v_user_id and location = 'team' and id = any(p_ordem);
  if v_validos <> v_total then
    raise exception 'ordem com POKE que nao esta na sua equipe' using errcode = 'P0001';
  end if;

  -- Trocar quem esta EM CAMPO nao passa por aqui.
  --
  -- `definir_ativo` faz um ritual que esta funcao nao tem como fazer: o client
  -- precarrega a arte da especie nova ANTES de trocar (senao o sprite pisca em
  -- branco enquanto o PNG baixa), atualiza `worldStore.player.poke` e zera
  -- cooldowns, alvo e flash. Se `reordenar_equipe` pudesse mexer no slot 0, o
  -- POKE desenhado no canvas ficaria diferente do POKE ativo no estado ate a
  -- proxima troca de cena.
  select id into v_ativo_atual
    from public.pokemon_instances
    where user_id = v_user_id and location = 'team' and team_slot = 0;
  if v_ativo_atual is distinct from p_ordem[1] then
    raise exception 'use definir_ativo para trocar o POKE em campo' using errcode = 'P0001';
  end if;

  -- Renumeracao passa por estados com slot duplicado no meio do loop; a
  -- constraint e `unique (user_id, team_slot) deferrable initially immediate`,
  -- entao sem o deferral a primeira colisao aborta. Mesmo tratamento de
  -- `definir_ativo`.
  set constraints public.one_pokemon_per_team_slot deferred;

  for i in 1..v_pedidos loop
    update public.pokemon_instances
      set team_slot = i - 1, updated_at = now()
      where id = p_ordem[i] and user_id = v_user_id;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

-- `revoke ... from public` sozinho nao basta neste projeto: ha `alter default
-- privileges ... grant execute on functions to anon, authenticated,
-- service_role`, entao toda funcao nova nasce com grant EXPLICITO e NOMEADO
-- pra essas roles e o revoke de PUBLIC nao alcanca o grant nominal. Achado
-- confirmado com has_function_privilege() em PH-67 (20260822130100).
revoke all on function public.reordenar_equipe(uuid[]) from public;
revoke execute on function public.reordenar_equipe(uuid[]) from anon;
grant execute on function public.reordenar_equipe(uuid[]) to authenticated;
