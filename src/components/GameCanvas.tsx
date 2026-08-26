// Fase 5: monta o canvas e roda o motor de verdade. Porta a parte DOM/canvas
// de js/main.js que a Fase 4 deixou de fora de proposito (resize, hit-test
// de clique/hover na enfermeira, zoom via Ctrl+Scroll) — controller.ts so
// tinha a logica de jogo pura.
//
// Duas coisas rodam em paralelo aqui, de proposito separadas (ver plano):
// 1. `useGameLoop` — passo de simulacao fixo (60/s), atualiza o worldStore.
// 2. O rAF proprio deste componente — so DESENHA, lendo
//    `useWorldStore.getState()` direto (imperativo, fora do ciclo de render
//    do React) a cada frame. Canvas nao tem virtual DOM pra reconciliar
//    contra JSX, entao rotear o desenho pelo React (useWorldStore(selector)
//    disparando re-render 60x/s) so custaria overhead sem desenhar nada a
//    mais — ver "Decisao de implementacao: estado do motor" no plano.
import { useEffect, useRef } from 'react'
import { Renderer } from '@/render/renderer'
import { desenharVfx, registrarPintor } from '@/render/camadaVfx'
import { converterRecompensasNovas, pintorDeRecompensa } from '@/render/vooDeRecompensa'
import { useGameLoop } from '@/engine/useGameLoop'
import { useWorldStore } from '@/stores/worldStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useRendererStore } from '@/stores/rendererStore'
import { controller } from '@/engine/controller'
import { buildHospitalWorld, syncActivePokeToGameState } from '@/engine/simulation'
import { preloadHospital } from '@/data/preload'

// Sincronia periodica de baixa frequencia: copia o HP/EXP ao vivo do POKE em
// campo (worldStore, muda a cada tick de combate) de volta pra
// gameStateStore.team (a fonte persistida via zustand/persist) sem martelar
// o localStorage a 60Hz. Fecha a lacuna documentada na Fase 4: entre um kill
// e outro (o outro ponto de sync automatico), dano/cura em andamento sem
// morte ainda nao tinha nenhum ponto de sync — isso cobre esse intervalo.
// O TODO que ficava aqui ("chamar isso tambem no autosave/beforeunload e no
// catch-up de visibilitychange, que ainda nao foram portados") saiu: os dois
// existem — `features/game/hooks/useSyncOnUnload.ts` (`beforeunload` +
// `pagehide`) e `features/game/hooks/useBackgroundCatchUp.ts`
// (`visibilitychange`). Este intervalo cobre o meio: a aba em foco, entre um
// kill e outro.
const SYNC_INTERVAL_MS = 5000

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useGameLoop(true)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = new Renderer(canvas)
    void preloadHospital()
    // Publica o renderer pro ZoomControl (que vive fora do canvas e precisa
    // chamar zoomStep/ler o % atual) — ver stores/rendererStore.ts.
    useRendererStore.getState().setRenderer(renderer)

    // Pintor do voo de recompensa (PH-191). Registrado uma vez, pro ciclo de
    // vida do canvas — ele mesmo nao desenha nada quando nao ha voo vivo.
    const soltarPintorDeRecompensa = registrarPintor(pintorDeRecompensa)

    // Bug real encontrado ao vivo (jogo abria o Hospital SEM o POKE em campo
    // sempre que a pagina era recarregada com um save existente): o
    // `worldStore` nasce vazio (`emptyWorldState`), e so `chooseStarter`/
    // `enterMap` o preenchiam — nada reconstruia o mundo no boot. O
    // js/main.js vanilla fazia exatamente isso na carga do modulo
    // (`let currentWorld = buildHospitalWorld()`), sempre voltando pro
    // Hospital ("enemies/effects aren't persisted", nota do original).
    //
    // O guard `player === null` existe pro caso de remount (HMR em dev, ou
    // StrictMode chamando o efeito 2x): so constroi quando de fato nao ha
    // mundo montado, entao um remount no meio de uma hunt nao expulsa o
    // jogador de volta pro Hospital.
    if (useWorldStore.getState().player === null) {
      const { team, activeIndex } = useGameStateStore.getState()
      useWorldStore.getState().setWorld(buildHospitalWorld(team[activeIndex] ?? null, renderer.hospitalPlayerPos))
    }

    function resize() {
      canvas!.width = canvas!.clientWidth
      canvas!.height = canvas!.clientHeight
      renderer.handleResize()
    }
    resize()
    window.addEventListener('resize', resize)

    function canvasPointFromEvent(event: MouseEvent): { x: number; y: number } {
      const rect = canvas!.getBoundingClientRect()
      const scaleX = canvas!.width / rect.width
      const scaleY = canvas!.height / rect.height
      return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY }
    }

    // Estado de hover do rotulo "Curar". Fica numa variavel local (lida pelo
    // rAF de desenho) e nao no React: mudaria muitas vezes por segundo durante
    // um movimento de mouse, e re-renderizar a arvore por causa de um brilho
    // no canvas nao paga.
    let enfermeiraEmFoco = false

    // Folga da area de toque da enfermeira, em px de CANVAS. Zero no mouse (o
    // cursor e preciso e o `pointer` ja avisa onde clicar); no dedo, 14px de
    // cada lado — sem hover nao ha aviso nenhum de onde e a borda, e um toque
    // que erra por 5px nao devolve nada na tela.
    const mqlToque = typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)')
      : null
    function folgaDoAlvo(): number {
      if (!mqlToque?.matches || !canvas) return 0
      const rect = canvas.getBoundingClientRect()
      if (rect.width <= 0) return 0
      return 14 * (canvas.width / rect.width)
    }

    function handleClick(event: MouseEvent) {
      if (useWorldStore.getState().mapDef) return // enfermeira so existe na cena do Hospital
      const { x, y } = canvasPointFromEvent(event)
      if (renderer.hospitalClickOnNurse(x, y, folgaDoAlvo())) controller.healTeam()
    }

    function handleMouseMove(event: MouseEvent) {
      if (useWorldStore.getState().mapDef) {
        canvas!.style.cursor = 'default'
        enfermeiraEmFoco = false
        return
      }
      const { x, y } = canvasPointFromEvent(event)
      enfermeiraEmFoco = renderer.hospitalClickOnNurse(x, y)
      canvas!.style.cursor = enfermeiraEmFoco ? 'pointer' : 'default'
    }

    function handleMouseLeave() {
      enfermeiraEmFoco = false
      canvas!.style.cursor = 'default'
    }

    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey) return
      event.preventDefault()
      renderer.adjustZoom(event.deltaY)
      useRendererStore.getState().setZoomPercent(Math.round(renderer.zoom * 100))
    }

    canvas.addEventListener('click', handleClick)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseleave', handleMouseLeave)
    canvas.addEventListener('wheel', handleWheel, { passive: false })

    // Instante do quadro anterior, pra o `dt` da camada de VFX. O laco de
    // DESENHO nao tinha dt nenhum ate aqui — ele so lia estado e pintava, e quem
    // avanca o tempo e o passo de simulacao (`useGameLoop`, 60/s fixo). A camada
    // de VFX precisa do dt REAL do desenho porque os efeitos dela nao vivem no
    // `WorldState`: eles nascem e morrem entre dois quadros.
    let ultimoQuadro = performance.now()
    // Teto do dt: com a aba em segundo plano o rAF para, e o primeiro quadro na
    // volta traria um dt de vários segundos — todo efeito ativo pularia direto
    // pro fim (ou passaria dele) num unico passo. 1/15s corta isso sem
    // atrapalhar quadro lento de verdade.
    const DT_MAXIMO = 1 / 15

    let rafId = requestAnimationFrame(function draw() {
      const agora = performance.now()
      const dt = Math.min(DT_MAXIMO, (agora - ultimoQuadro) / 1000)
      ultimoQuadro = agora

      const world = useWorldStore.getState()
      if (world.mapDef) renderer.renderMap(world.mapDef, world)
      else renderer.renderHospital(world.player, enfermeiraEmFoco)

      // Recompensa de abate -> voo ate a carteira (PH-191). Le os `rewardText`
      // que o motor ja empurra no `WorldState` e converte os NOVOS em voo; o
      // motor nao sabe que isso existe. Fora da hunt `mundoParaTela` devolve
      // `null` e nada e lancado.
      converterRecompensasNovas(world.effects, (p) =>
        renderer.mundoParaTela(world.mapDef, world.player, p))
      // DEPOIS do jogo, sempre: a camada de VFX fica acima da HUD e precisa ser
      // o ultimo desenho do quadro. Ela e no-op quando nao ha canvas registrado
      // (Hospital antes do mount, teste sem DOM), entao o call site nao precisa
      // saber se ela existe. Ver `render/camadaVfx.ts`.
      desenharVfx(dt)
      rafId = requestAnimationFrame(draw)
    })

    const syncInterval = setInterval(() => {
      syncActivePokeToGameState(useWorldStore.getState(), useGameStateStore.getState())
    }, SYNC_INTERVAL_MS)

    return () => {
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('click', handleClick)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      canvas.removeEventListener('wheel', handleWheel)
      cancelAnimationFrame(rafId)
      soltarPintorDeRecompensa()
      clearInterval(syncInterval)
      useRendererStore.getState().setRenderer(null)
    }
  }, [])

  return <canvas ref={canvasRef} id="game-canvas" className="block h-full w-full" />
}
