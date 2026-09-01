// PH-372: o ticker do celular mostra a linha MAIS RECENTE, nao a de um canal
// preferido.
//
// O bug que este teste tranca nao lancava excecao nem aparecia em log: o
// ticker escolhia `sistema.at(-1) ?? trade.at(-1) ?? log.at(-1)`, e como
// `sistema` recebe as 23 chamadas de canal `world` (erro de rede, "Equipe
// curada!", recusa do servidor), depois da PRIMEIRA delas o `??` nunca mais
// caia para `log`. O feed de combate — abate com ouro, level up, captura
// falhada, auto-pot, auto-revive — parava de aparecer para sempre, e no regime
// compacto o ticker e o unico canal onde ele apareceria.
//
// O contrafactual: com a implementacao antiga, o primeiro caso abaixo devolve a
// linha de sistema e reprova pelo nome.
import { beforeEach, describe, expect, it } from 'vitest'
import { toastStore, ultimaLinhaDeTodasAsAbas, type ChatLine, type LogTab } from './toastStoreVanilla'

function linhas(): Record<LogTab, ChatLine[]> {
  return toastStore.getState().chatLines
}

describe('ultimaLinhaDeTodasAsAbas (PH-372)', () => {
  beforeEach(() => {
    toastStore.setState({ chatLines: { sistema: [], trade: [], log: [] }, toasts: [] })
  })

  it('linha de combate mais nova ganha de uma de sistema antiga', () => {
    toastStore.getState().pushToast('Equipe curada!', 'success', 'world')
    toastStore.getState().pushToast('Rattata derrotado! +12 ouro', 'gold', 'combat')

    expect(ultimaLinhaDeTodasAsAbas(linhas())?.message).toBe('Rattata derrotado! +12 ouro')
  })

  it('linha de sistema mais nova ganha de uma de combate antiga', () => {
    toastStore.getState().pushToast('Rattata derrotado! +12 ouro', 'gold', 'combat')
    toastStore.getState().pushToast('Sem conexao com o servidor.', 'error', 'world')

    expect(ultimaLinhaDeTodasAsAbas(linhas())?.message).toBe('Sem conexao com o servidor.')
  })

  it('uma linha de sistema no comeco nao esconde todo o combate que vier depois', () => {
    toastStore.getState().pushToast('Bem-vindo de volta.', 'info', 'world')
    for (let i = 1; i <= 5; i += 1) {
      toastStore.getState().pushToast(`Abate ${i}`, 'gold', 'combat')
    }

    expect(ultimaLinhaDeTodasAsAbas(linhas())?.message).toBe('Abate 5')
  })

  it('a aba de troca entra na mesma comparacao', () => {
    toastStore.getState().pushToast('Abate', 'gold', 'combat')
    toastStore.getState().pushToast('Troca aceita.', 'success', 'trade')

    expect(ultimaLinhaDeTodasAsAbas(linhas())?.message).toBe('Troca aceita.')
  })

  it('todas as abas vazias devolve undefined — o ticker cai no texto "Chat"', () => {
    expect(ultimaLinhaDeTodasAsAbas(linhas())).toBeUndefined()
  })

  it('o `seq` e global e cresce entre abas, senao a comparacao acima nao existe', () => {
    toastStore.getState().pushToast('a', 'info', 'world')
    toastStore.getState().pushToast('b', 'info', 'combat')
    toastStore.getState().pushToast('c', 'info', 'trade')

    const { sistema, log, trade } = linhas()
    expect(sistema[0].seq).toBeLessThan(log[0].seq)
    expect(log[0].seq).toBeLessThan(trade[0].seq)
  })
})
