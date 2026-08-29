// @vitest-environment jsdom
//
// PH-164 — o correio passa a carregar POKE, e o cliente inteiro olhava so pra
// `anexo_itens`.
//
// O modo de falha nao e cosmetico: uma carta so-com-POKE caia num caminho em que
// `temAnexo` era falso, entao o botao Coletar nao aparecia, o Excluir ficava
// LIBERADO (e apagar destroi uma concessao que so acontece uma vez) e o sino do
// HUD parava de contar. Tres regressoes silenciosas de uma vez.
//
// A tela de recebimento e testada por um criterio de aceite explicito da issue:
// ela FECHA e nao volta. Nada aqui persiste, entao o que este arquivo tranca e
// que ela nao ganhe persistencia por engano.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MensagemCorreio } from '@/data/remote/servidor'
import type { PokeRecebido } from '@/data/remote/correioRealtime'
import { LinhaDeMensagem } from './LinhaDeMensagem'
import { RecebimentoDePoke } from './RecebimentoDePoke'

function carta(over: Partial<MensagemCorreio> = {}): MensagemCorreio {
  return {
    id: 'm1',
    de_id: null,
    de_nome: 'Centro Pokemon',
    tipo: 'sistema',
    assunto: 'Um presente do Campeao Lance',
    corpo: 'Voce derrotou o Campeao Lance.',
    estado: 'pendente',
    created_at: '2026-08-28T10:00:00Z',
    ...over,
  }
}

const ANEXO_EEVEE = { speciesId: 'eevee', level: 25, isShiny: false }

function renderLinha(m: MensagemCorreio) {
  const fns = {
    onMarcarLida: vi.fn(),
    onResponderPedido: vi.fn(),
    onColetar: vi.fn(),
    onExcluir: vi.fn(),
  }
  render(<LinhaDeMensagem m={m} respondendo={false} coletando={false} excluindo={false} {...fns} />)
  return fns
}

afterEach(cleanup)

describe('carta com POKE anexado (PH-164)', () => {
  it('oferece Coletar, como ja oferecia pra anexo de item', async () => {
    const fns = renderLinha(carta({ anexo_poke: ANEXO_EEVEE }))
    await userEvent.click(screen.getByRole('button', { name: /Coletar/i }))
    expect(fns.onColetar).toHaveBeenCalledWith('m1')
  })

  it('mostra a especie e o nivel antes de coletar', () => {
    // Sem isto o jogador so sabe o que ganhou depois de aceitar — e a decisao de
    // abrir espaco na equipe depende de saber o que esta chegando.
    renderLinha(carta({ anexo_poke: ANEXO_EEVEE }))
    expect(screen.getByText(/Eevee/)).toBeTruthy()
    expect(screen.getByText(/Lv25/)).toBeTruthy()
  })

  it('nao deixa excluir com o presente ainda preso', () => {
    // Aqui e pior que no anexo de item: a concessao e UNICA, entao o presente
    // apagado nao volta por caminho nenhum.
    renderLinha(carta({ anexo_poke: ANEXO_EEVEE, anexo_coletado_em: null }))
    const botao = screen.getByRole('button', { name: /Excluir Um presente/i })
    expect(botao.hasAttribute('disabled')).toBe(true)
  })

  it('libera excluir depois de coletado, e troca o botao por "Recebido"', () => {
    renderLinha(carta({ anexo_poke: ANEXO_EEVEE, anexo_coletado_em: '2026-08-28T11:00:00Z' }))
    expect(screen.getByRole('button', { name: /Excluir Um presente/i }).hasAttribute('disabled')).toBe(false)
    expect(screen.queryByRole('button', { name: /Coletar/i })).toBeNull()
    expect(screen.getByText('Recebido')).toBeTruthy()
  })

  it('carta SEM anexo nenhum continua sem botao de coletar', () => {
    // Guarda anti-vacuo dos casos acima: se `temAnexo` virasse `true` sempre,
    // todos eles passariam e este seria o unico a reprovar.
    renderLinha(carta())
    expect(screen.queryByRole('button', { name: /Coletar/i })).toBeNull()
  })
})

const RECEBIDO: PokeRecebido = { speciesId: 'eevee', nome: 'Eevee', level: 25, isShiny: false }

describe('tela de recebimento (PH-164)', () => {
  it('mostra o POKE com nome e nivel', () => {
    render(<RecebimentoDePoke poke={RECEBIDO} onFechar={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: /Voce recebeu Eevee/i })).toBeTruthy()
    expect(screen.getByText(/Nivel 25/)).toBeTruthy()
  })

  it('fecha no botao', async () => {
    const onFechar = vi.fn()
    render(<RecebimentoDePoke poke={RECEBIDO} onFechar={onFechar} />)
    await userEvent.click(screen.getByRole('button', { name: /Continuar/i }))
    expect(onFechar).toHaveBeenCalled()
  })

  it('fecha no Esc — tela que so sai por um botao especifico prende o teclado', async () => {
    const onFechar = vi.fn()
    render(<RecebimentoDePoke poke={RECEBIDO} onFechar={onFechar} />)
    await userEvent.keyboard('{Escape}')
    expect(onFechar).toHaveBeenCalled()
  })

  it('nao escreve nada em localStorage — ela nao pode voltar no F5', () => {
    // Criterio de aceite 6. O POKE ja esta na equipe quando a tela abre, entao
    // ela nao guarda informacao nenhuma; persistir so a faria reaparecer pra
    // sempre, e o jogador nao teria como desligar.
    const antes = { ...localStorage }
    render(<RecebimentoDePoke poke={RECEBIDO} onFechar={vi.fn()} />)
    expect({ ...localStorage }).toEqual(antes)
  })
})
