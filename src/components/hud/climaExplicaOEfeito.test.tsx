// @vitest-environment jsdom
// PH-267 — passar o ponteiro no clima explica o que ele faz.
//
// Duas coisas sob teste, e a segunda e a que costuma apodrecer:
//
//  1. A EXPLICACAO ABRE. Antes ela vivia no `title` nativo, que e hover puro —
//     dedo nao faz hover, entao no celular a informacao simplesmente nao
//     existia (a mesma observacao da PH-165 sobre o clima usar o pior dos tres
//     padroes de explicacao do jogo).
//
//  2. O TEXTO CONTINUA VERDADEIRO. Texto de efeito e a unica parte da UI que
//     mente sem quebrar: mudar `NEVOA_PRECISAO` de 0,6 pra 0,7 deixa a bolha
//     dizendo "60%" pra sempre, e o jogador planeja a luta em cima disso. Os
//     casos abaixo leem o FONTE do motor (`?raw`, mesmo padrao de
//     cadeiaDeMissoes.test.ts) e conferem que os numeros escritos na bolha
//     ainda sao os numeros que o combate aplica.
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

import { useWorldStore } from '@/stores/worldStore'
import type { ClimaTipo } from '@/engine/types'
import { APARENCIA, ClimaChip } from './ClimaChip'

const FONTES = import.meta.glob('../../engine/systems/*.ts', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

function fonte(arquivo: string): string {
  const chave = Object.keys(FONTES).find((k) => k.endsWith(`/${arquivo}`))
  if (!chave) throw new Error(`fonte nao encontrada: ${arquivo}`)
  return FONTES[chave]
}

function comClima(tipo: ClimaTipo, origem: 'ambiente' | 'golpe' = 'ambiente') {
  useWorldStore.setState({
    clima: { tipo, origem, turnosRestantes: origem === 'golpe' ? 5 : Infinity },
  } as never, false)
}

describe('a bolha do clima abre no ponteiro (PH-267)', () => {
  beforeEach(() => comClima('granizo'))
  afterEach(() => {
    cleanup()
    useWorldStore.setState({ clima: null } as never, false)
  })

  it('o chip sozinho nao mostra os efeitos — eles vivem na bolha', () => {
    render(<ClimaChip />)
    expect(screen.getByText('Granizo')).toBeTruthy()
    expect(screen.queryByText(/1\/16 do HP/)).toBeNull()
  })

  it('tocar no chip abre os efeitos', () => {
    render(<ClimaChip />)
    const chip = screen.getByText('Granizo')
    // `pointerDown` com `pointerType: 'touch'` ANTES do click: e assim que
    // `Explicacao` separa dedo de mouse (ela ignora o click do mouse, que ja
    // abriu por hover). Sem esta linha o teste mediria o caminho errado — e era
    // justamente o caminho do dedo que nao existia com o `title` nativo.
    fireEvent.pointerDown(chip, { pointerType: 'touch' })
    fireEvent.click(chip)
    expect(screen.getByText(/1\/16 do HP/)).toBeTruthy()
    expect(screen.getByText(/Blizzard nunca erra/)).toBeTruthy()
  })

  it('fora de hunt nao ha chip nenhum', () => {
    useWorldStore.setState({ clima: null } as never, false)
    const { container } = render(<ClimaChip />)
    expect(container.firstChild).toBeNull()
  })
})

describe('o texto do clima bate com o que o motor aplica (PH-267)', () => {
  it('os seis climas tem explicacao', () => {
    // O `Record<ClimaTipo, ...>` ja obriga a chave existir; o que ele nao
    // obriga e a lista ter conteudo.
    for (const [tipo, aparencia] of Object.entries(APARENCIA)) {
      expect(aparencia.efeitos.length, `${tipo} sem efeito escrito`).toBeGreaterThan(0)
    }
  })

  it('chuva e sol dizem +50%/−50%, e o motor usa 1.5/0.5', () => {
    const combate = fonte('combatSystem.ts')
    expect(combate).toContain('const CLIMA_MULTIPLICADOR_FAVORECIDO = 1.5')
    expect(combate).toContain('const CLIMA_MULTIPLICADOR_DESFAVORECIDO = 0.5')
    for (const tipo of ['chuva', 'sol'] as const) {
      expect(APARENCIA[tipo].efeitos.some((e) => e.includes('+50%'))).toBe(true)
      expect(APARENCIA[tipo].efeitos.some((e) => e.includes('−50%'))).toBe(true)
    }
  })

  it('a neblina diz 60%, e o motor usa 0.6', () => {
    expect(fonte('combatSystem.ts')).toContain('const NEVOA_PRECISAO = 0.6')
    expect(APARENCIA.nevoa.efeitos.some((e) => e.includes('60%'))).toBe(true)
  })

  it('a neve diz +50% de Defesa, e o motor usa 1.5 — so contra golpe fisico', () => {
    const combate = fonte('combatSystem.ts')
    expect(combate).toContain('const NEVE_DEFESA_GELO = 1.5')
    expect(combate).toContain('if (ehGelo && isPhysical) dmg /= NEVE_DEFESA_GELO')
    const linha = APARENCIA.neve.efeitos.find((e) => e.includes('Defesa'))
    expect(linha).toContain('+50%')
    expect(linha).toContain('físico')
  })

  it('granizo e areia dizem 1/16 por turno; os outros quatro NAO falam em tirar HP', () => {
    // A confusao que o proprio motor documenta: neve nao tira HP, granizo tira.
    expect(fonte('statusSystem.ts')).toContain('Math.max(1, Math.floor(hpMax / 16))')
    for (const tipo of ['granizo', 'areia'] as const) {
      expect(APARENCIA[tipo].efeitos.some((e) => e.includes('1/16 do HP'))).toBe(true)
    }
    for (const tipo of ['chuva', 'sol', 'neve', 'nevoa'] as const) {
      expect(APARENCIA[tipo].efeitos.some((e) => e.includes('Tira 1/16'))).toBe(false)
    }
  })
})
