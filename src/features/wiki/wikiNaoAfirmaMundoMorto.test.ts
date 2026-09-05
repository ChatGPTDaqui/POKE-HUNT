// PH-507 — a Wiki e o tutorial nao voltam a descrever um jogo que nao existe.
//
// ---------------------------------------------------------------------------
// O QUE ESTE TESTE EXISTE PRA IMPEDIR, e por que ele nao e frescura de copy
// ---------------------------------------------------------------------------
// Na reformulacao de 04/09 a Wiki carregava SETE afirmacoes falsas ao mesmo
// tempo, e nenhuma delas tinha reprovado nada:
//
//   1. "auto-pot, auto-catch e auto-revive vem ativados por padrao"
//      — `gameStateDefaults` diz `autoCatch: false, autoRevive: false`.
//   2. "o Novo Continente (Kanto) e liberado depois de derrotar o Lance"
//      — a separacao por regiao acabou; o mundo e 12 biomas.
//   3. "cada hunt tem uma faixa de nivel recomendada"
//      — as faixas de 30 niveis morreram na PH-425.
//   4. "os 11 Pokemon lendarios" / "as 11 hunts BOSS"
//      — a Geracao III (PH-332) levou o numero a 21.
//   5. "Johto e Kanto nao se misturam" (tutorial)
//   6. "voce comeca o jogo com apenas 100 Poke Balls" (tutorial)
//      — a concessao inicial e 500.
//   7. "voce so tem 10 Revives" (tutorial)
//      — sao 50.
//
// A CAUSA RAIZ NAO E DESCUIDO, E FALTA DE PORTAO. `WikiMenu.tsx` e
// `data/tutoriais.ts` nao tinham UM teste. O unico que os tocava era
// `acentuacaoDaCopy.test.ts`, e ele so olha string entre quotes — texto solto
// dentro de JSX passa por ele inteiro, que e a forma de 90% da copy da Wiki.
// Ou seja: a Wiki era a maior superficie de texto do jogo e a menos coberta.
//
// Corrigir as sete sem trancar o resultado seria trabalho perdido pela terceira
// vez. Texto errado nao lanca excecao: ele fica em producao ate um jogador
// reclamar.
//
// ---------------------------------------------------------------------------
// POR QUE VOCABULARIO PROIBIDO, E NAO "CONFERIR SE O TEXTO ESTA CERTO"
// ---------------------------------------------------------------------------
// Nao da pra um teste julgar se uma frase e verdadeira. O que da e barrar as
// PALAVRAS de um modelo de mundo que foi retirado do jogo — "Kanto", "Johto",
// "faixa de nivel". Elas nao tem uso legitimo em copy nova: quem escrever
// "continente Kanto" numa aba da Wiki em 2027 esta descrevendo o jogo de
// 2026-08, e o teste diz isso na cara.
//
// A LISTA E CURTA DE PROPOSITO, e cada entrada tem um motivo nomeado abaixo.
// Um proibido generico ("nao escreva numero") viraria ruido e seria desligado.
//
// O SEGUNDO BLOCO E DIFERENTE E MAIS FORTE: ele nao olha palavra, ele compara a
// Wiki com o `gameStateDefaults` de verdade. Trocar o padrao de `autoCatch` pra
// `true` amanha reprova aqui, e e assim que se descobre que a copy precisa
// mudar junto — sem depender de alguem lembrar.
import { describe, expect, it } from 'vitest'
import { defaultGameStateData } from '@/stores/gameStateDefaults'
import { LEGENDARY_SPECIES_IDS } from '@/data/legendaries'

/**
 * Os fontes de copy do jogador: as abas da Wiki e o conteudo dos tutoriais.
 *
 * `?raw` e o mesmo mecanismo de `hudNaoUsaTitleNativo.test.ts` — ler o texto do
 * arquivo, e nao renderizar o componente. Renderizar exigiria montar as sete
 * abas com store, e o que se checa aqui e a COPY, que existe no fonte.
 */
const FONTES: Record<string, string> = {
  ...(import.meta.glob('./*.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
  ...(import.meta.glob('/src/data/tutoriais.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
  // PH-512: O GLOSSARIO ENTROU, e a lacuna era real. `glossario.ts` e copy de
  // jogador tanto quanto uma aba da Wiki — sao as bolhas que explicam cada
  // rotulo da HUD —, e ficava de fora deste portao so porque o teste nasceu
  // olhando a Wiki. Descoberto ao tirar o PP de tela: o verbete `pp` teria
  // sobrevivido aqui, explicando um numero que nao existe mais em lugar nenhum,
  // e nenhum teste diria nada.
  ...(import.meta.glob('/src/data/glossario.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>),
}

/**
 * Comentario nao e copy.
 *
 * ISTO E O QUE FAZ O TESTE SER USAVEL, e nao um detalhe: o cabecalho deste
 * proprio arquivo, o de `WikiMenu.tsx` e o de `tutoriais.ts` CITAM as frases
 * proibidas pra explicar o que deu errado. Sem esta limpeza o teste reprovaria
 * a documentacao do proprio conserto, e a saida seria parar de documentar — o
 * pior resultado possivel.
 */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

interface Proibido {
  /** O que nao pode aparecer. Case-insensitive. */
  re: RegExp
  /** Por que ele morreu, e o que dizer no lugar. Vai na mensagem da falha. */
  porque: string
}

const PROIBIDOS: Proibido[] = [
  {
    re: /\bKanto\b/i,
    porque:
      'a separacao por regiao acabou — o mundo e 12 biomas (data/biomas.ts) e nao dois continentes. '
      + 'Se a intencao era falar do gate do Lance, ele hoje e progressoDeBioma.ts#bloqueioDoLance.',
  },
  {
    re: /\bJohto\b/i,
    porque:
      'mesma razao que Kanto. A hunt inicial se chama "Rota 46 (Inicial)", sem prefixo de regiao.',
  },
  {
    re: /faixas? de n[ií]vel/i,
    porque:
      'as 3 faixas de 30 niveis morreram na PH-425. A regua e 10 estagios de 10 niveis por bioma '
      + '(data/estagios.ts#ESTAGIOS_POR_BIOMA).',
  },
  {
    re: /\bfaixa\s*(I{1,3}|[123])\b/,
    porque: 'idem — "faixa I/II/III" e o vocabulario do desenho anterior a PH-425.',
  },
  {
    re: /v[eê]m ativad[oa]s? por padr[ãa]o/i,
    porque:
      'esta era a afirmacao falsa numero 1. Duas das quatro automacoes nascem DESLIGADAS — '
      + 'confira gameStateDefaults.ts#autoToggles antes de escrever qual e qual.',
  },
  {
    re: /\b11\s+(POKEs?\s+)?lend[áa]rios?\b/i,
    porque:
      `sao ${LEGENDARY_SPECIES_IDS.length} desde a Geracao III (PH-332). `
      + 'Use LEGENDARY_SPECIES_IDS.length em vez de digitar o numero.',
  },
  {
    re: /\b11\s+hunts?\s+BOSS\b/i,
    porque:
      `sao ${LEGENDARY_SPECIES_IDS.length}, uma por lendario. Use LEGENDARY_SPECIES_IDS.length.`,
  },
  {
    re: /\bPP\b/,
    porque:
      'PH-512: o PP saiu de TODA tela do jogador — da ficha do AbilityHud, da bolha do '
      + 'AbilityTooltip e do verbete do glossario. Ele nunca foi recurso gasto aqui (nenhum golpe '
      + 'fica indisponivel por falta dele), era so a variavel de onde a Recarga e derivada. '
      + 'Explicar a recarga por um numero que o jogador nao ve em lugar nenhum e pior do que nao '
      + 'explicar. Escreva a REGRA ("golpe forte volta mais devagar") e a alavanca que ele controla '
      + '(Velocidade). O campo `pp` continua no dado do golpe e no motor — o que morreu foi a copy.',
  },
]

/** Toda linha de copy (fora de comentario) que casa com o proibido. */
function ocorrencias(fonte: string, re: RegExp): { linha: number; texto: string }[] {
  return semComentarios(fonte)
    .split('\n')
    .map((texto, i) => ({ linha: i + 1, texto }))
    .filter(({ texto }) => re.test(texto))
}

describe('a copy do jogador nao descreve o jogo antigo', () => {
  for (const { re, porque } of PROIBIDOS) {
    it(`nao usa ${re.source}`, () => {
      const achados: string[] = []
      for (const [arquivo, fonte] of Object.entries(FONTES)) {
        for (const { linha, texto } of ocorrencias(fonte, re)) {
          achados.push(`${arquivo}:${linha}  ${texto.trim()}`)
        }
      }
      expect(achados, `${porque}\n\n${achados.join('\n')}`).toEqual([])
    })
  }
})

// ---------------------------------------------------------------------------
// O bloco que compara com o codigo, e nao com uma lista de palavras
// ---------------------------------------------------------------------------
// A regra: se a Wiki NOMEIA uma automacao ao lado da palavra LIGADO ou
// DESLIGADO, ela tem que estar do lado certo. Isso e mais estreito que "a copy
// esta correta" e mais util que "a palavra X e proibida": ele acompanha o
// `gameStateDefaults` sozinho.
//
// A forma que a copy usa e deliberada e o teste depende dela — MAIUSCULA em
// "LIGADO"/"DESLIGADO", e o nome da automacao na mesma FRASE. Se alguem
// reescrever a copy sem as maiusculas, o teste passa a nao achar nada, e e por
// isso que existe o `it` de sanidade no fim: ele afirma que o par continua
// sendo encontrado em algum lugar.
//
// A UNIDADE E A FRASE, E NAO A LINHA, e isto foi conserto de um falso positivo
// do proprio teste na primeira execucao. Em JSX uma frase quebra em tres linhas
// e as tags caem no meio dela:
//
//     <b>Auto-Pot</b> e <b>Auto-Status</b> (curar veneno, paralisia)
//     nascem <b>LIGADOS</b>. <b>Auto-Catch</b> e <b>Auto-Revive</b> nascem{' '}
//     <b>DESLIGADOS</b> — os dois gastam item a cada uso.
//
// Lido por linha, a linha do meio tem "LIGADOS" ao lado de "Auto-Catch" e
// "Auto-Revive" e o teste acusava dois erros que nao existiam. Normalizar
// (tirar tag, tirar `{' '}`, juntar espaco) e cortar em `.` devolve a unidade
// que a regra realmente usa. Quebra de linha nao muda o que a frase afirma, e o
// teste nao pode depender de onde o editor a quebrou.
const AUTOMACOES: { nome: RegExp; chave: keyof typeof DEFAULT_TOGGLES }[] = [
  { nome: /auto-?pot/i, chave: 'autoPot' },
  { nome: /auto-?catch/i, chave: 'autoCatch' },
  { nome: /auto-?revive/i, chave: 'autoRevive' },
  { nome: /auto-?status/i, chave: 'autoStatus' },
]

const DEFAULT_TOGGLES = defaultGameStateData().autoToggles

/**
 * A copy como PROSA: sem tag JSX, sem `{' '}`, com o espaco colapsado.
 *
 * `\b` em `\bLIGADO\b` nao funciona atravessando `</b>` e quebra de linha, e o
 * que a regra pergunta e sobre a frase que o jogador LE — nao sobre o texto que
 * o editor formatou.
 */
function prosa(fonte: string): string {
  return semComentarios(fonte)
    .replace(/\{'\s*'\}/g, ' ')
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
}

/** Frases que afirmam estado inicial, com o veredito que elas declaram. */
function afirmacoesDeEstadoInicial(fonte: string): { texto: string; ligado: boolean }[] {
  return prosa(fonte)
    .split('.')
    .flatMap((texto) => {
      const dizDesligado = /\bDESLIGAD[OA]S?\b/.test(texto)
      const dizLigado = /\bLIGAD[OA]S?\b/.test(texto)
      // Frase que diz os dois ("nasce LIGADO, ao contrario de ... DESLIGADO")
      // nao afirma nada sobre UMA automacao — fica de fora em vez de virar
      // falso positivo. `DESLIGADO` contem `LIGADO`, entao o `\b` a esquerda e
      // o que separa os dois casos.
      if (dizDesligado === dizLigado) return []
      return [{ texto: texto.trim(), ligado: dizLigado }]
    })
}

describe('a copy diz o estado inicial certo de cada automacao', () => {
  const erros: string[] = []
  const conferidas = new Set<string>()

  for (const [arquivo, fonte] of Object.entries(FONTES)) {
    for (const { texto, ligado } of afirmacoesDeEstadoInicial(fonte)) {
      for (const { nome, chave } of AUTOMACOES) {
        if (!nome.test(texto)) continue
        conferidas.add(chave)
        if (DEFAULT_TOGGLES[chave] !== ligado) {
          erros.push(
            `${arquivo} diz que ${chave} nasce ${ligado ? 'LIGADO' : 'DESLIGADO'}, `
            + `mas gameStateDefaults diz ${DEFAULT_TOGGLES[chave] ? 'LIGADO' : 'DESLIGADO'}`
            + `\n    ${texto}`,
          )
        }
      }
    }
  }

  it('nenhuma afirmacao contradiz gameStateDefaults', () => {
    expect(erros, erros.join('\n')).toEqual([])
  })

  // A SANIDADE DO PROPRIO TESTE. Sem isto, apagar a copy toda faria os dois
  // blocos acima passarem verde — o modo de falha mais traicoeiro de um teste
  // de varredura. Ele afirma que a copy REALMENTE fala do estado inicial das
  // quatro, que e o conteudo que a reformulacao acrescentou.
  it('a copy de fato afirma o estado inicial das quatro automacoes', () => {
    expect([...conferidas].sort()).toEqual(['autoCatch', 'autoPot', 'autoRevive', 'autoStatus'])
  })
})
