# Mundo e hunts

Fontes: src/data, src/engine e src/render/ambiente.ts.
Guardian (salas intermediárias) e Lord (final) são protetores de sala: não usar boss/chefe
em novos identificadores desse sistema. Hunts BOSS/Modo Pesadelo mantêm BOSS em maiúsculas.
Boss global é outro sistema, fora deste repositório. Migrations e patch notes históricas
mantêm os nomes antigos. Quantidades vêm dos símbolos vigentes, não do registro antigo.
Preserve entradas de colisão/água e as saídas geradas; derivação precisa continuar reproduzível.
Estado de sala/protetor tem autoridade no servidor; não corrigir só sua representação visual.

## Consulta detalhada

- [Como uma hunt é montada hoje](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#como-uma-hunt-é-montada-hoje)
- [Camada 1 — bioma e sub-bioma](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#camada-1--bioma-e-sub-bioma)
- [Camada 2 — faixa](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#camada-2--faixa)
- [Camada 3 — força define a zona mínima dentro da faixa](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#camada-3--força-define-a-zona-mínima-dentro-da-faixa)
- [Uma linha evolutiva, estágios em faixas disjuntas](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#uma-linha-evolutiva-estágios-em-faixas-disjuntas)
- [A hunt vira salas](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#a-hunt-vira-salas)
- [Guardian e Lord — protetor da sala](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#guardian-e-lord--protetor-da-sala)
- [Wall-block pela ARTE de fundo (colisão pintada à mão)](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#wall-block-pela-arte-de-fundo-colisão-pintada-à-mão)
- [Spawn: distância média e cone de visão](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#spawn-distância-média-e-cone-de-visão)
- [Raio de AOE = raio de agressão selvagem](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#raio-de-aoe--raio-de-agressão-selvagem)
- [Modo Pesadelo e hunts BOSS](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#modo-pesadelo-e-hunts-boss)
- [Desbloqueio de hunt](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#desbloqueio-de-hunt)
- [Geometria e visual da hunt](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#geometria-e-visual-da-hunt)
- [Camada ambiente: vida no cenário (src/render/ambiente.ts)](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#camada-ambiente-vida-no-cenário-srcrenderambientets)
- [Terceiras evoluções em 0,2% — ainda vale, com um limite novo](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#terceiras-evoluções-em-02--ainda-vale-com-um-limite-novo)
- [Invariantes trancados por teste](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#invariantes-trancados-por-teste)

As referências detalhadas preservam o texto anterior à reorganização. Leia somente a seção
necessária; datas, medições, comandos operacionais e pendências antigas exigem confirmação
no código/Jira. Regras de execução vêm exclusivamente do [processo](../PROCESSO.md).
