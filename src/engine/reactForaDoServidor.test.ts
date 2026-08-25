// PH-148 — o React não pode voltar para o bundle da Edge Function.
//
// ---------------------------------------------------------------------------
// COMO ELE ENTROU
// ---------------------------------------------------------------------------
// `engine/simulation.ts` importava duas coisas de `stores/`:
//
//   emptyWorldState  de stores/worldStore.ts
//   useToastStore    de stores/toastStore.ts
//
// Os dois arquivos criam store com `create` do zustand, e `create` vem de
// `zustand/react` — que importa React. A cadeia inteira:
//
//   edge.ts -> progresso.ts -> headless.ts -> simulation.ts
//           -> worldStore/toastStore -> zustand -> react
//
// Resultado: 28,3 KB de React num servidor que responde JSON e não renderiza
// nada. Edge Function é medida por tempo de inicialização, e o cliente já tem
// timeout de 15s por causa de cold start.
//
// ---------------------------------------------------------------------------
// POR QUE O TESTE OLHA O BUNDLE, E NÃO OS IMPORTS
// ---------------------------------------------------------------------------
// Uma regra de lint sobre "engine não importa stores" seria mais barata e
// erraria: `simulation.ts` PODE importar de `stores/` — o que ele não pode é
// alcançar React. Hoje ele importa `toastStoreVanilla`, que é `stores/` e é
// legítimo.
//
// E a cadeia real teve quatro saltos até um `node_modules`. Nenhuma regra sobre
// caminho de import teria pego isso; o que pega é perguntar ao artefato.
//
// O teste roda sobre o bundle COMMITADO. `bundleDaEdgeAtualizado.test.ts` é
// quem garante que esse arquivo corresponde à fonte — os dois juntos fecham o
// ciclo, e nenhum sozinho basta.
import { describe, expect, it } from 'vitest'

// `?raw` do Vite, e não `node:fs`: `src/` não tem os types de node (o mesmo
// motivo documentado em `render/ambiente.test.ts` e usado em
// `coberturaDeFace.test.ts`). O glob resolve em tempo de build.
const BUNDLE = import.meta.glob('/supabase/functions/jogo/servidor.js', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

/**
 * O que NÃO pode aparecer no servidor, e por quê.
 *
 * São marcadores de MÓDULO (`node_modules/x/`), não nomes soltos: procurar
 * `'react'` cru acusaria qualquer comentário ou nome de variável que contenha a
 * palavra. O bundle do Vite emite `//#region node_modules/<pacote>/...` para
 * cada dependência empacotada, e é isso que se mede.
 */
const PROIBIDOS = [
  // A biblioteca de UI inteira. Foi o caso concreto de PH-148.
  { marcador: 'node_modules/react/', nome: 'react' },
  { marcador: 'node_modules/react-dom/', nome: 'react-dom' },
  // O adaptador React do zustand. É ele que importa o React — barrar só o
  // React deixaria passar o dia em que o zustand mudasse o nome do arquivo
  // interno.
  { marcador: 'zustand/esm/react.mjs', nome: 'zustand/react' },
  // TanStack Query e Radix são exclusivamente de tela. Nunca estiveram no
  // bundle; estão aqui porque o custo de listar é zero e o de descobrir tarde
  // é o mesmo do React.
  { marcador: 'node_modules/@tanstack/', nome: '@tanstack/react-query' },
  { marcador: 'node_modules/@base-ui/', nome: '@base-ui/react' },
]

describe('o bundle da Edge Function não carrega biblioteca de tela (PH-148)', () => {
  const bundle = Object.values(BUNDLE)[0] ?? ''

  it('o bundle foi lido — senão tudo abaixo passa sobre uma string vazia', () => {
    expect(bundle.length).toBeGreaterThan(100_000)
    // Guarda de que estamos medindo o arquivo certo: o marcador de região do
    // Vite tem que existir, senão a busca por `node_modules/...` nunca acharia
    // nada e o teste passaria por não saber olhar.
    expect(bundle).toContain('//#region node_modules/')
  })

  it.each(PROIBIDOS)('não contém $nome', ({ marcador, nome }) => {
    expect(
      bundle.includes(marcador),
      `${nome} voltou para o bundle da Edge Function. O servidor de autoridade responde JSON e não `
      + 'renderiza nada — biblioteca de tela ali é peso morto no cold start, e é sintoma de que a '
      + 'fronteira engine/ x features/ tem um furo. Rode `node scripts/quem-puxa-no-edge.mjs` para '
      + 'ver a cadeia de imports que trouxe.',
    ).toBe(false)
  })

  it('o zustand VANILLA continua lá — o motor precisa dele', () => {
    // O oposto da guarda acima, e ele importa: uma "correção" que arrancasse o
    // zustand inteiro passaria nos casos de cima e quebraria o servidor em
    // runtime, onde o erro custa mais.
    expect(bundle).toContain('zustand/esm/vanilla.mjs')
  })
})
