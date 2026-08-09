-- Marca "existe um flush ESCREVENDO agora" na sessao.
--
-- O claim atomico do intervalo (migration 20260809180000 e o comentario em
-- progresso.ts#aplicarFlush) resolve dois flushes creditarem o mesmo periodo:
-- quem move `last_flush_at` primeiro leva, o outro desiste. O que ele NAO
-- resolve e o resto do jogo escrevendo por cima de quem ganhou.
--
-- `gravarEstado` grava o SNAPSHOT INTEIRO do jogador. Entao qualquer request que
-- leia o estado enquanto um flush ainda esta simulando vai gravar, segundos
-- depois, um retrato de ANTES do flush — e como o claim ja consumiu o intervalo,
-- o tempo cacado nao volta em flush nenhum. Medido contra o servidor local, com
-- 10 minutos de cacada pendente e o request concorrente atrasado em 80ms:
-- GET /estado apagou 3 de 6 flushes; POST /acao apagou 5 de 6. Em ouro: mais de
-- 10.000 perdidos por lote de 6 tentativas.
--
-- Os dois gatilhos reais nao sao exoticos:
--   * recarregar a pagina — `commitAgora()` dispara /sessao/flush no
--     `visibilitychange`, a aba morre, o servidor continua simulando, e a pagina
--     nova pede GET /estado no meio disso;
--   * qualquer clique (Loja, mochila, equipe) caindo perto do tique do flush de
--     30s, porque /acao le e regrava o snapshot do mesmo jeito.
--
-- `last_flush_at` sozinho nao serve de sinal: ele avanca no INICIO do flush, e o
-- que interessa saber e quando ele TERMINOU DE ESCREVER. Dai a coluna.
alter table game_sessions
  add column if not exists flushing_since timestamptz;

comment on column game_sessions.flushing_since is
  'Instante em que um flush comecou a simular/gravar. Nulo quando nao ha nenhum em andamento. Quem vai ler e regravar o snapshot do jogador espera isto ficar nulo (com expiracao, ver progresso.ts#aguardarFlushEmAndamento) para nao gravar um estado de antes do flush.';

-- Marca perdida por invocacao morta no meio (limite de CPU da Edge Function,
-- deploy no meio do request) deixaria todo request seguinte esperando o tempo
-- maximo. A leitura ignora marca velha; isto so limpa o que ja existe.
update game_sessions set flushing_since = null where flushing_since is not null;
