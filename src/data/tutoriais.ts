// Conteudo dos tutoriais.
//
// Hand-authored, sem equivalente na planilha — mesma categoria de
// `data/patchNotes.ts`. Fica em `data/` (e nao dentro da tela) porque duas
// telas o consomem: o disparo automatico no primeiro boot e o menu "Repetir
// Tutoriais".
//
// Cada passo descreve algo que EXISTE na tela hoje. Um tutorial que ensina
// botao inexistente e pior que nenhum tutorial — o jogador procura e nao acha.

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

export const TUTORIAL_BOT = 'bot'

export const TUTORIAIS: Tutorial[] = [
  {
    id: TUTORIAL_BOT,
    titulo: 'Como funciona o Bot',
    resumo: 'Auto-pot, auto-catch e auto-revive: o que cada um faz, quanto custa e por que dois deles comecam desligados.',
    passos: [
      {
        titulo: 'O que o Bot e',
        corpo:
          'O Bot e o conjunto de automacoes que agem pelo seu POKE durante a cacada: usar pocao, jogar bola e reanimar. ' +
          'Ele fica no botao com o icone de robo, no canto inferior direito da tela.',
      },
      {
        titulo: 'Auto-Pot — comeca LIGADO, a 50% de vida',
        corpo:
          'Quando a vida do POKE em campo cai a 50% ou menos, o Bot usa uma pocao automaticamente. ' +
          'Voce escolhe a porcentagem e qual pocao usar; "melhor" pega sempre a pocao mais forte que voce tiver. ' +
          'Sem pocao no inventario, nada acontece — o POKE continua apanhando.',
      },
      {
        titulo: 'Auto-Catch — comeca DESLIGADO',
        corpo:
          'Com ele ligado, toda vez que um POKE selvagem e derrotado o Bot gasta uma bola tentando captura-lo. ' +
          'Comeca desligado de proposito: a bola e consumida na tentativa, mesmo quando a captura falha, ' +
          'e voce comeca o jogo com apenas 100 Poke Balls. Ligue quando quiser encher a Pokedex.',
      },
      {
        titulo: 'Auto-Revive — comeca DESLIGADO',
        corpo:
          'Se o POKE em campo desmaia, o Bot espera 5 segundos e gasta um Revive pra coloca-lo de pe. ' +
          'Comeca desligado porque voce so tem 10 Revives — desmaiar tambem custa uma fatia da EXP do nivel atual, ' +
          'entao vale mais ajustar o auto-pot do que depender do revive.',
      },
      {
        titulo: 'Regra por especie',
        corpo:
          'Dentro do painel do Bot da pra criar regras do tipo "capturar Dratini com Ultra Ball". ' +
          'A regra por especie tem prioridade sobre a bola padrao e sobre a bola de shiny. ' +
          'Se a bola daquela regra acabar, o Bot NAO troca por outra — ele simplesmente nao tenta.',
      },
      {
        titulo: 'Nas hunts BOSS o Bot nao age',
        corpo:
          'Em hunt de BOSS (lendarios e o Campeao Lance) auto-pot e auto-revive ficam desligados, ' +
          'independente da sua configuracao. Morrer la e definitivo: voce volta pro Hospital.',
      },
    ],
  },
  {
    id: 'cacada',
    titulo: 'Sua primeira cacada',
    resumo: 'Como escolher uma hunt, o que acontece enquanto voce esta fora e onde curar.',
    passos: [
      {
        titulo: 'Escolha uma hunt',
        corpo:
          'O circulo grande do meio do menu abre a lista de hunts. Cada uma tem uma faixa de nivel e um elenco proprio. ' +
          'Comece pela Johto Route 46 (Inicial): la so aparecem POKEs de nivel 1 e 2.',
      },
      {
        titulo: 'Johto e Kanto nao se misturam',
        corpo:
          'Hunt de Johto so tem POKE de Johto; hunt de Kanto so tem POKE de Kanto. ' +
          'O continente Kanto abre quando voce derrota o Campeao Lance.',
      },
      {
        titulo: 'O jogo continua sem voce',
        corpo:
          'Fechou a aba? O servidor continua simulando a cacada e credita o resultado quando voce voltar. ' +
          'O combate ausente e um pouco mais lento que o ao vivo, de proposito — jogar acordado sempre rende mais.',
      },
      {
        titulo: 'Curar custa zero',
        corpo:
          'O botao Hospital (so aparece dentro de uma hunt) leva voce de volta a enfermeira. ' +
          'Clique nela pra curar a equipe inteira de graca.',
      },
    ],
  },
]

export function tutorialPorId(id: string): Tutorial | null {
  return TUTORIAIS.find((t) => t.id === id) ?? null
}
