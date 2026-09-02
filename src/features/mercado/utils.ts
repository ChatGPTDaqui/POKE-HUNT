import type { AnuncioMercado } from '@/data/remote/servidor'
import { useToastStore, type ToastErroDetalhe } from '@/stores/toastStore'
import type { AnuncioParaConversa } from '@/stores/uiStore'

export const fmt = new Intl.NumberFormat('pt-BR')
// Vitrine muda com o que os outros fazem, entao o cache e curto — mas nao
// zero: trocar de aba nao pode virar uma rajada de requests.
export const STALE_MS = 10000

export type Aba = 'comprar' | 'vender' | 'ativos' | 'historico'

export const ABAS: { value: Aba; label: string }[] = [
  { value: 'comprar', label: 'Comprar' },
  { value: 'vender', label: 'Vender' },
  { value: 'ativos', label: 'Anúncios Ativos' },
  { value: 'historico', label: 'Histórico' },
]

// "Anúncios Ativos" sozinho quebrava a fileira de abas em duas no celular, e a
// segunda fileira custa ~50px de uma tela de ~470px uteis. O rotulo curto so
// existe no compacto — no desktop a palavra inteira cabe e diz melhor o que e.
export const ABAS_CURTAS: { value: Aba; label: string }[] = ABAS.map((a) => (
  a.value === 'ativos' ? { ...a, label: 'Ativos' } : a
))

/**
 * A linha da vitrine no formato que a conversa aceita (PH-435).
 *
 * Só o suficiente pro chip de preview mais o `id`, que é o único campo que a
 * RPC de envio consome — o snapshot que fica gravado é montado no servidor, a
 * partir do anúncio de verdade.
 *
 * `modo` cai pra `'preco_fixo'` quando ausente pelo mesmo motivo que o resto da
 * tela faz isso: é o default da coluna no banco, então anúncio antigo e
 * resposta de servidor mais velho leem como preço fixo — que é o que eram.
 */
export function anuncioParaConversa(a: AnuncioMercado): AnuncioParaConversa {
  return {
    id: a.id,
    sellerId: a.seller_id,
    speciesId: a.species_id,
    level: a.level,
    isShiny: a.is_shiny,
    rarity: a.rarity,
    ivPercent: a.iv_percent,
    price: a.price,
    currency: a.currency,
    modo: a.modo ?? 'preco_fixo',
    apenasOferta: a.apenas_oferta,
  }
}

export function toast(mensagem: string, tipo: 'success' | 'error' | 'info' = 'success', erroDetalhe?: ToastErroDetalhe) {
  useToastStore.getState().pushToast(mensagem, tipo, 'trade', undefined, erroDetalhe)
}
