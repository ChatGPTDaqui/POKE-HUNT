import { rngSemeado } from '../aleatorio'
import { limitar, saida } from '../primitivas'
import type { ContextoVfx, Pele } from '../tipos'

export type AssinaturaBeam = 'gelo' | 'aurora' | 'mental' | 'sinal' | 'eletrico' | 'bolhas' | 'solar' | 'hiper'
interface PerfilDeImpacto { assinatura: AssinaturaBeam; contato: number; sustentar: number }
const TAU = Math.PI * 2

function poligono(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number,number])[], cor: string): void {
  ctx.fillStyle = cor; ctx.beginPath()
  pts.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.closePath(); ctx.fill()
}
function risco(ctx: CanvasRenderingContext2D, pts: readonly (readonly [number,number])[], cor: string, w: number): void {
  ctx.strokeStyle = cor; ctx.lineWidth = w; ctx.lineCap = 'butt'; ctx.lineJoin = 'bevel'; ctx.beginPath()
  pts.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y)); ctx.stroke()
}
function faceta(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, tam: number, cor: string, pele: Pele): void {
  const ux = Math.cos(a)*tam, uy = Math.sin(a)*tam
  const pts = (k: number): [number,number][] => [[x-ux*k,y-uy*k],[x-uy*k*.32,y+ux*k*.32],[x+ux*k,y+uy*k],[x+uy*k*.32,y-ux*k*.32]]
  poligono(ctx,pts(1.18),pele.contorno); poligono(ctx,pts(1),cor)
  risco(ctx,[[x-ux*.5,y-uy*.5],[x+ux*.7,y+uy*.7]],pele.nucleo,.9)
}
function arco(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number, cor: string, w: number, achatar = 1): void {
  ctx.strokeStyle=cor; ctx.lineWidth=w; ctx.beginPath(); ctx.ellipse(x,y,r*achatar,r,0,a,a+1.15); ctx.stroke()
}

/** Só o contato: pode ser avaliado sem desenhar o feixe ou consumir RNG externo. */
export function desenharImpactoBeam(c: ContextoVfx, p: PerfilDeImpacto, distancia: number, semente: number): void {
  const decorrido=c.ms-p.contato
  if (decorrido<0 || decorrido>=p.sustentar+130) return
  const apagar=1-limitar((decorrido-p.sustentar)/130)
  const abrir=(.35+.65*saida(limitar(decorrido/65))) * (1-.18*saida(limitar(decorrido/160))) * apagar
  const escala=(1+(c.tier-1)*.045)*abrir
  const {ctx,pele}=c
  const r=(p.assinatura==='hiper'?23:p.assinatura==='solar'?20:17)*escala
  const cores=pele.acento ?? [pele.meio,pele.nucleo]
  ctx.save(); ctx.translate(distancia,0)
  // Lente compacta na face atingida. A massa não ocupa a silhueta inteira.
  if (p.assinatura!=='bolhas') for (const [cor,k] of [[pele.contorno,1.25],[pele.base,1],[pele.meio,.75],[pele.nucleo,.35]] as const) {
    ctx.fillStyle=cor; ctx.beginPath(); ctx.ellipse(-2*escala,0,3.5*escala*k,9*escala*k,0,0,TAU); ctx.fill()
  }
  switch(p.assinatura) {
    case 'hiper': {
      // Coroa de pressão na direção de escape (+X), não um círculo no chão.
      for (const [cor,k] of [[pele.contorno,1.12],[pele.base,1],[pele.meio,.76]] as const) {
        const pts: [number,number][]=[[-2*escala,-7*escala]]
        for(let i=0;i<=12;i++) {
          const a=-1.4+i/12*2.8, d=r*(i%2?.57:1)*k
          pts.push([4*escala+Math.cos(a)*d,Math.sin(a)*d])
        }
        pts.push([-2*escala,7*escala],[5*escala,0]); poligono(ctx,pts,cor)
      }
      risco(ctx,[[-5*escala,0],[8*escala,0],[r*.95,0]],pele.nucleo,3*escala)
      break
    }
    case 'solar':
      for(let i=0;i<8;i++) {
        const a=-1.65+i/7*3.3, ux=Math.cos(a),uy=Math.sin(a)
        poligono(ctx,[[ux*r*.35,uy*r*.35],[ux*r-uy*1.5*escala,uy*r+ux*1.5*escala],[ux*r*1.2,uy*r*1.2],[ux*r+uy*1.5*escala,uy*r-ux*1.5*escala]],i%2?pele.meio:pele.nucleo)
      }
      for(const lado of [-1,1]) faceta(ctx,4*escala,lado*r*.62,lado*.85,7*escala,pele.base,pele)
      break
    case 'gelo':
      for(let i=0;i<6;i++) {
        const a=-1.5+i/5*3, d=r*.65
        faceta(ctx,Math.cos(a)*d,Math.sin(a)*d,a,8*escala,i%2?pele.meio:pele.base,pele)
      }
      break
    case 'aurora':
      for(let i=0;i<5;i++) {
        const a=-1.6+i*.8+Math.sin(decorrido*.007)*.1
        faceta(ctx,Math.cos(a)*r*.65,Math.sin(a)*r*.65,a,7*escala,cores[i%cores.length],pele)
      }
      break
    case 'mental':
      for(let i=0;i<4;i++) {
        const a=i/4*TAU+decorrido*.005
        arco(ctx,3*escala,0,r,a,pele.contorno,3*escala,.7)
        arco(ctx,3*escala,0,r,a,i%2?cores[0]:pele.meio,1.5*escala,.7)
      }
      for(const lado of [-1,1]) arco(ctx,3*escala,0,r*.55,lado+decorrido*.007,cores[1],1.5*escala,.7)
      break
    case 'sinal':
      for(const lado of [-1,1]) {
        const pts=Array.from({length:13},(_,i)=>[i/12*r*.9, lado*Math.sin(i/12*2.5)*r*.7] as const)
        risco(ctx,pts,pele.contorno,4*escala); risco(ctx,pts,lado<0?cores[0]:pele.meio,2.3*escala)
        faceta(ctx,r*.65,lado*r*.55,lado*.6,5*escala,lado<0?cores[0]:pele.meio,pele)
      }
      break
    case 'eletrico':
      for(let i=0;i<5;i++) {
        const a=-1.9+i*.95, ux=Math.cos(a),uy=Math.sin(a), nx=-uy,ny=ux
        const pts: [number,number][]=[[0,0],[ux*r*.35+nx*2*escala,uy*r*.35+ny*2*escala],[ux*r*.62-nx*2*escala,uy*r*.62-ny*2*escala],[ux*r,uy*r]]
        risco(ctx,pts,pele.contorno,3*escala); risco(ctx,pts,pele.meio,1.6*escala)
      }
      break
    case 'bolhas':
      for(let i=0;i<5;i++) {
        const a=-1.6+i*.8, d=r*.5, x=Math.cos(a)*d,y=Math.sin(a)*d, raio=(3+i%3)*escala
        for(const [cor,w] of [[pele.contorno,2.6],[pele.meio,1.4]] as const) {
          ctx.strokeStyle=cor; ctx.lineWidth=w*escala; ctx.beginPath(); ctx.arc(x,y,raio,0,TAU); ctx.stroke()
        }
        arco(ctx,x,y,raio*.8,3.4,pele.nucleo,1.4*escala)
      }
      // Rims abertos leem como bolhas estourando, em vez de mais bolhas viajando.
      for(const lado of [-1,1]) arco(ctx,r*.35,lado*r*.8,4*escala,decorrido*.008,pele.nucleo,1.5*escala)
      break
  }
  // Escape contínuo no contato; não reabre a estrela nem gera acertos extras.
  const rng=rngSemeado(semente), n=c.pedir(4+c.tier*2)
  for(let i=0;i<n;i++) {
    const a=(rng()-.5)*4, fase=(decorrido/230+rng())%1, d=(12+rng()*22)*saida(fase)*escala
    const tam=(1.4+rng()*1.5)*(1-fase)*escala
    if(tam<.25) continue
    const x=Math.cos(a)*d,y=Math.sin(a)*d
    if(p.assinatura==='bolhas') risco(ctx,[[x,y],[x+Math.cos(a)*tam*2,y+Math.sin(a)*tam*2]],pele.meio,tam)
    else faceta(ctx,x,y,a,tam*2,p.assinatura==='aurora'?cores[i%cores.length]:p.assinatura==='sinal'&&i%2?cores[0]:pele.meio,pele)
  }
  ctx.restore()
}
