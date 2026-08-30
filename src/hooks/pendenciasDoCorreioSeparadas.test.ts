// PH-287 — o sino do Correio separa "mensagem por ler" de "item por coletar".
//
// O QUE ESTA ISSUE CONSERTA, e nao e estado
// -----------------------------------------------------------------------------
// Carta com item anexado conta DUAS vezes no sino: uma como mensagem nao lida,
// outra como anexo por coletar. Isso e deliberado (PH-22, PH-164) — sem isso o
// presente sumiria do sino antes de o jogador recolher o item.
//
// O efeito colateral e que o contador anda assim:
//
//     anexo   0 -> 2 -> 1 -> 0
//                  ^    ^    ^
//                  |    |    coletar_anexo_correio
//                  |    marcar_conversa_lida (ler a mensagem)
//                  chega a carta com item
//
// O jogador le a mensagem, o numero cai de 2 pra 1, e o sino CONTINUA ACESO sem
// nada explicando. A bancada `scripts/harness/badge-do-correio.mjs` ja tinha
// provado que o estado zera nas tres fontes (foi o que fechou a PH-213 como nao
// reproduzida); o que faltava era a tela dizer O QUE falta, e nao so quantos.
//
// A separacao ja existia na origem: a RPC devolve `naoLidas` e `anexosPendentes`
// por conversa. Ela era jogada fora numa soma. Estes casos trancam a separacao
// sobrevivendo ate a tela.
import { describe, expect, it } from 'vitest'
import { resumoDoCorreio, fraseDasPendencias } from './usePendencias'

import fonteDaDoca from '@/components/hud/ActionDock.tsx?raw'
import fonteDoCorreio from '@/features/correio/CorreioMenu.tsx?raw'

function conversa(naoLidas: number, anexosPendentes: number) {
  return { naoLidas, anexosPendentes }
}

describe('resumoDoCorreio separa as duas naturezas (PH-287)', () => {
  it('sem dado nenhum e zero em tudo — nao um `undefined` que vira "NaN" na tela', () => {
    expect(resumoDoCorreio(undefined)).toEqual({ total: 0, porLer: 0, anexos: 0 })
  })

  it('caixa vazia nao acende nada', () => {
    expect(resumoDoCorreio({ conversas: [], avisos: [] })).toEqual({ total: 0, porLer: 0, anexos: 0 })
  })

  it('a carta com item conta nas DUAS colunas, e o total continua 2', () => {
    // E o estado logo depois de a carta chegar. O total tem de continuar o mesmo
    // de antes desta issue: mudar o numero do sino seria mexer no que a PH-22 e
    // a PH-164 decidiram, e nao e isso que esta em jogo aqui.
    const r = resumoDoCorreio({ conversas: [conversa(1, 1)], avisos: [] })
    expect(r).toEqual({ total: 2, porLer: 1, anexos: 1 })
  })

  it('ler a mensagem deixa o item — e agora a tela sabe disso', () => {
    // O passo em que o jogador achava que o sino tinha travado.
    const r = resumoDoCorreio({ conversas: [conversa(0, 1)], avisos: [] })
    expect(r).toEqual({ total: 1, porLer: 0, anexos: 1 })
    expect(fraseDasPendencias(r)).toBe('1 item por coletar')
  })

  it('coletar o item zera', () => {
    const r = resumoDoCorreio({ conversas: [conversa(0, 0)], avisos: [] })
    expect(r.total).toBe(0)
    expect(fraseDasPendencias(r)).toBeNull()
  })

  it('aviso com anexo por coletar conta como ITEM, nao como mensagem', () => {
    const r = resumoDoCorreio({
      conversas: [],
      avisos: [{ estado: 'lido', anexo_itens: [{}], anexo_coletado_em: null }],
    })
    expect(r).toEqual({ total: 1, porLer: 0, anexos: 1 })
  })

  it('anexo de POKE conta igual ao de item (PH-164)', () => {
    const r = resumoDoCorreio({
      conversas: [],
      avisos: [{ estado: 'lido', anexo_poke: { uid: 'eevee-do-lance' }, anexo_coletado_em: null }],
    })
    expect(r.anexos).toBe(1)
  })

  it('anexo ja coletado nao conta mais', () => {
    const r = resumoDoCorreio({
      conversas: [],
      avisos: [{ estado: 'lido', anexo_itens: [{}], anexo_coletado_em: '2026-08-30T12:00:00Z' }],
    })
    expect(r.total).toBe(0)
  })

  it('pedido de amizade pendente conta como POR LER', () => {
    const r = resumoDoCorreio({ conversas: [], avisos: [{ estado: 'pendente' }] })
    expect(r).toEqual({ total: 1, porLer: 1, anexos: 0 })
  })

  it('aviso pendente COM anexo conta uma vez so, como antes', () => {
    // A regressao que este caso impede: contar as duas coisas do mesmo aviso
    // inflaria o sino sem nada ter chegado. O codigo anterior usava
    // `filter(...).length`, ou seja, uma carta = uma unidade — e continua assim.
    const r = resumoDoCorreio({
      conversas: [],
      avisos: [{ estado: 'pendente', anexo_itens: [{}], anexo_coletado_em: null }],
    })
    expect(r.total).toBe(1)
    expect(r.anexos).toBe(1)
    expect(r.porLer).toBe(0)
  })

  it('varias conversas somam por coluna', () => {
    const r = resumoDoCorreio({
      conversas: [conversa(2, 0), conversa(0, 3), conversa(1, 1)],
      avisos: [{ estado: 'pendente' }],
    })
    expect(r).toEqual({ total: 8, porLer: 4, anexos: 4 })
  })
})

describe('a frase que a tela mostra (PH-287)', () => {
  it('so mensagens', () => {
    expect(fraseDasPendencias({ total: 3, porLer: 3, anexos: 0 })).toBe('3 mensagens por ler')
  })

  it('so itens', () => {
    expect(fraseDasPendencias({ total: 2, porLer: 0, anexos: 2 })).toBe('2 itens por coletar')
  })

  it('as duas, e a conjuncao no meio', () => {
    expect(fraseDasPendencias({ total: 2, porLer: 1, anexos: 1 }))
      .toBe('1 mensagem por ler e 1 item por coletar')
  })

  it('singular e plural, um por um', () => {
    // Frase de UI com "1 mensagens" le como bug de programa.
    expect(fraseDasPendencias({ total: 1, porLer: 1, anexos: 0 })).toBe('1 mensagem por ler')
    expect(fraseDasPendencias({ total: 1, porLer: 0, anexos: 1 })).toBe('1 item por coletar')
  })

  it('nada pendente nao gera frase — a tela sem pendencia fica como era', () => {
    expect(fraseDasPendencias({ total: 0, porLer: 0, anexos: 0 })).toBeNull()
  })
})

// A separacao acima nao vale nada se ela morrer no caminho ate a tela — que foi
// exatamente o que acontecia: a RPC ja devolvia as duas contagens, e o cliente as
// somava antes de renderizar.
//
// Renderizar `SheetMais` de verdade exigiria subir QueryClient, sessao do
// Supabase e o Realtime do correio; o que estes dois casos garantem e mais
// modesto e ainda assim o que importa: a frase e a etiqueta CONTINUAM ligadas na
// arvore. Se alguem voltar a passar so o numero, ficam vermelhos.
describe('a separacao sobrevive ate a tela (PH-287)', () => {
  it('a doca passa a frase pro item de Correio, e nao so o total', () => {
    expect(fonteDaDoca).toContain('fraseDasPendencias')
    expect(fonteDaDoca).toMatch(/detalhe=\{screen === 'correio'/)
    // O selo continua mostrando o TOTAL: separar a leitura nao muda o numero que
    // a PH-22 e a PH-164 decidiram acender.
    expect(fonteDaDoca).toContain('pendenciasCorreio.total')
  })

  it('a conversa com item por coletar diz isso em PALAVRA, sem `title=`', () => {
    // O fim do recorte e procurado A PARTIR do inicio, e nao do zero: `naoLidas`
    // aparece ANTES na borda do card, e um `indexOf` solto devolvia um recorte
    // invertido — vazio, e o caso passaria sem olhar nada.
    const inicio = fonteDoCorreio.indexOf('c.anexosPendentes > 0')
    expect(inicio).toBeGreaterThan(0)
    const linha = fonteDoCorreio.slice(inicio, fonteDoCorreio.indexOf('c.naoLidas > 0', inicio))
    expect(linha.length).toBeGreaterThan(50)
    expect(linha).toContain('por coletar')
    // O `title=` nativo nao abre no dedo, e a lista do Correio e onde o jogador
    // vai procurar o que ficou faltando.
    expect(linha).not.toContain('title=')
  })
})
