// A cutscene que roda enquanto uma hunt CARREGA (PH-471).
//
// Quem abre e fecha e `engine/controller.ts#enterMap`, e nao esta tela: entrar
// numa hunt acontece por tres caminhos (o clique no botao, a reentrada do boot
// e a volta do Campeao Lance) e so o controller esta em todos os tres. Ver a
// nota de `stores/cutsceneStore.ts`.
//
// ELA SAI QUANDO A HUNT ESTA PRONTA DE VERDADE, e nao num timer: `enterMap` so
// resolve depois de `abrirSessaoDeHunt` (round-trip a Edge) e `preloadHunt` (a
// arte de fundo e o pool inteiro, teto de 4s). Um timer fixo teria os dois
// modos de falha: curto demais mostra o jogo montando, longo demais faz esperar
// depois de pronto.
import { CircleNotch } from '@phosphor-icons/react'

import { useCutsceneStore } from '@/stores/cutsceneStore'
import { CutsceneDeArea } from './CutsceneDeArea'

export function CutsceneDeEntrada() {
  const cena = useCutsceneStore((s) => s.cena)
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
