// A superficie da camada de VFX (PH-190). O porque de ela existir, e o porque
// do z-index, estao em `render/camadaVfx.ts` — aqui e so o no do DOM.
import { useEffect, useRef } from 'react'
import { ajustarTamanhoDaCamada, registrarCanvasDeVfx } from '@/render/camadaVfx'

export function CamadaVfx() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    registrarCanvasDeVfx(canvas)
    ajustarTamanhoDaCamada()

    // `ResizeObserver` no proprio canvas, e nao `window.addEventListener`
    // ('resize'): a camada muda de tamanho sem a janela mudar — troca de regime
    // (compacto/deitado/amplo), barra de endereco do celular recolhendo,
    // teclado virtual abrindo. O <GameCanvas> escuta a janela porque foi escrito
    // antes disso virar problema; aqui observar o elemento cobre os dois casos.
    //
    // `desenharVfx` tambem chama `ajustarTamanhoDaCamada` a cada quadro (custa
    // duas comparacoes de inteiro). Este observer nao e redundancia: sem ele, um
    // redimensionamento com a camada vazia nao seria acompanhado, e o primeiro
    // efeito depois disso nasceria com a resolucao antiga.
    const ro = new ResizeObserver(() => ajustarTamanhoDaCamada())
    ro.observe(canvas)

    return () => {
      ro.disconnect()
      registrarCanvasDeVfx(null)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      // `pointer-events-none` e obrigatorio, nao higiene: a camada cobre a tela
      // inteira e fica ACIMA do trilho e da doca. Sem isso ela engoliria o toque
      // em todo destino da barra de navegacao e em todo slot de golpe — o jogo
      // ficaria inteiro inalcancavel.
      className="pointer-events-none absolute inset-0 z-[25] block h-full w-full"
      aria-hidden
      data-camada-vfx
    />
  )
}
