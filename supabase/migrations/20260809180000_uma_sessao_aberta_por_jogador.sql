-- Uma sessao de hunt aberta por jogador — garantido pelo BANCO, nao por codigo.
--
-- O indice `game_sessions_abertas` existia desde a Fase D, mas NAO era unique:
-- ele so acelerava a busca. `abrirSessao` fechava a sessao anterior antes de
-- inserir a nova, o que resolve o caso sequencial e nao resolve nada em corrida.
--
-- O EXPLOIT que isso deixava aberto (reproduzido e medido antes deste arquivo):
-- dois cliques em "Entrar" quase simultaneos criam DUAS sessoes. `sessaoAberta`
-- le `order=started_at.desc&limit=1`, entao so a mais recente e flushada — a
-- outra fica parada com `last_flush_at` congelado na abertura. Quando a recente
-- e fechada (sair da hunt, ou o encerramento por desmaio), a proxima chamada
-- encontra a ORFA e credita, de uma vez, todo o tempo desde a abertura dela —
-- o MESMO periodo que a outra sessao ja tinha pago. Medido: 30 minutos
-- creditados duas vezes = +8.105 de ouro e +60 POKEs capturados do nada.
--
-- Nao e "so cosmetico": a auditoria pos-HUD tinha concluido que sessoes orfas
-- eram inofensivas porque o ouro e gravado como valor absoluto e converge. Isso
-- vale para dois flushes da MESMA sessao. Duas sessoes diferentes tem cada uma
-- seu proprio `last_flush_at`, entao os intervalos somam em vez de convergir.

-- 1. Fecha as orfas que ja existem, mantendo a mais recente de cada jogador.
--    `where true` por causa do pg_safeupdate (ver CLAUDE.md) — este UPDATE roda
--    pela API REST, onde a extensao exige clausula.
with ranqueadas as (
  select id, row_number() over (partition by user_id order by started_at desc) as posicao
  from public.game_sessions
  where closed_at is null
)
update public.game_sessions s
set closed_at = now()
from ranqueadas r
where s.id = r.id and r.posicao > 1;

-- 2. Passa a proibir estruturalmente. Substitui o indice nao-unique de mesmo
--    proposito: manter os dois so gastaria escrita.
drop index if exists public.game_sessions_abertas;
create unique index game_sessions_abertas
  on public.game_sessions (user_id)
  where closed_at is null;
