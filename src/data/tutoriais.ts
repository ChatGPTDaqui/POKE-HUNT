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
    resumo: 'Auto-pot, auto-catch e auto-revive: o que cada um faz, quanto custa e por que dois deles começam desligados.',
    passos: [
      {
        titulo: 'O que o Bot é',
        corpo:
          'O Bot é o conjunto de automações que agem pelo seu POKE durante a caçada: usar poção, jogar bola e reanimar. ' +
          'Ele fica no botão com o ícone de robô, na barra de ação, ao lado dos golpes.',
      },
      {
        titulo: 'Auto-Pot — começa LIGADO, a 70% de vida',
        corpo:
          'Quando a vida do POKE em campo cai a 70% ou menos, o Bot usa uma poção automaticamente. ' +
          'Você escolhe a porcentagem e qual poção usar; "melhor" pega sempre a poção mais forte que você tiver. ' +
          'Sem poção no inventário, nada acontece — o POKE continua apanhando.',
      },
      {
        titulo: 'Auto-Catch — começa DESLIGADO',
        corpo:
          'Com ele ligado, toda vez que um POKE selvagem e derrotado o Bot gasta uma bola tentando captura-lo. ' +
          'Começa desligado de propósito: a bola é consumida na tentativa, mesmo quando a captura falha, ' +
          'e você começa o jogo com apenas 100 Poke Balls. Ligue quando quiser encher a Pokedex.',
      },
      {
        titulo: 'Auto-Revive — começa DESLIGADO',
        corpo:
          'Se o POKE em campo desmaia, o Bot espera 5 segundos e gasta um Revive pra colocá-lo de pé. ' +
          'Começa desligado porque você só tem 10 Revives — desmaiar também custa uma fatia da EXP do nível atual, ' +
          'então vale mais ajustar o auto-pot do que depender do revive.',
      },
      {
        titulo: 'Regra por espécie',
        corpo:
          'Dentro do painel do Bot da pra criar regras do tipo "capturar Dratini com Ultra Ball". ' +
          'A regra por espécie tem prioridade sobre a bola padrão e sobre a bola de shiny. ' +
          'Se a bola daquela regra acabar, o Bot NÃO troca por outra — ele simplesmente não tenta.',
      },
      {
        titulo: 'Nas hunts BOSS o Bot não age',
        corpo:
          'Em hunt de BOSS (lendários e o Campeão Lance) auto-pot e auto-revive ficam desligados, ' +
          'independente da sua configuração. Morrer lá é definitivo: você volta pro Hospital.',
      },
    ],
  },
  {
    id: 'cacada',
    titulo: 'Sua primeira caçada',
    resumo: 'Como escolher uma hunt, o que acontece enquanto você está fora e onde curar.',
    passos: [
      {
        titulo: 'Escolha uma hunt',
        corpo:
          'O botão Hunt, no meio da barra de baixo, abre a lista. Cada hunt tem uma faixa de nível e um elenco próprio. ' +
          'Comece pela Johto Route 46 (Inicial): lá só aparecem POKEs de nível 1 e 2.',
      },
      {
        titulo: 'Johto e Kanto não se misturam',
        corpo:
          'Hunt de Johto só tem POKE de Johto; hunt de Kanto só tem POKE de Kanto. ' +
          'O continente Kanto abre quando você derrota o Campeão Lance.',
      },
      {
        titulo: 'O jogo continua sem você',
        corpo:
          'Fechou a aba? O servidor continua simulando a caçada e credita o resultado quando você voltar. ' +
          'O combate ausente e um pouco mais lento que o ao vivo, de propósito — jogar acordado sempre rende mais.',
      },
      {
        titulo: 'Curar custa zero',
        corpo:
          'O botão Hospital (só aparece dentro de uma hunt) leva você de volta a enfermeira. ' +
          'Clique nela pra curar a equipe inteira de graça.',
      },
    ],
  },
]

export function tutorialPorId(id: string): Tutorial | null {
  return TUTORIAIS.find((t) => t.id === id) ?? null
}
