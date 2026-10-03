import { describe, expect, it } from 'vitest'
import { ABILITIES, getAbility } from '@/data/abilities'
import { BEAMS_POR_GOLPE, PERFIS_DE_BEAM } from './beams'
import { resolverVfx } from '../resolverVfx'
import { atrasoDoNumeroDeDano, desenharVfxDeGolpe, retanguloDoEfeito } from '../desenharVfx'
import { rngSemeado } from '../aleatorio'
import { paletaDaPele } from '../paletas'
import type { ContextoVfx, Tier } from '../tipos'
import type { WorldEffect } from '@/engine/types'

function quadro(id: string, ms: number, tier: Tier = 3, distancia = 110, angulo = .2, orcamento = 100) {
  const log: string[] = [], cores = new Set<string>()
  let m = [1,0,0,1,0,0], largura = 0
  const pilha: { m: number[]; largura: number }[] = []
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const ponto = (x: number, y: number, folga = largura / 2) => {
    const xx = m[0]*x+m[2]*y+m[4], yy = m[1]*x+m[3]*y+m[5]
    x0 = Math.min(x0,xx-folga); x1 = Math.max(x1,xx+folga)
    y0 = Math.min(y0,yy-folga); y1 = Math.max(y1,yy+folga)
  }
  const multiplicar = (n: number[]) => {
    const [a,b,c,d,x,y] = m
    m = [a*n[0]+c*n[1],b*n[0]+d*n[1],a*n[2]+c*n[3],b*n[2]+d*n[3],a*n[4]+c*n[5]+x,b*n[4]+d*n[5]+y]
  }
  const metodos: Record<string, (...args: number[]) => void> = {
    save: () => { pilha.push({m:[...m],largura}) }, restore: () => { ({m,largura} = pilha.pop()!) },
    translate: (x,y) => multiplicar([1,0,0,1,x,y]), rotate: a => multiplicar([Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0]),
    moveTo: ponto, lineTo: ponto,
    arc: (x,y,r) => { ponto(x-r,y-r); ponto(x+r,y+r); ponto(x-r,y+r); ponto(x+r,y-r) },
    ellipse: (x,y,rx,ry) => { ponto(x-rx,y-ry); ponto(x+rx,y+ry); ponto(x-rx,y+ry); ponto(x+rx,y-ry) },
    fillRect: (x,y,w,h) => { ponto(x,y); ponto(x+w,y+h); ponto(x+w,y); ponto(x,y+h) },
  }
  const ctx = new Proxy({}, {
    get: (_o,k) => (...args: number[]) => { log.push(`${String(k)}:${args.join(',')}`); metodos[String(k)]?.(...args) },
    set: (_o,k,v) => { log.push(`${String(k)}=${v}`); if (k==='lineWidth') largura=v; if (k==='fillStyle'||k==='strokeStyle') cores.add(v); return true },
  }) as CanvasRenderingContext2D
  const e = BEAMS_POR_GOLPE[id]
  const rng = rngSemeado(42)
  let sorteios = 0
  const origem = Object.freeze({ x: 0, y: 0 }), alvo = Object.freeze({ x: Math.cos(angulo)*distancia, y: Math.sin(angulo)*distancia })
  const c: ContextoVfx = Object.freeze({ ctx, ms, tier, origem, alvo, angulo, raio: 0,
    duracao: e.duracao[tier]!, pele: e.pele!, rng: () => { sorteios++; return rng() },
    pedir: (n: number) => { const k = Math.min(orcamento,n); orcamento-=k; return k } })
  e.desenhar(c)
  return { log, cores, pilha, sorteios, limites:[x0,y0,x1,y1], retangulo:retanguloDoEfeito(origem,alvo,e.alcance,0) }
}

describe('Beams com assinatura própria', () => {
  it('cobre exatamente os oito Beams do catálogo atual, incluindo Psybeam', () => {
    const ids = Object.values(ABILITIES).filter(g => /beam/i.test(g.name)).map(g => g.id).sort()
    expect(ids).toHaveLength(8)
    expect(Object.keys(BEAMS_POR_GOLPE).sort()).toEqual(ids)
    for (const id of ids) expect(resolverVfx({ abilityId:id, area:false })?.entrada).toBe(BEAMS_POR_GOLPE[id])
  })
  it('não remapeia área, outros golpes nem a exceção Bullet Punch', () => {
    for (const id of Object.keys(BEAMS_POR_GOLPE)) expect(resolverVfx({abilityId:id,area:true})?.entrada).not.toBe(BEAMS_POR_GOLPE[id])
    expect(resolverVfx({abilityId:'bullet_punch',area:false})).toBeNull()
    expect(resolverVfx({abilityId:'water_gun',area:false})?.entrada).not.toBe(BEAMS_POR_GOLPE.bubble_beam)
  })
  it.each(Object.keys(BEAMS_POR_GOLPE))('%s mantém identidade no crítico e sincroniza primeiro contato', id => {
    const p = PERFIS_DE_BEAM[id]
    for (const critico of [false,true]) {
      const r = resolverVfx({abilityId:id,area:false,critico})!
      expect(r.entrada).toBe(BEAMS_POR_GOLPE[id])
      expect(atrasoDoNumeroDeDano(id,critico)).toBe(p.contato)
      expect(r.entrada.impactos![r.tier]).toEqual([p.contato])
      expect(p.contato).toBeLessThan(r.entrada.duracao[r.tier]!)
    }
  })
  it.each(Object.keys(BEAMS_POR_GOLPE))('%s é puro, restaura Canvas, respeita paleta e desaparece', id => {
    const p = PERFIS_DE_BEAM[id]
    for (const ms of [50,p.carga+40,p.contato+50,p.contato+p.sustentar+70,p.duracao-30]) {
      const a = quadro(id,ms)
      expect(a.log.length).toBeGreaterThan(0)
      expect(quadro(id,ms).log).toEqual(a.log)
      expect(a.log.join('|')).not.toMatch(/NaN|Infinity|shadowBlur|createLinearGradient/)
      expect(a.pilha).toHaveLength(0)
      for (const cor of a.cores) expect(paletaDaPele(p.pele)).toContain(cor)
    }
    expect(quadro(id,-1).log).toEqual([])
    expect(quadro(id,p.duracao).log).toEqual([])
  })
  it('orçamento zero preserva feixe/bolhas essenciais e limita ornamentos', () => {
    for (const [id,p] of Object.entries(PERFIS_DE_BEAM)) {
      const zero=quadro(id,p.contato+80,3,110,0,0), cheio=quadro(id,p.contato+80)
      expect(zero.log.some(l => /^(fill|stroke):/.test(l))).toBe(true)
      expect(zero.log.length).toBeLessThan(cheio.log.length)
    }
  })
  it('tem oito assinaturas e cada crítico acrescenta detalhes', () => {
    expect(new Set(Object.values(PERFIS_DE_BEAM).map(p=>p.assinatura)).size).toBe(8)
    for (const [id,p] of Object.entries(PERFIS_DE_BEAM)) expect(quadro(id,p.contato+80,4).log.length).toBeGreaterThan(quadro(id,p.contato+80,1).log.length)
  })
  it('encerrar a estrela não desloca o stream aleatório dos resíduos', () => {
    for (const [id,p] of Object.entries(PERFIS_DE_BEAM)) {
      expect(quadro(id,p.contato+170).sorteios).toBe(quadro(id,p.contato+190).sorteios)
      expect(quadro(id,p.contato+190).sorteios).toBeGreaterThan(1)
    }
  })
  it('direções, distâncias e tiers cabem no buffer, sem cortar bordas', () => {
    for (const [id,p] of Object.entries(PERFIS_DE_BEAM)) for (const tier of [1,2,3,4] as const) {
      for (const angulo of [0,Math.PI/2,Math.PI,-Math.PI/2,.7]) for (const distancia of [0,16,46,180,300]) {
        for (const ms of [0,50,p.carga,p.contato-20,p.contato+50,p.contato+p.sustentar,p.duracao-100]) {
          const q=quadro(id,ms,tier,distancia,angulo), [x0,y0,x1,y1]=q.limites, r=q.retangulo
          if (x0===Infinity) continue
          const folgas=[x0-r.x,y0-r.y,r.x+r.w-x1,r.y+r.h-y1]
          expect(Math.min(...folgas),`${id} T${tier} ${angulo} ${distancia} ${ms}`).toBeGreaterThanOrEqual(0)
          expect(q.log.join('|')).not.toMatch(/NaN|Infinity/)
          expect(q.pilha).toHaveLength(0)
        }
      }
    }
  })
  it('o render real entrega ao pixelizador a paleta própria, não a do tipo', () => {
    for (const [id,e] of Object.entries(BEAMS_POR_GOLPE)) {
      let recebido: string[]=[]
      const efeito=Object.freeze({id:`beam-${id}`,abilityId:id,elementType:getAbility(id)!.type,
        age:.4,delay:0,origemX:0,origemY:0,x:110,y:0,targetX:110,targetY:0,isAoe:false} as WorldEffect)
      expect(desenharVfxDeGolpe({} as CanvasRenderingContext2D,efeito,{pixelizar:(_ctx,_r,paleta)=>{recebido=[...paleta];return true}})).toBe(true)
      expect(recebido).toEqual(paletaDaPele(e.pele!))
    }
  })
})
