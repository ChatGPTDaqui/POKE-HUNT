-- Achar um jogador pelo nick SEM passar por LIKE.
--
-- `pedirAmizade` usava `players?trainer_name=ilike.<nick>` com o comentario
-- "sem % e comparacao exata". Nao e: `_` tambem e curinga em LIKE/ILIKE — vale
-- por UMA letra qualquer — e `_` e caractere valido de nick. Pior, o `nick` que
-- chega do cliente nao passa pela regex do cadastro, so por um limite de
-- tamanho, entao `%` atravessava inteiro.
--
-- Medido contra a funcao publicada, antes deste arquivo:
--   POST /correio/amizade {"nick":"%"}   -> 200 "Pedido enviado para Treinador#4ce5"
--   POST /correio/amizade {"nick":"___"} -> 200 "Pedido enviado para Treinador"
-- Ou seja: dava pra mandar pedido a um jogador arbitrario sem saber o nome
-- dele, e pra enumerar nicks por tentativa (busca por tamanho e por letra).
--
-- Mesma solucao ja adotada em `nome_de_treinador_disponivel` na leva 5.1:
-- comparacao por `lower()` dentro do banco, sem sintaxe de padrao no caminho.
create or replace function public.id_por_nome_de_treinador(nome text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id from public.players where lower(trainer_name) = lower(trim(nome)) limit 1;
$$;

-- Toda funcao em `public` e chamavel por RPC com a anon key que VAI NO BUNDLE do
-- jogo. Esta devolve o user_id de um jogador a partir do nick — util pro
-- servidor, e um mapa de "nick -> id" pra qualquer visitante. So a service_role
-- executa.
revoke all on function public.id_por_nome_de_treinador(text) from public, anon, authenticated;
grant execute on function public.id_por_nome_de_treinador(text) to service_role;
