import { useDiarioStore } from '@/stores/diarioStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { useUiStore } from '@/stores/uiStore'

/** Só apresentação: libera o espaço dos controles de campo durante consultas.
 * Auto fica fora: sua configuração precisa acompanhar a batalha ao vivo. */
export function useGestaoAberta(): boolean {
  const painel = useUiStore((s) => s.currentScreen != null || s.moreOpen
    || s.perfilOpen || s.perfilPublicoAlvo != null || s.analyzerOpen)
  const diario = useDiarioStore((s) => s.painelAberto)
  const poke = usePokeProfileStore((s) => s.open != null)
  return painel || diario || poke
}
