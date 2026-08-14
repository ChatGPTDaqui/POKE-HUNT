import { useEffect } from 'react'
import { observarEstoqueBaixo } from '@/components/auto/estoqueBaixo'
import { useToastStore } from '@/stores/toastStore'

// O alerta de "sem bola/pocao/revive" tambem vira linha no chat (aba Sistema).
// O pisca no botao Auto so existe enquanto alguem esta olhando; a linha do chat
// sobrevive a uma hora de jogo em segundo plano.
export function useAvisoDeEstoqueNoChat(): void {
  useEffect(() => observarEstoqueBaixo((mensagem) => {
    useToastStore.getState().pushToast(mensagem, 'error', 'world')
  }), [])
}
