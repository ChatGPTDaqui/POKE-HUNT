-- O cliente deixa de poder ESCREVER progresso. Este e o commit que realmente
-- fecha o buraco da Fase D.
--
-- Ate aqui, todo o trabalho do servidor de autoridade era voluntario: o cliente
-- *parava* de escrever (o early-return em gameStatePersistence), mas nada o
-- *impedia*. Qualquer jogador com o DevTools aberto continuava conseguindo
--
--     update players set gold = 999999999 where user_id = auth.uid()
--
-- porque a policy `own rows all` dava insert/update/delete pra quem estivesse
-- logado. Politica de RLS e a unica barreira real aqui — codigo de cliente nao e
-- barreira nenhuma, e o `anon`/`authenticated` key vai dentro do bundle.
--
-- A partir daqui, quem escreve nestas 5 tabelas e SO a `service_role` (o
-- servico Node), que ignora RLS por definicao. O jogador continua LENDO o
-- proprio progresso — a UI precisa disso, e leitura nao e vetor de fraude aqui.
--
-- CONSEQUENCIA QUE NAO E EFEITO COLATERAL, E O PONTO: o jogo para de funcionar
-- sem o servidor. O caminho de fallback (sem `VITE_SERVIDOR_URL`) escreve direto
-- no Postgres e passa a falhar. Isso e deliberado — um modo que grava sem
-- passar pelo servidor e exatamente a brecha que esta sendo fechada.

-- players ---------------------------------------------------------------------
-- A policy de update sai; a de leitura fica. Nao existia policy de insert (a
-- linha nasce pelo trigger `handle_new_user`, que e SECURITY DEFINER) nem de
-- delete, entao nao ha o que revogar ali.
drop policy if exists "own row update" on players;

-- As demais usavam `for all`, que cobre select+insert+update+delete de uma vez.
-- Cada uma vira uma policy de SELECT apenas.
drop policy if exists "own rows all" on pokemon_instances;
create policy "jogador le os proprios pokemon" on pokemon_instances
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "own rows all" on player_items;
create policy "jogador le os proprios itens" on player_items
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "own rows all" on player_pokedex;
create policy "jogador le a propria pokedex" on player_pokedex
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "own rows all" on player_auto_catch_rules;
create policy "jogador le as proprias regras" on player_auto_catch_rules
  for select to authenticated using (auth.uid() = user_id);

-- Nota pra quem for testar isto: um INSERT/UPDATE/DELETE bloqueado por RLS
-- devolve **200/204, nao 403** — o PostgREST simplesmente nao encontra linha que
-- case com a policy. Afirmar o status code num teste adversarial daria falso
-- negativo. Tem que afirmar o EFEITO no banco, lido com a service_role.
