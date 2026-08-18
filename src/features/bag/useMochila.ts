import { useEffect } from 'react'
import { useMochilaStore } from '@/stores/mochilaStore'

/**
 * Garante que a mochila esteja carregada enquanto esta tela estiver montada.
 *
 * Toda tela que le `bagPokes` chama isto e trata os tres estados. Quem esquecer
 * mostra "Nenhum POKE" pra uma mochila cheia — e o erro nao lanca nada, so
 * mente na tela. Ver `mochilaStore`.
 */
export function useMochila(): { carregada: boolean; carregando: boolean; erro: string | null } {
  const carregada = useMochilaStore((s) => s.carregada)
  const carregando = useMochilaStore((s) => s.carregando)
  const erro = useMochilaStore((s) => s.erro)
  const carregar = useMochilaStore((s) => s.carregar)

  // `carregar` é idempotente e desduplica chamadas em voo, então quatro telas
  // montando juntas fazem UMA request. Em erro, `carregada` fica falsa e a
  // próxima montagem tenta de novo — sem laço, porque o efeito só roda na
  // montagem (a função do store é estável).
  useEffect(() => { void carregar() }, [carregar])

  return { carregada, carregando, erro }
}
