# Autoridade

Fontes: authority/src, src/data/remote e supabase/migrations.
Sessões de hunt usam HTTP/Edge; ações e social também usam RPCs security definer.
Revalide identidade, posse e limites no servidor/RPC; validação no cliente não fecha corrida.
Entregas reivindicadas precisam ser devolvidas se a escrita abortar: preserve o contrato
de comEstadoParaEscrita nos caminhos que o utilizam. Sessão única exige UNIQUE parcial.
PostgREST pode truncar páginas: conte via Content-Range, não .length.
Zustand persist pode absorver erro de storage: gate de conta nova verifica flag de getItem,
não apenas rejeição de hydrate. Confira o fluxo real antes de refatorar.
Mudanças em banco: leia ../operacao/banco.md.

`savePlayerState` (src/data/remote/playerRepository.ts) escreve por upsert genérico em
players/pokemon_instances/player_items/player_pokedex/player_auto_catch_rules/
player_missoes_reivindicadas/player_especialidades — várias dessas tabelas também têm RPC
dedicada (comprar_item, evoluir_poke, reivindicar_missao, subir_nivel_especialidade, etc).

**Correção (12/09/2026) à análise anterior desta seção**: a auditoria do PH-520 tinha
concluído que essa duplicação convive de propósito com as RPCs em produção, e apontado uma
janela de corrida em `player_especialidades`. Isso está ERRADO pro ambiente real: `setItem`
de `gameStatePersistence.ts` (`postgresStorage`) retorna cedo quando `servidorAtivo()` é
`true` — "O interruptor VITE_SERVIDOR_URL" — e o bundle de produção confirma essa var setada
(`functions/v1/jogo` presente no JS publicado). Logo `escrever()`/`savePlayerState` **nunca
roda em produção**; é código só alcançável em dev/local sem `VITE_SERVIDOR_URL`. A RPC é a
ÚNICA escritora dessas tabelas hoje — não há corrida nenhuma pra fechar. `authority/src`
(Edge Function) confirma o mesmo pelo lado do servidor: só LÊ `player_especialidades` (nunca
escreve) e nem lê `player_missoes_reivindicadas` (missão não entra no recálculo de combate).
Ver PH-520/PH-521 pra reconciliação dos tickets.

## Consulta detalhada

- [O princípio, atualizado para dois mecanismos de autoridade](../arquivo/2026-09-08/docs/04-autoridade-do-servidor.md#o-princípio-atualizado-para-dois-mecanismos-de-autoridade)
- [Onde a autoridade mora hoje](../arquivo/2026-09-08/docs/04-autoridade-do-servidor.md#onde-a-autoridade-mora-hoje)
- [A forma do serviço](../arquivo/2026-09-08/docs/04-autoridade-do-servidor.md#a-forma-do-serviço)
- [Rotas HTTP — só sessão de hunt](../arquivo/2026-09-08/docs/04-autoridade-do-servidor.md#rotas-http--só-sessão-de-hunt)
- [Autenticação](../arquivo/2026-09-08/docs/04-autoridade-do-servidor.md#autenticação)
- [CORS](../arquivo/2026-09-08/docs/04-autoridade-do-servidor.md#cors)
- [O ciclo de uma sessão de hunt](../arquivo/2026-09-08/docs/04-autoridade-do-servidor.md#o-ciclo-de-uma-sessão-de-hunt)
- [Leitura parcial: o flush não carrega a mochila](../arquivo/2026-09-08/docs/04-autoridade-do-servidor.md#leitura-parcial-o-flush-não-carrega-a-mochila)
- [Gravação de estado](../arquivo/2026-09-08/docs/04-autoridade-do-servidor.md#gravação-de-estado)
- [Entregas do mercado: um request recusado apagava o que o jogador recebeu](../arquivo/2026-09-08/docs/04-autoridade-do-servidor.md#entregas-do-mercado-um-request-recusado-apagava-o-que-o-jogador-recebeu)
- [O que virou RPC](../arquivo/2026-09-08/docs/04-autoridade-do-servidor.md#o-que-virou-rpc)
- [RLS: o cliente perdeu a escrita — e ganhou um segundo escritor legítimo](../arquivo/2026-09-08/docs/04-autoridade-do-servidor.md#rls-o-cliente-perdeu-a-escrita--e-ganhou-um-segundo-escritor-legítimo)
- [O interruptor VITE_SERVIDOR_URL](../arquivo/2026-09-08/docs/04-autoridade-do-servidor.md#o-interruptor-vite_servidor_url)
- [Rede: timeout, retry, e retry só onde repetir é seguro](../arquivo/2026-09-08/docs/04-autoridade-do-servidor.md#rede-timeout-retry-e-retry-só-onde-repetir-é-seguro)
- [Bugs achados por auditoria, com o mecanismo](../arquivo/2026-09-08/docs/04-autoridade-do-servidor.md#bugs-achados-por-auditoria-com-o-mecanismo)
- [Suspeita de exploit refutada (registrado para ninguém "consertar" depois)](../arquivo/2026-09-08/docs/04-autoridade-do-servidor.md#suspeita-de-exploit-refutada-registrado-para-ninguém-consertar-depois)
- [Pendências conhecidas](../arquivo/2026-09-08/docs/04-autoridade-do-servidor.md#pendências-conhecidas)

As referências detalhadas preservam o texto anterior à reorganização. Leia somente a seção
necessária; datas, medições, comandos operacionais e pendências antigas exigem confirmação
no código/Jira. Regras de execução vêm exclusivamente do [processo](../PROCESSO.md).
