// Conteudo dos tutoriais.
//
// Hand-authored, sem equivalente na planilha — mesma categoria de
// `data/patchNotes.ts`. Fica em `data/` (e nao dentro da tela) porque duas
// telas o consomem: o disparo automatico e o menu "Repetir Tutoriais".
//
// Cada passo descreve algo que EXISTE na tela hoje. Um tutorial que ensina
// botao inexistente e pior que nenhum tutorial — o jogador procura e nao acha.
//
// ---------------------------------------------------------------------------
// A REFORMULACAO DE 04/09, E O QUE ESTAVA ERRADO ANTES DELA
// ---------------------------------------------------------------------------
// Havia dois tutoriais aqui, `bot` (6 passos) e `cacada` (4 passos), e o
// arranjo tinha tres defeitos medidos no proprio codigo:
//
//  1. SO O `bot` DISPARAVA. `useTutorialInicial` chamava
//     `abrirSeInedito(TUTORIAL_BOT)` e mais nada — o tutorial que ensinava a
//     JOGAR (escolher hunt, curar de graca, o jogo roda sem voce) so aparecia
//     pra quem fosse em Mais > Repetir Tutoriais por conta propria. Ou seja: o
//     primeiro contato do jogador eram 6 passos sobre configuracao de
//     automacao — regra por especie, prioridade de bola, hunts BOSS — antes
//     dele ter visto uma hunt.
//
//  2. O `cacada` ENSINAVA UM MUNDO QUE NAO EXISTE MAIS. "Comece pela Johto
//     Route 46", "Johto e Kanto nao se misturam", "o continente Kanto abre
//     quando voce derrota o Lance". A separacao por regiao acabou (as hunts sao
//     12 biomas), e o Lance virou gate de meio de jogo com criterio proprio
//     (`progressoDeBioma.ts#bloqueioDoLance`).
//
//  3. O `bot` OMITIA O `autoStatus`, que nasce LIGADO — a unica das quatro
//     automacoes que o jogador nao precisa ligar e a unica que ninguem contava
//     pra ele.
//
// O DESENHO NOVO: um tutorial curto no primeiro boot, e os outros disparando NO
// GESTO — quando o jogador abre aquele painel pela primeira vez, que e quando a
// informacao serve. Ver `stores/tutorialStore.ts` (o registro de "ja viu") e os
// hooks em `features/game/hooks/`.
//
// POR QUE O `cacada` NAO FOI SO CORRIGIDO: o conteudo dele se partiu em dois
// destinos naturais — o que o jogador precisa no minuto 1 virou `boasVindas`, e
// o que ele precisa ao abrir a trilha de um bioma virou `estagios`. O id
// `cacada` sai da lista; quem ja o tinha marcado como visto no localStorage
// nao e afetado (a marca e por id, e id que nao existe mais e simplesmente
// ignorado).

export interface PassoTutorial {
  titulo: string
  corpo: string
}

export interface Tutorial {
  id: string
  titulo: string
  resumo: string
  passos: PassoTutorial[]
}

/** Primeiro boot, depois de escolher o inicial. */
export const TUTORIAL_BOAS_VINDAS = 'boasVindas'
/** Ao abrir o painel de Automacoes (o botao de robo) pela primeira vez. */
export const TUTORIAL_BOT = 'bot'
/** Ao abrir a trilha de estagios de um bioma pela primeira vez. */
export const TUTORIAL_ESTAGIOS = 'estagios'
/** Quando o primeiro POKE capturado entra na mochila. */
export const TUTORIAL_CAPTURA = 'captura'

export const TUTORIAIS: Tutorial[] = [
  // TRES PASSOS, E O CORTE FOI DELIBERADO. O que o jogador precisa pra sair da
  // tela inicial e comecar a jogar e: (1) que ele nao aperta botao de ataque,
  // (2) onde clicar pra comecar, (3) que errar nao custa nada. Todo o resto —
  // automacao, estagio, captura, tipo elemental — tem tutorial proprio no
  // gesto, ou esta na Wiki.
  {
    id: TUTORIAL_BOAS_VINDAS,
    titulo: 'Bem-vindo ao NOVO POKE IDLE',
    resumo: 'O essencial: seu POKE luta sozinho, por onde começar e por que errar não custa nada.',
    passos: [
      {
        titulo: 'Seu POKE luta sozinho',
        corpo:
          'Este é um jogo idle: você não aperta botão de ataque. Seu POKE em campo procura o selvagem mais ' +
          'próximo, engaja e escolhe os golpes por conta própria. Seu trabalho é decidir ONDE caçar, cuidar ' +
          'do time e gerenciar o que você ganha.',
      },
      {
        titulo: 'Comece pela Rota 46',
        corpo:
          'O botão Hunt, no meio da barra de baixo, abre a lista de caçadas. A Rota 46 (Inicial) fica no topo, ' +
          'acima do mapa dos biomas — ela é a única feita pro nível 1, e só aparecem POKEs de nível 1 e 2. ' +
          'Entre nela e deixe rodando.',
      },
      {
        titulo: 'Errar não custa nada',
        corpo:
          'Se seu POKE desmaiar, o botão Hospital (que aparece dentro da caçada) leva você até a enfermeira: ' +
          'clique nela e o time inteiro é curado de graça, quantas vezes quiser. E fechar a aba não perde ' +
          'progresso — o servidor continua a caçada e credita o resultado quando você voltar.',
      },
    ],
  },

  // QUATRO PASSOS, ERA SEIS. Saiu daqui o que nao se decide na primeira vez
  // que o painel abre: a regra por especie (que so importa depois de haver mais
  // de um tipo de bola na mochila) e o comportamento nas hunts BOSS (conteudo
  // de fim de jogo). As duas viraram verbete de Wiki.
  //
  // ENTROU o `autoStatus`, que existia no codigo e nao existia aqui.
  {
    id: TUTORIAL_BOT,
    titulo: 'As Automações (o Bot)',
    resumo: 'As quatro automações que agem pelo seu POKE, quais nascem ligadas e por que duas nascem desligadas.',
    passos: [
      {
        titulo: 'O que este painel faz',
        corpo:
          'Aqui vivem as quatro automações que agem pelo seu POKE durante a caçada: usar poção, curar status, ' +
          'jogar bola e reanimar. Cada uma tem um interruptor e a escolha de qual item ela deve gastar.',
      },
      {
        titulo: 'Auto-Pot e Auto-Status já estão ligados',
        corpo:
          'Auto-Pot usa uma poção quando a vida cai à porcentagem que você escolher; "melhor" pega sempre a ' +
          'poção mais forte que você tiver. Auto-Status usa o antídoto certo quando seu POKE é envenenado, ' +
          'queimado, paralisado ou congelado. Sem o item na mochila, nada acontece — o POKE continua apanhando.',
      },
      {
        titulo: 'Auto-Catch nasce DESLIGADO',
        corpo:
          'Com ele ligado, todo selvagem derrotado consome uma bola numa tentativa de captura. Nasce desligado ' +
          'de propósito: a bola é gasta mesmo quando a captura falha, e sua conta começa com 500 Poke Balls — ' +
          'o que acaba rápido com ele ligado. Ligue quando quiser encher a Pokedex ou vender captura na Loja.',
      },
      {
        titulo: 'Auto-Revive nasce DESLIGADO',
        corpo:
          'Se o POKE em campo desmaia, o Bot espera 5 segundos e gasta um Revive pra colocá-lo de pé. Nasce ' +
          'desligado porque sua conta começa com 50 Revives e desmaiar já custa 5% da EXP do nível atual — ' +
          'ajustar a porcentagem do Auto-Pot rende mais que depender do Revive. O Hospital cura de graça; o ' +
          'Revive, não.',
      },
    ],
  },

  // O TUTORIAL DO REDESENHO DE 02/09. Ele existe porque a trilha e a unica
  // tela do jogo em que o jogador toma uma decisao de progressao, e nada
  // explicava a regra: estagio N+1 pede o Lord do estagio N.
  {
    id: TUTORIAL_ESTAGIOS,
    titulo: 'Estágios, salas e o Lord',
    resumo: 'Como um bioma é dividido, o que abre o estágio seguinte e por que a barra para em 29 de 30.',
    passos: [
      {
        titulo: 'Cada bioma tem 10 estágios',
        corpo:
          'Os 12 biomas nascem todos abertos, e cada um é uma trilha de 10 estágios de 10 níveis: o estágio 1 ' +
          'é Lv 1-10, o estágio 10 é Lv 91-100. Seu progresso é separado por bioma — você pode estar no ' +
          'estágio 7 do Marinho e no 2 do Ígneo ao mesmo tempo.',
      },
      {
        titulo: 'Salas, e o chefe que fecha cada uma',
        corpo:
          'Um estágio é uma sequência de salas (3 no estágio 1, chegando a 8 no estágio 10). Cada sala pede ' +
          '30 abates — mas os 29 primeiros são de selvagens comuns, e o trigésimo é o chefe da sala. Por isso ' +
          'a barra para em 29 de 30 e o campo deixa de repovoar: falta o chefe. Nas salas do meio ele é um ' +
          'Guardião; na última sala do estágio, um Lord, mais forte.',
      },
      {
        titulo: 'O Lord é a chave do estágio seguinte',
        corpo:
          'Vencer o Lord fecha o estágio e libera o próximo daquele bioma. Você pode voltar e repetir um ' +
          'estágio já limpo quando quiser (estágio limpo não repõe chefe — a sala avança direto), e por padrão ' +
          'o jogo REPETE o estágio em que você está em vez de avançar sozinho: é um jogo idle, e sair do lugar ' +
          'que você escolheu tiraria você da espécie que foi caçar. O interruptor pra mudar isso está nas ' +
          'Automações.',
      },
    ],
  },

  // Dispara com o primeiro POKE na mochila. Os tres pontos aqui sao os que
  // geram "isso e bug?" no primeiro contato: o POKE nao aparece na Equipe, ele
  // volta pro Nivel 1, e o numero colorido do nome nao e a especie.
  {
    id: TUTORIAL_CAPTURA,
    titulo: 'Seu primeiro POKE capturado',
    resumo: 'Para onde o POKE capturado vai, por que ele volta ao Nível 1 e o que a raridade dele significa.',
    passos: [
      {
        titulo: 'Ele foi pra Mochila, não pra Equipe',
        corpo:
          'POKE capturado entra na Mochila, não na Equipe. A Equipe são os até 6 que caçam com você; a Mochila ' +
          'guarda o resto. Pra colocá-lo em campo, abra a Equipe e traga ele — ou venda na Loja, que é de longe ' +
          'a forma mais lucrativa de ganhar ouro neste jogo.',
      },
      {
        titulo: 'Ele voltou pro Nível 1 — isso é normal',
        corpo:
          'Todo POKE capturado entra no Nível 1, qualquer que fosse o nível dele em campo. O que ele CARREGA do ' +
          'momento da captura é a raridade, o shiny, a natureza e os IVs — e é isso que decide se ele vale a ' +
          'pena criar.',
      },
      {
        titulo: 'A raridade é o que o torna forte',
        corpo:
          'A cor do nome dele é a raridade, sorteada na hora em que ele apareceu e independente da espécie: um ' +
          'Rattata pode nascer Mythic. Quanto mais rara, maior o multiplicador de atributos E o preço de venda. ' +
          'A Wiki tem a tabela completa, e a Calculadora de Força simula qualquer espécie em qualquer raridade.',
      },
    ],
  },
]

export function tutorialPorId(id: string): Tutorial | null {
  return TUTORIAIS.find((t) => t.id === id) ?? null
}
