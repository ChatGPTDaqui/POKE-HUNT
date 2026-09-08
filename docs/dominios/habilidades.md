# Habilidades

Fontes: src/data/natures.ts, traits.ts, characteristics.ts e motor de combate.
Ability no código significa golpe; a habilidade passiva é Trait. Preserve essa distinção.
Natureza e Trait são persistidos; Característica é derivada dos IVs.
Confira computeStatsAtLevel e os sistemas que aplicam Trait antes de ajustar comportamento.
Não confunda catálogo de habilidade com prova de que toda mecânica esteja implementada.

## Consulta detalhada

- [Por que "Trait" e não "Ability" no código](../arquivo/2026-09-08/docs/14-habilidades.md#por-que-trait-e-não-ability-no-código)
- [Natureza](../arquivo/2026-09-08/docs/14-habilidades.md#natureza)
- [Habilidade](../arquivo/2026-09-08/docs/14-habilidades.md#habilidade)
- [Característica](../arquivo/2026-09-08/docs/14-habilidades.md#característica)
- [O que ficou de fora, e por quê](../arquivo/2026-09-08/docs/14-habilidades.md#o-que-ficou-de-fora-e-por-quê)
- [Testes que guardam isto](../arquivo/2026-09-08/docs/14-habilidades.md#testes-que-guardam-isto)

As referências detalhadas preservam o texto anterior à reorganização. Leia somente a seção
necessária; datas, medições, comandos operacionais e pendências antigas exigem confirmação
no código/Jira. Regras de execução vêm exclusivamente do [processo](../PROCESSO.md).
