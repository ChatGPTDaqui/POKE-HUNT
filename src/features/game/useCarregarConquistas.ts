// Carrega as conquistas do jogador uma vez por sessao (21/10/2026): o titulo
// escolhido aparece no campo, acima do nome, e precisa estar na memoria antes
// de o jogador abrir qualquer tela de conquistas.
import { useEffect } from 'react'
import { useConquistasStore } from '@/stores/conquistasStore'

export function useCarregarConquistas(): void {
  const carregado = useConquistasStore((s) => s.carregado)
  useEffect(() => {
    if (!carregado) void useConquistasStore.getState().carregar()
  }, [carregado])
}
