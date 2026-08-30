// PH-96: duas coisas que so quebram em silencio.
//
// 1. ARTE NOVA SEM AMBIENTE. A tabela de presets e explicita de proposito (um
//    `includes('cave')` classificaria `cave-volcanic` como caverna e daria
//    poeira a um mapa de lava). O preco de ser explicita e que a proxima arte
//    a entrar no jogo cai no default 'nenhum' e fica PARADA — sem erro, sem
//    aviso, e ninguem olha. Este teste e o aviso.
//
// 2. A CAMADA TOCANDO O RNG DO MOTOR. `world.rng` e autoritativo e
//    compartilhado com o resim do servidor: uma chamada de sorteio a mais no
//    cliente desloca a sequencia inteira e o flush passa a divergir do que o
//    jogador viu (a classe de bug do PH-37). Enfeite nao pode ter esse poder, e
//    a unica coisa que impede e a disciplina de quem edita o arquivo.
import { describe, expect, it } from 'vitest'

import { COLISAO_POR_ARTE } from '@/data/generated/subBiomaCollision.generated'
import { presetDaArte } from './ambiente'
// `?raw` do Vite, e nao `readFileSync`: o projeto de `src/` NAO tem os types de
// node, e adicionar era o remedio errado — abriria a porta pra codigo de
// browser importar `fs` e o `tsc` deixar passar. O import cru resolve em tempo
// de build, funciona igual no Vitest, e nao muda nada do que o app pode
// importar.
import fonteBruta from './ambiente.ts?raw'
import fonteDoClima from './climaVisual.ts?raw'
import fonteDasGotas from './gotas.ts?raw'

describe('ambiente: toda arte de hunt tem vida (PH-96)', () => {
  // `COLISAO_POR_ARTE` e a lista canonica de artes jogaveis: e a chave por
  // ARTE que o walk-block usa, e ela cobre bioma, sub-bioma com arte propria e
  // hunt sem sistema de salas de uma vez (Modo Pesadelo, BOSS, Lance, treino).
  // Iterar ela e o que faz uma arte nova ser pega automaticamente, sem
  // ninguem lembrar de cadastrar nada aqui.
  const artes = Object.keys(COLISAO_POR_ARTE)

  it('a lista canonica de artes nao esta vazia', () => {
    // Guarda anti-teste-vacuo: se o dado gerado sumir ou trocar de forma, o
    // `for` abaixo passaria sem verificar nada.
    expect(artes.length).toBeGreaterThan(20)
  })

  it.each(artes)('%s tem preset de ambiente', (arte) => {
    expect(
      presetDaArte(arte),
      `${arte} caiu no default e vai ficar parada. Adicione uma linha em PRESET_POR_ARTE `
      + '(render/ambiente.ts) — se a arte de fato nao deve ter nada, mapeie pra "nenhum" '
      + 'explicitamente pra a escolha ficar registrada.',
    ).not.toBe('nenhum')
  })

  it('arte desconhecida cai em "nenhum" em vez de estourar', () => {
    // O default existe pra hunt de conteudo futuro nao derrubar o desenho antes
    // de alguem escolher o ambiente dela.
    expect(presetDaArte('assets/hunt-backgrounds/nao-existe.jpg')).toBe('nenhum')
    expect(presetDaArte(null)).toBe('nenhum')
    expect(presetDaArte(undefined)).toBe('nenhum')
  })
})

// PH-255 — as cinco artes cujo NOME contradiz o DESENHO.
//
// O bloco acima prova que toda arte tem ALGUM preset, e ele nunca teria pego
// este bug: `cidade` e um preset perfeitamente valido, e `town-night.jpg` e um
// nome perfeitamente convincente. O que estas linhas travam e a classificacao
// por nome de arquivo voltar numa arrumacao futura — sao exatamente as cinco em
// que a intuicao pelo nome leva pro lado errado.
describe('preset sai do DESENHO, nao do nome do arquivo (PH-255)', () => {
  const RECLASSIFICADAS: [string, string, string, string][] = [
    ['town-night.jpg', 'folha', 'cidade', 'mata de noite com rio, lagoa e vaga-lume — zero construcoes'],
    ['town.jpg', 'folha', 'cidade', 'duas construcoes numa mesa; o resto e floresta, lago e duas quedas'],
    ['dojo.jpg', 'folha', 'poeira', 'jardim japones com cerejeira, rio de carpas e piso molhado'],
    ['dragon.jpg', 'brasa', 'poeira', 'rio de lava atravessando a arte, geiser e tocha acesa'],
    ['mountain.jpg', 'folha', 'neve', 'vale verde com rio de degelo; neve so nos picos do fundo'],
  ]

  it.each(RECLASSIFICADAS)('%s e "%s" (era "%s"): %s', (arquivo, esperado, antigo) => {
    expect(
      presetDaArte(`assets/hunt-backgrounds/${arquivo}`),
      `${arquivo} voltou pro preset que o NOME sugere ("${antigo}"). Abra a arte antes de mudar `
      + 'esta linha — o motivo de cada uma esta em comentario na propria entrada de PRESET_POR_ARTE.',
    ).toBe(esperado)
  })

  it('nenhuma delas virou "agua" sem referencia de mascara pintada', () => {
    // `lerArtesDeAgua()` (scripts/build-agua-mask.js) monta a fila de mascara
    // lendo `'agua'` desta tabela, e cada arte da fila EXIGE um arquivo pintado
    // a mao em `scripts/agua-refs/`. Marcar `agua` sem pintar a referencia
    // quebra o build da mascara pedindo arquivo que nao existe — e as quatro
    // primeiras tem agua bem visivel, entao a tentacao e real.
    for (const [arquivo] of RECLASSIFICADAS) {
      expect(presetDaArte(`assets/hunt-backgrounds/${arquivo}`)).not.toBe('agua')
    }
  })
})

describe('ambiente nao encosta na simulacao (PH-96)', () => {
  const bruto = fonteBruta
  // Comentario fora antes de procurar: o arquivo FALA de `world.rng` sem
  // parar, justamente pra explicar por que nao o usa. A primeira versao deste
  // teste reprovou no proprio texto que documenta a regra — o que se quer
  // afirmar e "o CODIGO nao usa", nao "o arquivo nao menciona".
  const fonte = bruto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('nao importa nada do motor', () => {
    // Um import de `@/engine/*` aqui e o primeiro passo pra a camada ler (ou
    // pior, sortear com) o estado autoritativo. O teste e estatico de
    // proposito: o dano nao aparece em runtime no cliente — aparece no flush
    // seguinte, do lado do servidor, como divergencia.
    const imports = [...fonte.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
    const proibidos = imports.filter((i) => i.startsWith('@/engine') || i.includes('worldStore'))
    expect(proibidos, `imports proibidos: ${proibidos.join(', ')}`).toEqual([])
  })

  it('nao menciona o rng do mundo', () => {
    expect(fonte).not.toMatch(/world\.rng|useWorldStore|sortear\(/)
  })

  it('tem gerador proprio, e nao Math.random', () => {
    // `Math.random` nao dessincronizaria o servidor (nao passa pelo Rng do
    // mundo), mas tornaria a camada diferente entre sessoes e entre jogadores
    // sem motivo — e e exatamente o que `determinismo.test.ts` existe pra
    // manter fora do projeto. O gerador local resolve os dois.
    expect(fonte).not.toMatch(/Math\.random/)
    expect(fonte).toMatch(/function sorteioLocal/)
  })
})

// ---------------------------------------------------------------------------
// A MESMA REGRA NAS CAMADAS IRMAS (PH-232)
// ---------------------------------------------------------------------------
// A regra de "sorteio local, nunca `Math.random`" estava escrita no cabecalho
// de `climaVisual.ts` desde o PH-141 ("Sorteio local, igual `ambiente.ts`") e
// nao era verdade: a reciclagem por borda chamava `Math.random` direto. Passou
// despercebida por seis issues porque o guard so olhava um arquivo.
//
// Nao dessincronizava o servidor — nao passa pelo `Rng` do mundo — mas fazia a
// camada ser diferente entre sessoes e entre jogadores sem motivo, que e
// exatamente o que `determinismo.test.ts` existe pra manter fora do projeto.
//
// `gotas.ts` entra na mesma varredura por ser novo e por ser compartilhado
// pelas duas camadas: um `Math.random` ali contaminaria as duas de uma vez.
describe('as camadas irmas seguem a mesma regra (PH-232)', () => {
  const semComentario = (bruto: string) =>
    bruto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  const arquivos: Array<[string, string]> = [
    ['climaVisual.ts', semComentario(fonteDoClima)],
    ['gotas.ts', semComentario(fonteDasGotas)],
  ]

  it.each(arquivos)('%s nao usa Math.random', (_nome, fonte) => {
    expect(fonte).not.toMatch(/Math\.random/)
  })

  it.each(arquivos)('%s nao toca o rng do mundo', (_nome, fonte) => {
    expect(fonte).not.toMatch(/world\.rng|useWorldStore|sortear\(/)
  })

  it('gotas.ts nao importa nada do motor', () => {
    // `climaVisual.ts` fica de fora deste caso, e a excecao e legitima: ele
    // importa o TIPO `ClimaTipo` de `@/engine/types`, que e a unica forma de
    // ele saber qual clima desenhar. Tipo nao vira codigo e nao pode ler
    // estado. `gotas.ts` nao tem nem essa necessidade — ele so recebe numeros.
    const imports = [...arquivos[1][1].matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
    const proibidos = imports.filter((i) => i.startsWith('@/') || i.includes('worldStore'))
    expect(proibidos, `imports proibidos: ${proibidos.join(', ')}`).toEqual([])
  })
})
