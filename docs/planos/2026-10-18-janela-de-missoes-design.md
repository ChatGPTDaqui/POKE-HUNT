# Janela de Missões — design

18/10/2026. Brainstorm com o dono; aprovado em conversa e implementado no mesmo dia.

## Objetivo

Juntar numa janela só tudo que é "missão" no jogo. Cada menu de hoje vira uma
aba dessa janela, e a aba Objetivos ganha uma visão do jogo inteiro: início,
meio e fim.

Não entra nenhuma regra, recompensa, migration ou mudança no servidor. É só
reorganização da interface, mais a Rota do Treinador, que apenas lê dados que
já existem.

## Decisões do dono

| Pergunta | Decisão |
|---|---|
| Quais abas | Diário, Objetivos, Tasks, Especialidades, Conquistas e Bestiário |
| Como se entra | **Um único atalho**, "Missões". Os outros caminhos saem dos menus |
| Organização | Abas em 2 grupos (mesmo padrão da Wiki): **Hoje** com Diário e Objetivos; **Progresso** com Tasks, Especialidades, Conquistas e Bestiário |
| Rota do Treinador | 3 fases com marcos medidos no progresso real, cada um com barra e com o que libera; a fase atual aberta e as outras recolhidas |

## Interface

### A janela

- Uma `ScreenName` nova, `missoes`, aberta como `GameWindow` no `ScreenOverlay`,
  com o título "Missões".
- Abas com `SegmentedTabs` em dois níveis, como em `WikiMenu`: grupo (Hoje ou
  Progresso) e, dentro dele, a aba.
- A aba atual fica no `uiStore` (`abaDeMissoes`). Fechar e reabrir volta nela.
- Cada aba **reusa o componente que já existe**, sem reescrever o conteúdo:
  - Tasks: `TasksMenu`
  - Especialidades: `EspecialidadesMenu`
  - Conquistas: `ConquistasMenu`
  - Bestiário: `BestiarioMenu`
  - Diário: o conteúdo de `SheetDoDiario`, extraído do `Sheet` para um
    componente sem moldura. `PainelDoDiario` e o painel lateral deixam de
    existir.
  - Objetivos: a Rota do Treinador (seção abaixo), com o `CartaoDoPasso` e a
    `FaixaDePremios` no topo.

### Entrada única

- A `ColunaDeAtalhos` troca os atalhos de Diário, Especialidades e Tasks por um
  único **Missões**. Calculadora e PvP continuam onde estão.
- Saem:
  - o botão "Objetivos" do campo (`JornadaNaHud`);
  - Conquistas e Bestiário da grade "Mais" (`ActionDock`).
- **Selo do atalho:** soma o que está pronto para coletar, sem contar nada duas
  vezes:
  - prêmios do Diário;
  - prêmios dos Primeiros Passos;
  - Tasks prontas para reivindicar;
  - Especialidades prontas para subir.
- **Qual aba abre:** a primeira, na ordem das abas, que tiver algo pronto para
  coletar. Se nenhuma tiver, a última aba usada.

### Abrir uma aba direto

- `abrirMissoes(aba?)` é a única porta de entrada.
- Os chamadores atuais passam a usar essa porta:
  - os botões de `JornadaDoTreinador` (tela de Hunts);
  - os lembretes do Diário em `Diario.tsx` e `FaixaDePremios`;
  - os destinos dos Primeiros Passos.
- `toggleScreen('tasks' | 'especialidades' | 'conquistas' | 'bestiario')`
  continua aceito e é redirecionado para `missoes` na aba certa. Assim nenhum
  caminho esquecido quebra.

## Cadeados e destaques dos Primeiros Passos

Hoje `desbloqueios.ts` tranca as telas `tasks`, `especialidades` e `bestiario`,
e `useDestaqueDoPasso` destaca os atalhos da coluna.

- O cadeado passa para a **aba**. A aba trancada aparece com `MarcaDeCadeado`;
  ao clicar, mostra o requisito (`avisarTrancado`) e não abre o conteúdo.
- O atalho Missões **nunca tranca**, porque o Diário não tem requisito.
- O destaque acende no atalho Missões e na aba que o passo atual pede. Os
  destinos `tasks` e `especialidades` de `primeirosPassos.ts` passam a abrir a
  aba correspondente.

## Aba Objetivos: Rota do Treinador

Três fases. Cada marco mostra título, barra (valor atual sobre o alvo) e o que
ele libera. Os números vêm das constantes do jogo, nunca escritos à mão. A fase
atual (a primeira com marco pendente) vem aberta; as outras ficam recolhidas,
mas visíveis.

| Fase | Marco | Fonte do progresso | Libera |
|---|---|---|---|
| Início | Os 11 Primeiros Passos | `primeirosPassos` (já existe) | menus com cadeado |
| Início | Treinador Lv 10 | nível do treinador | PvP e Ranking |
| Início | 1º Lord em 3 biomas | progresso por bioma | Treinamento Lv 60 |
| Meio | Estágio `ESTAGIOS_PARA_O_LANCE` nos 12 biomas | `biomasFaltandoParaOLance` | Campeão Lance |
| Meio | Vencer o Lance | continentes liberados | Modo Pesadelo |
| Meio | Uma Especialidade no nível 5 | `especialidades` | — |
| Meio | Uma conquista Ouro | conquistas desbloqueadas | título no perfil |
| Fim | Estágio 10 nos 12 biomas | progresso por bioma | Nível 100 |
| Fim | Estágios do Pesadelo | `maiorEstagioLimpo(..., pesadelo)` | — |
| Fim | Uma Especialidade no nível `ESPECIALIDADE_NIVEL_MAX` | `especialidades` | — |
| Fim | 100 conquistas | conquistas desbloqueadas | título "A GS Ball" |
| Fim | Bestiário completo de uma espécie | `pokedexKills` (maior pesquisa) | — |

A função de cálculo fica pura, em `src/data/rotaDoTreinador.ts`: recebe o
estado e devolve as fases. Isso permite testar sem tela e mantém tudo fora do
servidor.

## Comportamento que muda para quem já joga

- O Diário saía como painel ao lado do campo e agora abre como janela. Hoje
  ninguém abre o Diário sozinho no login (`abrirPainel` só tem chamadas a partir
  de clique), então não há abertura automática a preservar.
- Quem tinha o hábito de usar o atalho de Tasks ou de Especialidades passa a dar
  um clique a mais. Esse é o custo aceito da entrada única.
- Tutoriais, glossário e Wiki que mencionam "atalho Tasks", "botão Objetivos" ou
  "painel do Diário" precisam ser reescritos. Entra também uma nota de versão.

## Testes

- O selo soma as quatro fontes sem contar nada duas vezes.
- A janela abre na primeira aba com prêmio; sem prêmio, na última usada.
- Aba trancada: mostra o cadeado e o requisito, sem montar o conteúdo.
- `toggleScreen('tasks')` e as outras três telas antigas chegam em `missoes`
  com a aba certa.
- O destaque do passo atual acende na aba certa.
- A Rota do Treinador:
  - escolhe a fase atual certa nos casos de conta nova, meio de jogo e fim de
    jogo;
  - os alvos acompanham as constantes (`ESTAGIOS_PARA_O_LANCE`,
    `ESPECIALIDADE_NIVEL_MAX`, número de biomas).
- Atualizar `journeyNavigation.test` e os testes da coluna e da doca.

## Decidido na revisão

1. "Evoluir 10 POKEs" não tem contador. O dono escolheu trocar por "uma
   conquista Ouro".
2. "Bestiário de um tipo" não tinha agregação por tipo no cliente. Ficou
   "Bestiário completo de uma espécie": a maior pesquisa contra o último marco
   de `MARCOS_BESTIARIO`.
3. O selo do atalho soma Diário, Primeiros Passos e Tasks. Especialidades ficou
   de fora porque a missão de cada nível vem do servidor
   (`minhas_missoes_especialidade`); contá-la exigiria buscar isso no boot.
