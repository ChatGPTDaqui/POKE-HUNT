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
