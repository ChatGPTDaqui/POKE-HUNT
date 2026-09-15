# Mundo e hunts

Fontes: src/data, src/engine e src/render/ambiente.ts.
Guardian (salas intermediárias) e Lord (final) são protetores de sala: não usar boss/chefe
em novos identificadores desse sistema. Hunts BOSS/Modo Pesadelo mantêm BOSS em maiúsculas.
Boss global é outro sistema, fora deste repositório. Migrations e patch notes históricas
mantêm os nomes antigos. Quantidades vêm dos símbolos vigentes, não do registro antigo.
Preserve entradas de colisão/água e as saídas geradas; derivação precisa continuar reproduzível.
Estado de sala/protetor tem autoridade no servidor; não corrigir só sua representação visual.
Estágios 8, 9 e 10 de cada bioma são o fim do bioma: mesmo elenco, só o nível do inimigo
sobe (PH-506, decisão do dono em 15/09/2026). Não é bug nem fila de conteúdo; ver decisões.

## Estágios, elenco e gate (vigente desde 02/09/2026)

Vocabulário: BIOMA × ESTÁGIO. Não existe mais "faixa" (`faixa1..3`), `SHARE_TERCEIRA_EVOLUCAO`
nem `LIMITE_ZONA_DE_FINAIS`; o documento 06 do arquivo ainda os descreve e vale só como história (PH-505).

- Régua: `src/data/estagios.ts` — `ESTAGIOS_POR_BIOMA`, `NIVEIS_POR_ESTAGIO`, `TETO_DO_MODO_NORMAL`,
  `SALAS_POR_ESTAGIO`, `niveisDoEstagio`, `estagioId`/`parseEstagioId` (`PREFIXO_DO_PESADELO` no espelho).
  Sala sorteada pela curva de profundidade (`pesosDoEstagio`, `PERFIL_POR_SUB_BIOMA`), não pelo `peso` base.
- Elenco e chance por sala: `src/data/generated/elencoPorEstagio.generated.ts` (`ELENCO_POR_ESTAGIO`,
  `ELENCO_DO_SUB_BIOMA`), montado do encontro real de Gen I-III com o PokeRogue como preenchimento;
  gerador e sub-biomas sem análogo em `scripts/nivel-real-para-estagio.mjs`.
- Montagem das 120 hunts (12 biomas × 10 estágios) e do espelho Pesadelo: `src/data/huntSpawnOverrides.ts`
  (`POOL_POR_SALA`, `STARTER_HUNT_ID`; concentração limitada por `TETO_DE_FATIA` e `POOL_MINIMO_PRA_TETO`,
  medida por SALA em todo índice). Hunt inicial: 9 espécies, Lv 1-3.
- Gate de conteúdo: `src/data/biomas.ts` — `GRUPOS_INICIAIS = ['biomas']`, `GRUPOS_DO_LANCE = ['nightmare']`;
  gate de estágio (N pede N-1 limpo) revalidado no servidor (`authority/src/appSessao.ts`).
- Invariantes trancados: `src/data/hunts.test.ts`, `elencoPorEstagio.test.ts`, `cartaoDaHuntBateNoSorteio.test.ts`.
  Toda falha aqui é silenciosa (espécie sem hunt segue no Bestiário e nunca aparece) — conferir nos testes, não de memória.

## Consulta detalhada (histórico)

As seções de "faixa", "terceiras evoluções", "como uma hunt é montada", "desbloqueio" e "invariantes"
do documento 06 foram substituídas pelo bloco acima e saíram desta lista. O que segue não mudou de desenho,
exceto o Modo Pesadelo, que desde PH-523 (12/09) é a mesma trilha de 12 biomas com progresso próprio.

- [A hunt vira salas](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#a-hunt-vira-salas)
- [Guardian e Lord — protetor da sala](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#guardian-e-lord--protetor-da-sala)
- [Wall-block pela ARTE de fundo (colisão pintada à mão)](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#wall-block-pela-arte-de-fundo-colisão-pintada-à-mão)
- [Spawn: distância média e cone de visão](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#spawn-distância-média-e-cone-de-visão)
- [Raio de AOE = raio de agressão selvagem](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#raio-de-aoe--raio-de-agressão-selvagem)
- [Modo Pesadelo e hunts BOSS](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#modo-pesadelo-e-hunts-boss)
- [Geometria e visual da hunt](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#geometria-e-visual-da-hunt)
- [Camada ambiente: vida no cenário (src/render/ambiente.ts)](../arquivo/2026-09-08/docs/06-mundo-hunts-e-spawn.md#camada-ambiente-vida-no-cenário-srcrenderambientets)

As referências detalhadas preservam o texto anterior à reorganização. Leia somente a seção
necessária; datas, medições, comandos operacionais e pendências antigas exigem confirmação
no código/Jira. Regras de execução vêm exclusivamente do [processo](../PROCESSO.md).
