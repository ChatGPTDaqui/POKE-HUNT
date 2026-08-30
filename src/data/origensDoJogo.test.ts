// PH-293 — as origens que o servidor libera sao as mesmas que o cliente conhece.
//
// O INCIDENTE
// -----------------------------------------------------------------------------
// A lista de origens de CORS vivia so no secret `ORIGENS_PERMITIDAS`. Secret nao
// aparece em code review, nao entra em teste e nao tem historico. Quando o
// cliente de staging subiu, ninguem lembrou de acrescentar a origem dele — e o
// ambiente inteiro passou a carregar a tela sem nunca carregar o jogo, com a
// mensagem de erro acusando o bloqueador de anuncios do jogador.
//
// Medido em 30/08, um `OPTIONS` por origem contra `jogo-dev`:
//
//   https://dev.poke-hunt-euj.pages.dev  ->  (sem access-control-allow-origin)
//   http://localhost:5173                ->  liberado
//   https://poke-hunt-euj.pages.dev      ->  liberado
//
// Pior que "um ambiente a menos": o pre-voo de toda promocao `dev`->`main` manda
// abrir o cliente de staging e conferir que a tela sobe. Ela sobe. O jogo e que
// nao carrega, e quem seguisse o passo ao pe da letra culparia o proprio
// navegador — foi o que aconteceu.
//
// A LISTA AGORA E CODIGO, E EM DOIS LUGARES
// -----------------------------------------------------------------------------
// `src/data/origensDoJogo.ts` (cliente, pra mensagem de erro saber se a origem
// atual e liberada) e `supabase/functions/jogo/index.ts` (servidor, que decide
// de fato). Nao da pra importar um do outro: o segundo roda no Deno e nao
// enxerga `src/`.
//
// Duas copias divergem — e a divergencia aqui reproduz exatamente o bug que a
// issue documenta, so que com um culpado a mais (o cliente diria "endereco nao
// liberado" pra uma origem que o servidor aceita, ou vice-versa). Entao a
// comparacao e teste, no mesmo padrao de `gravarProgressoCobreOMapper`.
import { describe, expect, it } from 'vitest'
import { ORIGENS_DO_JOGO, origemConhecida } from './origensDoJogo'
import { mensagemDeFalhaDeRede } from '@/lib/erroDeRede'

import fonteDaEdge from '/supabase/functions/jogo/index.ts?raw'

/** As origens escritas na copia do servidor. */
function origensDoServidor(): string[] {
  const bloco = fonteDaEdge.match(/const ORIGENS_DO_JOGO = \[([\s\S]*?)\]/)
  if (!bloco) throw new Error('bloco ORIGENS_DO_JOGO nao encontrado em supabase/functions/jogo/index.ts')
  return [...bloco[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

describe('cliente e servidor concordam sobre as origens (PH-293)', () => {
  it('a varredura achou o fonte da Edge', () => {
    // Guarda anti-vacuo: com o import quebrado a comparacao abaixo compararia
    // a lista do cliente com ela mesma.
    expect(fonteDaEdge).toContain('criarApp')
    expect(origensDoServidor().length).toBeGreaterThan(0)
  })

  it('as duas listas sao identicas, na mesma ordem', () => {
    expect(origensDoServidor()).toEqual([...ORIGENS_DO_JOGO])
  })

  it('o cliente de staging esta la — e era ele que faltava', () => {
    expect(ORIGENS_DO_JOGO).toContain('https://dev.poke-hunt-euj.pages.dev')
  })

  it('producao e o dev local continuam, porque isto e acrescimo e nao troca', () => {
    expect(ORIGENS_DO_JOGO).toContain('https://poke-hunt-euj.pages.dev')
    expect(ORIGENS_DO_JOGO).toContain('http://localhost:5173')
  })

  it('nenhum curinga entrou na lista', () => {
    // `*` junto de `Authorization` deixaria qualquer site chamar a rota com o
    // token do jogador. A lista ter virado codigo nao afrouxa isso.
    for (const origem of ORIGENS_DO_JOGO) {
      expect(origem, `origem com curinga: ${origem}`).not.toContain('*')
      expect(origem).toMatch(/^https?:\/\//)
    }
  })

  it('o secret continua ACRESCENTANDO, e nao substituindo', () => {
    // Se alguem trocar o `[...ORIGENS_DO_JOGO, ...secret]` por so o secret, o
    // staging quebra de novo — e de novo em silencio.
    expect(fonteDaEdge).toContain('...ORIGENS_DO_JOGO')
    expect(fonteDaEdge).toContain("Deno.env.get('ORIGENS_PERMITIDAS')")
  })
})

describe('a mensagem de erro para de culpar o navegador (PH-293)', () => {
  it('origem conhecida: continua falando de bloqueador', () => {
    // O caso comum — jogador em producao com uBlock barrando o request. A frase
    // antiga continua sendo a certa ali.
    expect(mensagemDeFalhaDeRede(true, true)).toContain('bloqueador de anuncios')
  })

  it('origem NAO liberada: aponta o servidor, e diz que nao e o navegador', () => {
    const m = mensagemDeFalhaDeRede(true, false)
    expect(m).toContain('nao esta na')
    expect(m).toContain('nao e problema do seu navegador')
    expect(m, 'a acusacao errada nao pode sobrar').not.toContain('bloqueador de anuncios')
  })

  it('offline ganha da origem — sem internet nada mais importa', () => {
    expect(mensagemDeFalhaDeRede(false, false)).toContain('Sem conexao')
  })

  it('fora do navegador `origemConhecida` nao acusa ninguem', () => {
    // Em teste e no SSR nao ha `location`. Chutar "origem recusada" ali seria um
    // palpite pior que o silencio.
    expect(origemConhecida()).toBe(true)
  })

  it('origemConhecida responde pelas origens da lista', () => {
    expect(origemConhecida('https://dev.poke-hunt-euj.pages.dev')).toBe(true)
    expect(origemConhecida('https://site-de-terceiro.example')).toBe(false)
  })
})
