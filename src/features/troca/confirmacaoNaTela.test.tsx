// @vitest-environment jsdom
//
// PH-314 — o selo "confirmou" tem que SUMIR quando a oferta muda.
//
// Este e o unico caso em que a tela da troca pode, sozinha, executar o golpe que
// o servidor impede. O desenho da fatia 3 e: a confirmacao guarda a VERSAO em
// que foi dada, e so vale enquanto for igual a versao atual da mesa. Se a tela
// desenhar o check a partir de "confirmou alguma vez", ela mostra um selo verde
// sobre uma mesa que mudou — e o jogador clica em confirmar olhando pra um
// acordo que nao existe mais.
//
// A diferenca entre os dois casos abaixo e UM NUMERO: a versao confirmada bate
// com a da mesa, ou nao bate. Nada mais muda.
//
// O teste monta a tela DE VERDADE, com `useTroca` rodando — a derivacao
// (`euConfirmei` / `eleConfirmou`) e onde a regra vive, e mockar o hook faria o
// teste medir so o JSX.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

const SESSAO_BASE = {
  id: 's1',
  anfitriaoId: 'eu',
  convidadoId: 'ele',
  estado: 'aberta' as const,
  criadaEm: '2026-08-30T00:00:00.000Z',
  expiraEm: '2999-01-01T00:00:00.000Z',
  encerradaPor: null,
  encerradaEm: null,
  versao: 7,
  versaoConfirmadaAnfitriao: null as number | null,
  versaoConfirmadaConvidado: null as number | null,
}

const MESA = [
  {
    id: 'o1', sessaoId: 's1', donoId: 'eu', tipo: 'poke' as const, pokeUid: 'p1', itemId: null,
    quantidade: 1, speciesId: 'bulbasaur', nivel: 12, shiny: false, raridade: 'comum', ivPercent: 60,
  },
  {
    id: 'o2', sessaoId: 's1', donoId: 'ele', tipo: 'poke' as const, pokeUid: 'p2', itemId: null,
    quantidade: 1, speciesId: 'charmander', nivel: 15, shiny: false, raridade: 'comum', ivPercent: 71,
  },
]

let sessao: typeof SESSAO_BASE | null = { ...SESSAO_BASE }

vi.mock('@/data/remote/trocaRpc', () => ({
  minhaTrocaViva: () => Promise.resolve(sessao),
  lerMesa: () => Promise.resolve(MESA),
  assinarMinhaTroca: () => () => {},
  aceitarTroca: vi.fn(),
  encerrarTroca: vi.fn(),
  porPokeNaMesa: vi.fn(),
  tirarPokeDaMesa: vi.fn(),
  porItemNaMesa: vi.fn(),
  tirarItemDaMesa: vi.fn(),
  confirmarTroca: vi.fn(),
  desconfirmarTroca: vi.fn(),
}))

// O nick vem do perfil publico por `useQuery`. Um stub evita montar
// QueryClientProvider so pra ler um nome.
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { nome: 'Amigo2Teste' } }),
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (seletor: (s: unknown) => unknown) => seletor({ user: { id: 'eu' } }),
}))

import { TrocaMenu } from './TrocaMenu'

// Sem `globals: true` na config do vitest, a limpeza automatica do RTL nao
// roda: a arvore da montagem anterior fica no documento e `getByText` acha
// duas. Foi assim que os quatro casos abaixo reprovaram na primeira execucao —
// e o modo de falha e enganoso, porque a mensagem fala de elemento duplicado e
// nao de teste sujo.
afterEach(cleanup)

beforeEach(() => {
  sessao = { ...SESSAO_BASE }
})

describe('o selo de confirmacao segue a VERSAO (PH-314)', () => {
  it('confirmacao na versao ATUAL aparece', async () => {
    sessao = { ...SESSAO_BASE, versao: 7, versaoConfirmadaConvidado: 7 }
    render(<TrocaMenu />)
    expect(await screen.findByText(/Amigo2Teste oferece/)).toBeTruthy()
    expect(screen.getAllByText('confirmou').length).toBe(1)
  })

  it('a MESMA confirmacao, uma versao atras, NAO aparece', async () => {
    // A oferta mudou depois de ele confirmar. O servidor ja recusaria a
    // execucao; a tela nao pode dizer o contrario.
    sessao = { ...SESSAO_BASE, versao: 8, versaoConfirmadaConvidado: 7 }
    render(<TrocaMenu />)
    expect(await screen.findByText(/Amigo2Teste oferece/)).toBeTruthy()
    expect(screen.queryByText('confirmou')).toBeNull()
  })

  it('quando EU confirmei na versao atual, a tela oferece desfazer em vez de confirmar', async () => {
    // Os dois botoes juntos convidariam o jogador a desfazer o proprio "sim"
    // sem entender por que — mexer na mesa derruba as duas confirmacoes.
    sessao = { ...SESSAO_BASE, versao: 7, versaoConfirmadaAnfitriao: 7 }
    render(<TrocaMenu />)
    expect(await screen.findByText('Desfazer minha confirmacao')).toBeTruthy()
    expect(screen.queryByText('Confirmar minha parte')).toBeNull()
  })

  it('minha confirmacao vencida volta a oferecer confirmar', async () => {
    sessao = { ...SESSAO_BASE, versao: 9, versaoConfirmadaAnfitriao: 7 }
    render(<TrocaMenu />)
    expect(await screen.findByText('Confirmar minha parte')).toBeTruthy()
  })
})

describe('a mesa mostra o que o OUTRO ofereceu (PH-314)', () => {
  it('o POKE do outro lado aparece com nome e nivel', async () => {
    // So e possivel porque a linha da oferta CARREGA a especie: a RLS de
    // `pokemon_instances` nunca deixaria ler o POKE do outro jogador.
    render(<TrocaMenu />)
    expect(await screen.findByText('Charmander')).toBeTruthy()
    expect(screen.getByText('Lv 15')).toBeTruthy()
  })
})

describe('sem mesa, a tela diz por onde comecar (PH-314)', () => {
  it('explica que o convite sai do Ranking ou do Correio', async () => {
    sessao = null
    render(<TrocaMenu />)
    expect(await screen.findByText(/Voce nao esta em nenhuma troca/)).toBeTruthy()
  })
})
