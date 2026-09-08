# Farm offline

Fonte: authority/src/progresso.ts#FARM_OFFLINE_PAUSADO e #segundosACreditar,
src/engine/systems/offlineSimSystem.ts e testes de sessão viva.
A flag estava true na base 016f1240; consulte o código antes de afirmar o estado atual.
Quarentena de desenvolvimento levantada não significa recompensa de ausência ativada.
Não religar produto como efeito colateral de manutenção documental.
Ausência e sessão viva são regimes distintos; não inferir ausência só de demora na rede.
A documentação antiga explica simulação pessimista e piso quando aplicáveis; conferir
o fluxo atual e testes antes de reutilizar seus limiares. Publicação segue PR/CI.

## Consulta detalhada

- [A regra do jogo](../arquivo/2026-09-08/docs/07-farm-offline.md#a-regra-do-jogo)
- [Não existe fórmula teórica de estimativa](../arquivo/2026-09-08/docs/07-farm-offline.md#não-existe-fórmula-teórica-de-estimativa)
- [Os dois regimes](../arquivo/2026-09-08/docs/07-farm-offline.md#os-dois-regimes)
- [Combate pessimista](../arquivo/2026-09-08/docs/07-farm-offline.md#combate-pessimista)
- [O piso de 50%](../arquivo/2026-09-08/docs/07-farm-offline.md#o-piso-de-50)
- [O bug do POKE caído: a caçada queimava o relógio para sempre](../arquivo/2026-09-08/docs/07-farm-offline.md#o-bug-do-poke-caído-a-caçada-queimava-o-relógio-para-sempre)
- [Catch-up de aba oculta (o lado do cliente)](../arquivo/2026-09-08/docs/07-farm-offline.md#catch-up-de-aba-oculta-o-lado-do-cliente)
- [O relatório "Bem-vindo de volta"](../arquivo/2026-09-08/docs/07-farm-offline.md#o-relatório-bem-vindo-de-volta)

As referências detalhadas preservam o texto anterior à reorganização. Leia somente a seção
necessária; datas, medições, comandos operacionais e pendências antigas exigem confirmação
no código/Jira. Regras de execução vêm exclusivamente do [processo](../PROCESSO.md).
