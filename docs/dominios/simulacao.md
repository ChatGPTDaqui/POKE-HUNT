# Simulação

Fontes: src/engine/simulation.ts, headless.ts, systems/ e src/core.
Mesmo motor no cliente e servidor; não introduza segunda implementação de simulação.
Preserve RNG semeado, contadores por mundo e referências por id.
Antes de testar authority, gere #engine. Combate/render são camadas distintas.
Para medir mudança de simulação, confira precondições e compare sementes representativas.

## Consulta detalhada

- [Ciclo de um passo](../arquivo/2026-09-08/docs/03-motor-de-simulacao.md#ciclo-de-um-passo)
- [Movimento (movementSystem.ts)](../arquivo/2026-09-08/docs/03-motor-de-simulacao.md#movimento-movementsystemts)
- [Combate (combatSystem.ts)](../arquivo/2026-09-08/docs/03-motor-de-simulacao.md#combate-combatsystemts)
- [Determinismo](../arquivo/2026-09-08/docs/03-motor-de-simulacao.md#determinismo)
- [Simulação em lote (offlineSimSystem.ts)](../arquivo/2026-09-08/docs/03-motor-de-simulacao.md#simulação-em-lote-offlinesimsystemts)
- [Execução headless](../arquivo/2026-09-08/docs/03-motor-de-simulacao.md#execução-headless)

As referências detalhadas preservam o texto anterior à reorganização. Leia somente a seção
necessária; datas, medições, comandos operacionais e pendências antigas exigem confirmação
no código/Jira. Regras de execução vêm exclusivamente do [processo](../PROCESSO.md).
