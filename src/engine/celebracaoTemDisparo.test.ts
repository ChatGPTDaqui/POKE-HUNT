// Toda celebracao tem quem a dispare — e nenhum splash órfão sobrou (PH-192).
//
// POR QUE ESTE TESTE EXISTE, e ele nasce de um defeito real:
//
// `LevelUpSplash.tsx` e `levelUpSplashStore.ts` existiam, estavam MONTADOS no
// `JogoCarregado`, e `show()` nunca foi chamado em lugar nenhum. O splash de
// level-up nunca apareceu no jogo desde a migracao pra React (9976ea9c) — os
// dois pontos que o disparavam no vanilla (level-up do TREINADOR em
// js/main.js:288, e EVOLUCAO em js/main.js:658) se perderam no porte.
//
// Ninguem percebeu por anos porque a falha e MUDA: nao ha erro, nao ha aviso, e
// o componente montado passa a impressao de que a feature existe. Nenhum teste
// de unidade pegaria — o componente funciona perfeitamente, so nunca e acionado.
//
// Entao este teste le o FONTE e verifica a fiacao. E o mesmo padrao de
// `bundleDaEdgeAtualizado.test.ts`: quando a garantia e "estes dois arquivos
// concordam", o teste tem que olhar os dois arquivos.
import { describe, expect, it } from 'vitest'
import simulacao from './simulation.ts?raw'
import controlador from './controller.ts?raw'
import jogoCarregado from '@/features/game/components/JogoCarregado.tsx?raw'

/** Remove comentarios pra a busca nao casar com a propria documentacao. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('todo marco tem disparo de celebracao (PH-192)', () => {
  const sim = semComentarios(simulacao)
  const ctrl = semComentarios(controlador)

  it('level-up do POKE celebra', () => {
    expect(sim, 'simulation.ts nao empurra celebracao de nivel').toContain("tipo: 'nivel'")
  })

  it('level-up do TREINADOR celebra', () => {
    // Um dos dois casos do vanilla que se perderam na migracao. Se este teste
    // ficar vermelho de novo, o fio soltou pela segunda vez.
    expect(sim, 'simulation.ts nao empurra celebracao de treinador').toContain("tipo: 'treinador'")
  })

  it('EVOLUCAO celebra', () => {
    // O outro caso do vanilla.
    expect(ctrl, 'controller.ts nao empurra celebracao de evolucao').toContain("tipo: 'evolucao'")
  })

  it('SHINY capturado celebra', () => {
    expect(sim, 'simulation.ts nao empurra celebracao de shiny').toContain("tipo: 'shiny'")
  })

  it('os disparos usam o store VANILLA, nao o hook React', () => {
    // `simulation.ts` vai pro bundle da Edge Function. Importar o store criado
    // com o `create` de `zustand/react` puxaria o React pra dentro de um
    // servidor que nao renderiza nada — a mesma razao de `toastStoreVanilla`.
    expect(sim).toContain('celebracaoStoreVanilla')
    expect(sim).not.toMatch(/from '@\/stores\/celebracaoStore'/)
  })
})

describe('o splash morto nao voltou (PH-192)', () => {
  it('JogoCarregado monta a camada de celebracao', () => {
    expect(jogoCarregado).toContain('<CamadaDeCelebracao />')
  })

  it('nenhuma referencia a LevelUpSplash sobrou', () => {
    // Duas superficies pro mesmo evento e como o defeito nasce de novo: alguem
    // religa o `show()` um dia e passam a existir dois splashes concorrentes.
    expect(jogoCarregado).not.toContain('LevelUpSplash')
    expect(jogoCarregado).not.toContain('levelUpSplash')
  })
})

describe('o servidor nao celebra (PH-192)', () => {
  it('todo disparo em simulation.ts esta dentro do guard `!silent`', () => {
    // `simulation.ts` roda TAMBEM no servidor (bundle da Edge), e la o flush
    // simula com `silent: true`. Um disparo fora do guard empurraria celebracao
    // numa fila que ninguem consome — vazamento de memoria no servidor, mudo,
    // proporcional ao numero de abates simulados.
    //
    // A verificacao e por INDENTACAO porque e o que sobrevive a refatoracao: o
    // bloco `if (!silent) {` esta em 2 espacos, entao tudo dentro dele comeca
    // com pelo menos 4. Um disparo colado na margem de 4 espacos estaria fora.
    const linhas = semComentarios(simulacao).split('\n')
    const disparos = linhas
      .map((linha, i) => ({ linha, n: i + 1 }))
      .filter(({ linha }) => linha.includes('celebracaoStore.getState().celebrar('))

    expect(disparos.length, 'nenhum disparo encontrado — o teste rodaria no vacuo').toBeGreaterThan(0)

    const inicioDoGuard = linhas.findIndex((l) => l.trim() === 'if (!silent) {')
    expect(inicioDoGuard, 'nao achei o `if (!silent) {`').toBeGreaterThan(-1)

    for (const { linha, n } of disparos) {
      const recuo = linha.length - linha.trimStart().length
      expect(
        recuo,
        `disparo na linha ${n} tem recuo ${recuo}: parece estar FORA do \`if (!silent)\`. `
        + 'No servidor isso enche uma fila que ninguem consome.',
      ).toBeGreaterThanOrEqual(6)
      expect(n, `disparo na linha ${n} vem ANTES do guard`).toBeGreaterThan(inicioDoGuard)
    }
  })
})
