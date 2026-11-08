// O palco das cenas de evolucao e de ovo (08/11/2026). Ocupa o campo da cacada
// e fica ABAIXO da HUD e dos menus: e montado antes de `#camada-hud` em
// JogoCarregado, sem z-index, entao tudo que vem depois pinta por cima. A
// cacada continua rodando por baixo; so a imagem fica coberta.
//
// O roteiro mora em `roteiroDaCena.ts` (puro, testado); aqui so se desenha.
import { useEffect, useRef, useState } from 'react'
import { SPECIES } from '@/data/pokes'
import { RARITIES } from '@/data/rarity'
import { gen5SpriteUrl } from '@/data/gen5Sprites'
import type { Nascimento } from '@/data/remote/muralRpc'
import { useCenaStore, type Cena } from '@/stores/cenaStore'
import { BP_NARROW, useUiStore } from '@/stores/uiStore'
import { ALTURA_DO_OVO, LARGURA_DO_OVO, pixelsDoOvo } from '@/features/ovos/OvoArte'
import {
  SUSPENSE_DA_EVOLUCAO, SUSPENSE_DO_OVO, SUSPENSE_REDUZIDO, duracaoTotal, quadroDaEvolucao, quadroDoOvo,
} from './roteiroDaCena'
import './cenas.css'

const LINHA_DO_CORTE = 8
/** Sem resposta do servidor nisto, a cena desiste e mostra o erro. */
const DESISTE_EM = 20

export function CamadaDeCena({ relogio }: { relogio?: () => number }) {
  const atual = useCenaStore((s) => s.fila[0])
  if (!atual) return null
  return <Palco key={atual.id} cena={atual} relogio={relogio} />
}

function movimentoReduzido(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function Palco({ cena, relogio }: { cena: Cena; relogio?: () => number }) {
  const [t, setT] = useState(0)
  const [resposta, setResposta] = useState<{ ok: boolean; nascimento?: Nascimento; erro?: string } | null>(null)
  const [tRevela, setTRevela] = useState<number | null>(null)
  const [pulou, setPulou] = useState(false)
  const reduzido = useRef(movimentoReduzido()).current
  const inicio = useRef<number | null>(null)
  const terminar = useCenaStore((s) => s.terminar)
  const suspense = reduzido ? SUSPENSE_REDUZIDO : cena.tipo === 'ovo' ? SUSPENSE_DO_OVO : SUSPENSE_DA_EVOLUCAO

  // No celular o menu ocupa o campo inteiro: fecha pra cena aparecer.
  useEffect(() => {
    const ui = useUiStore.getState()
    if (ui.viewportWidth > 0 && ui.viewportWidth <= BP_NARROW) ui.closeScreen()
  }, [])

  useEffect(() => {
    let vivo = true
    if (cena.tipo === 'ovo') {
      cena.resultado.then((n) => { if (vivo) setResposta({ ok: true, nascimento: n }) },
        (e) => { if (vivo) setResposta({ ok: false, erro: e instanceof Error ? e.message : String(e) }) })
    } else {
      cena.resultado.then((r) => { if (vivo) setResposta({ ok: r.ok }) }, () => { if (vivo) setResposta({ ok: false }) })
    }
    return () => { vivo = false }
  }, [cena])

  useEffect(() => {
    let raf = 0
    const agora = () => (relogio ? relogio() : performance.now() / 1000)
    const passo = () => {
      if (inicio.current == null) inicio.current = agora()
      setT(agora() - inicio.current)
      raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [relogio])

  // A revelacao so comeca quando o suspense acabou (ou o jogador pulou) E o
  // servidor respondeu. Sem resposta em DESISTE_EM, conta como falha.
  useEffect(() => {
    if (tRevela != null) return
    if (resposta && (t >= suspense || pulou)) setTRevela(t)
    else if (!resposta && t >= DESISTE_EM) { setResposta({ ok: false, erro: 'O servidor não respondeu.' }); setTRevela(t) }
  }, [t, resposta, tRevela, pulou, suspense])

  useEffect(() => {
    if (tRevela != null && t >= duracaoTotal(tRevela, cena.tipo)) terminar(cena.id)
  }, [t, tRevela, cena, terminar])

  const falhou = resposta ? !resposta.ok : false
  const tocar = () => {
    if (tRevela == null) setPulou(true)
    else if (t - tRevela > 0.6) terminar(cena.id)
  }

  return (
    <div className="cena pointer-events-auto absolute inset-0 overflow-hidden" onClick={tocar} role="status" aria-live="polite">
      {cena.tipo === 'evolucao'
        ? <CenaDaEvolucao cena={cena} t={t} tRevela={tRevela} falhou={falhou} reduzido={reduzido} />
        : <CenaDoOvo cena={cena} t={t} tRevela={tRevela} falhou={falhou} reduzido={reduzido} nascimento={resposta?.nascimento} erro={resposta?.erro} />}
    </div>
  )
}

function Brilhos({ forca, t, cor }: { forca: number; t: number; cor: string }) {
  if (forca <= 0) return null
  // 18 pontos em espiral, sempre caindo pro centro e renascendo na borda.
  return <>
    {Array.from({ length: 18 }, (_, i) => {
      const fase = ((t * 0.55 + i / 18) % 1)
      const raio = (1 - fase) * 42
      const ang = i * 2.4 + t * 1.6
      return <span key={i} className="cena-brilho" style={{
        left: `${50 + Math.cos(ang) * raio}%`, top: `${44 + Math.sin(ang) * raio * 0.75}%`,
        opacity: forca * Math.sin(fase * Math.PI), background: cor,
      }} />
    })}
  </>
}

function Sprite({ id, shiny, branco, visivel }: { id: string; shiny: boolean; branco: number; visivel: boolean }) {
  return (
    <span className="cena-sprite" style={{ opacity: visivel ? 1 : 0 }}>
      <img src={gen5SpriteUrl(id, shiny)} alt="" style={{ opacity: 1 - branco }} />
      <img src={gen5SpriteUrl(id, shiny)} alt="" className="cena-silhueta" style={{ opacity: branco }} />
    </span>
  )
}

function CenaDaEvolucao({ cena, t, tRevela, falhou, reduzido }: {
  cena: Extract<Cena, { tipo: 'evolucao' }>; t: number; tRevela: number | null; falhou: boolean; reduzido: boolean
}) {
  const q = quadroDaEvolucao(t, tRevela, falhou, reduzido)
  const cor = cena.isShiny ? '#ffd84d' : '#ffe9a8'
  return <>
    <div className="cena-fundo" style={{ opacity: q.fundo }} />
    <div className="cena-raios" style={{ opacity: q.raios, ['--cor' as string]: cor }} />
    <Brilhos forca={q.brilhos} t={t} cor="#fff6d0" />
    <div className="cena-centro" style={{ transform: `translate(-50%, -50%) scale(${q.escala})`, filter: q.branco > 0.05 ? `drop-shadow(0 0 ${8 + q.branco * 18}px rgba(255,255,255,${0.35 + q.branco * 0.5}))` : undefined }}>
      <Sprite id={cena.deId} shiny={cena.isShiny} branco={q.branco} visivel={q.forma === 'antiga'} />
      <Sprite id={cena.paraId} shiny={cena.isShiny} branco={q.branco} visivel={q.forma === 'nova'} />
    </div>
    {cena.isShiny && q.texto === 'evoluiu' && <Brilhos forca={1 - (q.fundo < 1 ? 1 : 0)} t={t} cor="#ffd84d" />}
    <div className="cena-clarao" style={{ opacity: q.clarao }} />
    {q.texto && (
      <div className="cena-texto">
        {q.texto === 'evoluindo' && <span>Hm? <b>{cena.deNome}</b> está evoluindo!</span>}
        {q.texto === 'evoluiu' && <span><b>{cena.deNome}</b> evoluiu para <b className="cena-destaque">{cena.paraNome}</b>!</span>}
        {q.texto === 'parou' && <span><b>{cena.deNome}</b> parou de evoluir.</span>}
      </div>
    )}
  </>
}

function OvoPartido({ raridade, abertura, trincas, angulo }: { raridade: Parameters<typeof pixelsDoOvo>[0]; abertura: number; trincas: number; angulo: number }) {
  const trincasDesenho = [
    'M6,3 L7,5 L6,6 L7.5,8',
    'M3,7 L4.5,8 L3.5,10 L5,11',
    'M10,6 L9,8 L10.5,9.5 L9.5,11',
  ]
  return (
    <svg className="cena-ovo" viewBox={`0 0 ${LARGURA_DO_OVO} ${ALTURA_DO_OVO}`} shapeRendering="crispEdges"
      style={{ transform: `rotate(${angulo}deg)`, opacity: 1 - Math.max(0, abertura - 0.6) * 2.5 }}>
      <g style={{ transform: `translate(${-abertura * 2}px, ${-abertura * 9}px) rotate(${-abertura * 35}deg)`, transformOrigin: '7px 8px', transformBox: 'view-box' }}>
        {pixelsDoOvo(raridade, [0, LINHA_DO_CORTE]).map((r) => <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={1} height={1} fill={r.cor} />)}
      </g>
      <g style={{ transform: `translate(${abertura * 1}px, ${abertura * 6}px) rotate(${abertura * 12}deg)`, transformOrigin: '7px 12px', transformBox: 'view-box' }}>
        {pixelsDoOvo(raridade, [LINHA_DO_CORTE, ALTURA_DO_OVO]).map((r) => <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width={1} height={1} fill={r.cor} />)}
      </g>
      {abertura === 0 && trincasDesenho.slice(0, trincas).map((d) => (
        <path key={d} d={d} fill="none" stroke="#1d150c" strokeWidth={0.5} shapeRendering="auto" />
      ))}
    </svg>
  )
}

function CenaDoOvo({ cena, t, tRevela, falhou, reduzido, nascimento, erro }: {
  cena: Extract<Cena, { tipo: 'ovo' }>; t: number; tRevela: number | null; falhou: boolean; reduzido: boolean
  nascimento?: Nascimento; erro?: string
}) {
  const q = quadroDoOvo(t, tRevela, falhou, reduzido)
  const corDoOvo = RARITIES[cena.ovo.raridade].color
  const cor = nascimento ? RARITIES[nascimento.rarity].color : corDoOvo
  const especie = nascimento ? SPECIES[nascimento.speciesId] : null
  return <>
    <div className="cena-fundo" style={{ opacity: q.fundo }} />
    <div className="cena-raios" style={{ opacity: q.raios, ['--cor' as string]: cor }} />
    <div className="cena-halo" style={{ opacity: q.brilho, background: `radial-gradient(circle, ${corDoOvo}aa, transparent 62%)` }} />
    <div className="cena-centro">
      <OvoPartido raridade={cena.ovo.raridade} abertura={q.abertura} trincas={q.trincas} angulo={q.angulo} />
      {especie && q.bebe > 0 && (
        <span className="cena-sprite cena-bebe" style={{ transform: `translate(-50%, -50%) scale(${q.bebe})` }}>
          <img src={gen5SpriteUrl(especie.id, nascimento!.isShiny)} alt={especie.name} />
        </span>
      )}
    </div>
    {nascimento?.isShiny && q.texto === 'nasceu' && <Brilhos forca={1} t={t} cor="#ffd84d" />}
    <div className="cena-clarao" style={{ opacity: q.clarao }} />
    {q.texto && (
      <div className="cena-texto">
        {q.texto === 'oh' && <span>Hm?</span>}
        {q.texto === 'nasceu' && especie && nascimento && <>
          <span className="cena-etiqueta" style={{ background: cor }}>{RARITIES[nascimento.rarity].label}{nascimento.isShiny ? ' ✨ SHINY' : ''}</span>
          <span><b className="cena-destaque">{especie.name}</b> nasceu!</span>
          <span className="cena-detalhe">{nascimento.local === 'team' ? 'Ele já está na sua equipe.' : 'Ele foi para a Mochila.'}</span>
        </>}
        {q.texto === 'erro' && <><span>Não foi possível chocar.</span><span className="cena-detalhe">{erro}</span></>}
      </div>
    )}
  </>
}
