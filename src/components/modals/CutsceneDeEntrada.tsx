// A cutscene que roda enquanto uma hunt CARREGA (PH-471).
//
// Quem abre e fecha e `engine/controller.ts#enterMap`, e nao esta tela: entrar
// numa hunt acontece por tres caminhos (o clique no botao, a reentrada do boot
// e a volta do Campeao Lance) e so o controller esta em todos os tres. Ver a
// nota de `stores/cutsceneStore.ts`.
//
// ELA SAI QUANDO A HUNT ESTA PRONTA DE VERDADE, e nao num timer: `enterMap` so
// resolve depois de `abrirSessaoDeHunt` (round-trip a Edge) e `preloadHunt` (a
// arte de fundo e o pool inteiro). Um timer fixo teria os dois modos de falha:
// curto demais mostra o jogo montando, longo demais faz esperar depois de
// pronto.
//
// O TETO DE 15s (PH-484) NAO CONTRADIZ O PARAGRAFO ACIMA — ele e o piso de
// seguranca por baixo dele. O que nao existia era saida pro caso em que
// `enterMap` NAO resolve: a Edge pendura, a rede cai no meio do round-trip, uma
// promessa fica sem `settle`. A cena engole o clique de proposito e nao tem
// botao, entao o jogador ficava com o jogo inteiro trancado atras dela, sem F5.
//
// Pedido do dono, textual: "o efeito do zoom in devera ter uma duracao maxima de
// 15 segundos". Mesmo numero do teto do preload, e eles TEM que ser o mesmo —
// ver `data/tetoDeCarregamento.ts`.
//
// O QUE O TETO NAO FAZ: cancelar a entrada. `enterMap` continua rodando e o
// `finally` dele fecha a cena de novo por id (fechar por id ja e idempotente).
// Se a entrada terminar depois, ela termina — o jogador so parou de olhar a tela
// de carregamento antes.
import { useEffect } from 'react'
import { CircleNotch } from '@phosphor-icons/react'

import { TETO_DE_CARREGAMENTO_MS } from '@/data/tetoDeCarregamento'
import { useCutsceneStore } from '@/stores/cutsceneStore'
import { CutsceneDeArea } from './CutsceneDeArea'

export function CutsceneDeEntrada() {
  const cena = useCutsceneStore((s) => s.cena)
  const id = cena?.id ?? null

  // O efeito fica ANTES do `return null`, que e regra de hook e tambem o que faz
  // o relogio reiniciar por CENA: a dependencia e o `id`, entao entrar noutra
  // hunt no meio da espera ganha os 15s dela, e nao o que sobrou da anterior.
  useEffect(() => {
    if (id == null) return
    const timer = setTimeout(() => useCutsceneStore.getState().fechar(id), TETO_DE_CARREGAMENTO_MS)
    return () => clearTimeout(timer)
  }, [id])

  if (!cena) return null
  return (
    <CutsceneDeArea
      // `key` pelo id: sem ela o React reusa o node entre duas entradas
      // seguidas e a animacao de zoom nao reinicia (mesmo motivo do `id` em
      // `SplashDeSala`).
      key={cena.id}
      arte={cena.arte}
      corDeFundo={cena.corDeFundo}
      titulo={cena.titulo}
      subtitulo={cena.subtitulo}
      rodape={
        <div className="flex items-center gap-[.5em] text-[.85em] font-semibold tracking-[.14em] text-n300 uppercase">
          <CircleNotch className="animate-spin" aria-hidden />
          Carregando
        </div>
      }
    />
  )
}
