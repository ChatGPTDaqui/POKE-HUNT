// Celebracao de marco: level-up do POKE, do treinador, evolucao e shiny
// (PH-192).
//
// SUBSTITUI `LevelUpSplash.tsx`, que escrevia "LVL UP !" e nada mais — nao dizia
// de quem, pra qual nivel, nem o que mudou — e que era CODIGO MORTO: `show()`
// nunca foi chamado desde a migracao pra React. Os dois pontos que o disparavam
// no vanilla (level-up do treinador e evolucao) voltam nesta issue.
//
// As regras de QUANDO (intensidade, marco, duracao) moram em
// `data/marcoDaCelebracao.ts`, separadas de proposito: sao elas que decidem
// quantas vezes por sessao o jogador ve a versao grande, e merecem teste sem
// montar React.
//
// z-[45]: acima da camada de VFX (25) e dos paineis (30/33), abaixo do perfil
// do POKE (45/46 — empatado de proposito, os dois nunca coexistem) e da
// confirmacao (60). O `LevelUpSplash` usava `fixed z-[60]`, o mesmo da
// confirmacao, e `fixed` em vez de `absolute` como o resto da HUD.
import { useEffect, useRef, type ReactNode } from 'react'
import { STAT_LABEL, STAT_ORDER } from '@/data/statLabels'
import type { StatBlock } from '@/data/pokes'
import { spriteUrl } from '@/data/sprites'
import { useCelebracaoStore, type Celebracao } from '@/stores/celebracaoStore'
import { useJanelaSobreOCampo } from '@/stores/janelaSobreOCampo'
import { TETO_DE_EXTENSAO, duracaoDe, intensidadeDe, type Intensidade } from '@/data/marcoDaCelebracao'
import { cn } from '@/lib/utils'

// --- CSS ---------------------------------------------------------------------
// POSICIONAMENTO NAO MORA NOS KEYFRAMES.
//
// A primeira versao centralizava com `translate(-50%,-50%)` DENTRO da animacao.
// Sob `prefers-reduced-motion` o `@media` troca a animacao por um fade sem
// transform, e os dois splashes descolavam do centro e encostavam na borda —
// medido no prototipo: o chip ficava em `left=195` numa viewport de 390, com
// 195px de largura sangrando pela borda. Agora quem centra e um WRAPPER e quem
// anima e o filho, que so mexe em translateY/scale.
const CSS = `
@keyframes celeb-chip {
  0%   { opacity: 0; transform: translateY(6px) scale(.85) }
  18%  { opacity: 1; transform: translateY(-2px) scale(1.06) }
  30%  { transform: translateY(-4px) scale(1) }
  75%  { opacity: 1; transform: translateY(-16px) scale(1) }
  100% { opacity: 0; transform: translateY(-26px) scale(.97) }
}
@keyframes celeb-cartao {
  0%   { opacity: 0; transform: scale(.72) }
  14%  { opacity: 1; transform: scale(1.05) }
  24%  { transform: scale(1) }
  82%  { opacity: 1; transform: scale(1) }
  100% { opacity: 0; transform: translateY(-14px) scale(.98) }
}
@keyframes celeb-raios {
  0%   { opacity: 0; transform: rotate(0deg) scale(.5) }
  20%  { opacity: .5 }
  100% { opacity: 0; transform: rotate(58deg) scale(1.5) }
}
@keyframes celeb-brilho {
  0%, 100% { opacity: .35 }
  50%      { opacity: .75 }
}
/* Cada stat entra com atraso proprio: a lista aparecendo de uma vez le como
   bloco de texto, escalonada le como contagem. */
@keyframes celeb-stat {
  0%   { opacity: 0; transform: translateY(7px) }
  100% { opacity: 1; transform: translateY(0) }
}
@keyframes celeb-seta {
  0%, 100% { transform: translateX(0) }
  50%      { transform: translateX(4px) }
}
@keyframes celeb-faisca {
  0%   { opacity: 0; transform: rotate(var(--ang)) translateX(0) scale(.4) }
  25%  { opacity: 1 }
  100% { opacity: 0; transform: rotate(var(--ang)) translateX(var(--dist)) scale(1) }
}
/* DUAS classes, e a distincao e um BUG REAL que o prototipo pegou.

   .celeb-anima  container que entra E SAI — vira um fade de mesma duracao,
                 porque ele precisa mesmo desaparecer no fim.
   .celeb-entra  elemento INTERNO que so entra (a lista de stats, a seta). A
                 animacao e DESLIGADA e ele aparece direto.

   Antes as duas eram .celeb-anima. Com reduced-motion ligado, a lista de
   stats recebia o fade com 260ms e fill:both — passados os 260ms ela ficava
   presa no ultimo quadro do keyframe, que e opacity 0. Ou seja, os atributos
   ganhos NAO APARECIAM, e o cartao dizia "subiu de nível" sem responder "valeu
   a pena?", a unica pergunta que ele levanta. */
@media (prefers-reduced-motion: reduce) {
  .celeb-anima { animation-name: celeb-fade !important }
  .celeb-entra { animation: none !important; opacity: 1 !important; transform: none !important }
  .celeb-decorativo { display: none !important }
}
@keyframes celeb-fade {
  0%, 100% { opacity: 0 }
  15%, 85% { opacity: 1 }
}
`

// --- componente --------------------------------------------------------------
export function CamadaDeCelebracao() {
  const atual = useCelebracaoStore((s) => s.fila[0] ?? null)
  const encerrar = useCelebracaoStore((s) => s.encerrarAtual)
  // PH-398, pedido explicito: com menu, painel, perfil, analyzer ou tutorial
  // aberto o cartao NAO desenha. Mesma fonte de verdade do splash de sala — sao
  // cinco fontes de "janela aberta" em tres stores, e duas listas pra manter em
  // sincronia foi o erro que produziu o PH-394.
  //
  // O RELOGIO CONTINUA CORRENDO (o `useEffect` abaixo nao olha isto). Uma fila
  // que espera a janela fechar viraria uma parede de cartoes atrasados: com
  // level-up a cada poucos abates, abrir a Mochila por um minuto acumularia
  // cartao de nivel que o POKE ja passou. Celebracao e do momento — perdida, ela
  // nao volta, e o nivel continua no perfil pra quem quiser conferir.
  const janelaAberta = useJanelaSobreOCampo()
  // Quando a atual comecou a aparecer, pro teto de extensao da coalescencia.
  const inicio = useRef(0)

  useEffect(() => {
    if (!atual) {
      inicio.current = 0
      return
    }
    if (inicio.current === 0) inicio.current = performance.now()
    const base = duracaoDe(atual.celebracao)
    const decorrido = performance.now() - inicio.current
    // O que falta pra completar a duracao, sem passar do teto. A coalescencia
    // remonta este efeito (o objeto `atual` muda) e reinicia a contagem — e o
    // teto e o que impede uma sequencia de abates de prender o cartao na tela.
    const restante = Math.max(0, Math.min(base, base * TETO_DE_EXTENSAO - decorrido))
    const t = setTimeout(() => {
      inicio.current = 0
      encerrar()
    }, restante)
    return () => clearTimeout(t)
  }, [atual, encerrar])

  return (
    <>
      <style>{CSS}</style>
      {/* A `key` no id: sem ela o React reusa o no do DOM entre duas
          celebracoes e a animacao CSS NAO REINICIA — a segunda aparece ja no
          fim do fade. Medido ao vivo: opacity 0 aos 700ms de uma animacao de
          2600ms. Mesmo defeito que o ticker do `ChatMobile` ja documenta.
          A coalescencia MANTEM o id de proposito, pra o cartao nao piscar a
          cada abate de uma sequencia. */}
      {atual && !janelaAberta && <Celebrando key={atual.id} c={atual.celebracao} />}
    </>
  )
}

function Celebrando({ c }: { c: Celebracao }) {
  const intensidade = intensidadeDe(c)
  if (intensidade === 'discreto') return <ChipDeNivel c={c} />
  return <Cartao c={c} intensidade={intensidade} />
}

/**
 * Nivel comum: chip que sobe, na faixa logo abaixo do trilho.
 *
 * NAO no centro da tela: ali ele caia EM CIMA da placa de combate do POKE —
 * medido em 390px, "+3 HP" ficava sobre o nome e "+2 Def" sobre o "42%", os
 * dois ilegiveis. Justamente o chip, cuja razao de existir e nao tapar nada.
 * Aqui e a faixa mais livre da tela e, melhor, e onde o jogador ja olha o XP.
 */
function ChipDeNivel({ c }: { c: Celebracao }) {
  if (c.tipo !== 'nivel' && c.tipo !== 'treinador') return null
  const ganhos = c.tipo === 'nivel' ? statsQueSubiram(c.ganhos) : []
  return (
    <div className="pointer-events-none absolute left-1/2 top-[4.6em] z-[45] w-max max-w-[calc(100vw-1em)] -translate-x-1/2">
      <div
        className="celeb-anima flex flex-col items-center gap-[.2em]"
        style={{ animation: `celeb-chip ${duracaoDe(c)}ms ease-out forwards` }}
      >
        <span
          className="rounded-full border px-[.7em] py-[.18em] text-[.8em] font-bold tracking-wide"
          style={{
            borderColor: 'var(--color-exp)',
            background: 'rgba(9,11,16,.88)',
            color: 'var(--color-exp)',
            boxShadow: '0 0 14px rgba(56,189,248,.45)',
          }}
        >
          NÍVEL {rotuloDeIntervalo(c.nivelInicial, c.nivel)}
        </span>
        {ganhos.length > 0 && (
          // `flex-wrap`: com 6 atributos subindo de uma vez (acontece em POKE de
          // curva rapida) uma linha unica estourava a largura em 390px.
          <span
            className="flex flex-wrap justify-center gap-x-[.45em] gap-y-[.1em] text-[.62em] font-bold tabular-nums"
            style={{ color: 'var(--color-ok)' }}
          >
            {ganhos.map(([k, v]) => (
              <span key={k} style={{ textShadow: '0 1px 3px rgba(0,0,0,.9)' }}>+{v} {STAT_LABEL[k]}</span>
            ))}
          </span>
        )}
      </div>
    </div>
  )
}

function Cartao({ c, intensidade }: { c: Celebracao; intensidade: Intensidade }) {
  const cheio = intensidade === 'cheio'
  const cor = corDe(c)
  const duracao = duracaoDe(c)

  return (
    <div className="pointer-events-none absolute inset-0 z-[45] overflow-hidden">
      {/* Raios: puro enfeite, entao `celeb-decorativo` (removido sob
          reduced-motion) esta certo aqui — diferente da seta de evolucao, que
          carrega significado. */}
      {cheio && (
        <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2">
          <div
            className="celeb-decorativo h-[26em] w-[26em]"
            style={{
              animation: `celeb-raios ${duracao}ms ease-out forwards`,
              background: `repeating-conic-gradient(from 0deg, ${cor} 0deg 5deg, transparent 5deg 22deg)`,
              maskImage: 'radial-gradient(circle, transparent 22%, black 42%, transparent 72%)',
              WebkitMaskImage: 'radial-gradient(circle, transparent 22%, black 42%, transparent 72%)',
            }}
          />
        </div>
      )}

      {/* `max-w`: em 390px o cartao de evolucao (dois retratos + 6 stats em duas
          colunas) encostava nas duas bordas. */}
      <div className="absolute left-1/2 top-[42%] w-max max-w-[calc(100vw-1.5em)] -translate-x-1/2 -translate-y-1/2">
        <div
          className="celeb-anima flex flex-col items-center"
          style={{ animation: `celeb-cartão ${duracao}ms cubic-bezier(.2,.9,.25,1) forwards` }}
        >
          {cheio && <Faiscas cor={cor} />}
          <div
            className="flex flex-col items-center gap-[.5em] rounded-[1em] border-2 px-[1.4em] py-[.9em]"
            style={{
              borderColor: cor,
              // OPACO, e nao 96%: medido em 390px, com 4% de transparencia o
              // cartao deixava passar o nome de um POKE e o numero de dano do
              // combate de forma LEGIVEL por tras do proprio texto — e o cartao
              // e a informacao prioritaria naquele instante.
              background: 'linear-gradient(180deg, rgb(17,20,28), rgb(10,12,18))',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              boxShadow: `0 0 26px ${cor}55, 0 10px 30px rgba(0,0,0,.6)`,
            }}
          >
            <Titulo c={c} cor={cor} />
            <Corpo c={c} cheio={cheio} />
          </div>
        </div>
      </div>
    </div>
  )
}

function corDe(c: Celebracao): string {
  if (c.tipo === 'shiny') return 'var(--color-shiny)'
  if (c.tipo === 'evolucao') return 'var(--color-gold)'
  if (c.tipo === 'treinador') return 'var(--color-gold)'
  return 'var(--color-exp)'
}

function Titulo({ c, cor }: { c: Celebracao; cor: string }) {
  const texto = c.tipo === 'evolucao'
    ? 'EVOLUIU!'
    : c.tipo === 'shiny' ? 'SHINY!' : c.tipo === 'treinador' ? 'TREINADOR' : 'SUBIU DE NÍVEL'
  return (
    <span
      className="text-[1.5em] leading-none font-bold tracking-[.06em]"
      style={{
        color: cor,
        // Duas sombras: uma dura pra dar contorno sobre qualquer cenario (a
        // licao do PH-141 vale aqui tambem), e um brilho largo por cima.
        textShadow: `0 2px 0 rgba(0,0,0,.85), 0 0 18px ${cor}aa`,
        animation: 'celeb-brilho 1.1s ease-in-out infinite',
      }}
    >
      {texto}
    </span>
  )
}

function Corpo({ c, cheio }: { c: Celebracao; cheio: boolean }) {
  if (c.tipo === 'shiny') {
    return (
      <div className="flex flex-col items-center gap-[.35em]">
        <Retrato id={c.especieId} shiny grande={cheio} />
        <span className="text-[.9em] font-medium" style={{ color: 'var(--color-shiny)' }}>{c.nome}</span>
        <span className="text-[.7em] text-n300">Um encontro raro.</span>
      </div>
    )
  }

  if (c.tipo === 'treinador') {
    return (
      <div className="flex flex-col items-center gap-[.2em]">
        <span className="text-[.75em] text-n400">{c.nome}</span>
        <span className="text-[1.3em] font-bold tabular-nums" style={{ color: 'var(--color-gold)' }}>
          Lv {rotuloDeIntervalo(c.nivelInicial, c.nivel)}
        </span>
        {c.nivel - c.nivelInicial > 1 && <SeloDeNiveis quantos={c.nivel - c.nivelInicial} cor="var(--color-gold)" />}
      </div>
    )
  }

  if (c.tipo === 'evolucao') {
    return (
      <div className="flex items-center gap-[.5em]">
        {/* ANTES → DEPOIS. "Evoluiu" sem mostrar em QUE obriga a abrir o perfil. */}
        <div className="flex flex-col items-center gap-[.15em]">
          <Retrato id={c.deId} shiny={c.isShiny} grande={false} opaco />
          <span className="text-[.62em] text-n400">{c.deNome}</span>
        </div>
        {/* `celeb-entra` e nao `celeb-decorativo`: sob reduced-motion o
            decorativo e REMOVIDO, e esta seta e INFORMACAO — ela diz o sentido
            da transformacao. Sem ela sobram dois retratos e o jogador infere a
            direcao pelo tamanho. So o balanco lateral e enfeite. */}
        <span
          className="celeb-entra text-[1.2em]"
          style={{ color: 'var(--color-gold)', animation: 'celeb-seta .9s ease-in-out infinite' }}
        >
          →
        </span>
        <div className="flex flex-col items-center gap-[.15em]">
          <Retrato id={c.paraId} shiny={c.isShiny} grande />
          <span className="text-[.7em] font-medium" style={{ color: 'var(--color-gold)' }}>{c.paraNome}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-[.45em]">
      <div className="flex items-baseline gap-[.35em]">
        <span className="text-[.75em] text-n400">{c.nome}</span>
        <span className="text-[1.1em] font-bold tabular-nums" style={{ color: 'var(--color-exp)' }}>
          Lv {rotuloDeIntervalo(c.nivelInicial, c.nivel)}
        </span>
        {c.nivel - c.nivelInicial > 1 && <SeloDeNiveis quantos={c.nivel - c.nivelInicial} cor="var(--color-exp)" />}
      </div>
      <ListaDeGanhos ganhos={c.ganhos} />
      {c.golpesNovos.length > 0 && (
        <div
          className="flex flex-col items-center gap-[.15em] rounded-[.5em] px-[.6em] py-[.3em]"
          style={{ background: 'rgba(52,211,153,.12)', border: '1px solid var(--color-ok)' }}
        >
          <span className="text-[.6em] uppercase tracking-wide" style={{ color: 'var(--color-ok)' }}>
            Golpe novo
          </span>
          {c.golpesNovos.map((g) => (
            <span key={g} className="text-[.8em] font-medium text-n100">{g}</span>
          ))}
        </div>
      )}
    </div>
  )
}

/** "+3 níveis" — só quando foi mais de um. Transforma "subiu" em "subiu TRÊS". */
function SeloDeNiveis({ quantos, cor }: { quantos: number; cor: string }) {
  return (
    <span
      className="rounded-full px-[.4em] py-[.05em] text-[.6em] font-bold"
      style={{ background: cor, color: 'var(--color-n900)' }}
    >
      +{quantos} níveis
    </span>
  )
}

/**
 * Os stats ganhos, entrando escalonados.
 *
 * `statGains` pode vir com TUDO em zero — a formula do Gen2 e inteira e
 * arredonda pra baixo, entao em nivel alto de curva lenta um level-up legitimo
 * nao move atributo nenhum (`formatStatGains` ja documenta isso). Nesse caso o
 * cartao diz isso em palavras, em vez de mostrar uma lista vazia que pareceria
 * bug.
 */
function ListaDeGanhos({ ganhos }: { ganhos: StatBlock | null }) {
  const subiram = statsQueSubiram(ganhos)
  if (subiram.length === 0) {
    return <span className="text-[.65em] text-n500">Nenhum atributo mudou neste nível.</span>
  }
  return (
    <div className="grid grid-cols-2 gap-x-[.7em] gap-y-[.15em]">
      {subiram.map(([k, v], i) => (
        <span
          key={k}
          className="celeb-entra flex items-center justify-between gap-[.5em] text-[.72em] tabular-nums"
          style={{ animation: `celeb-stat 260ms ease-out ${140 + i * 70}ms both` }}
        >
          <span className="text-n400">{STAT_LABEL[k]}</span>
          <b className="font-bold" style={{ color: 'var(--color-ok)' }}>+{v}</b>
        </span>
      ))}
    </div>
  )
}

/** "35" quando subiu um; "33 → 35" quando o cartao cobre um intervalo. */
function rotuloDeIntervalo(inicial: number, final: number): string {
  return final - inicial > 1 ? `${inicial} → ${final}` : String(final)
}

function statsQueSubiram(ganhos: StatBlock | null | undefined): [keyof StatBlock, number][] {
  if (!ganhos) return []
  return STAT_ORDER
    .filter((k) => (ganhos[k] ?? 0) > 0)
    .map((k) => [k, ganhos[k]] as [keyof StatBlock, number])
}

function Retrato({ id, shiny, grande, opaco }: { id: string; shiny: boolean; grande: boolean; opaco?: boolean }) {
  const url = spriteUrl(id, shiny)
  return (
    <span
      className={cn(
        'block overflow-hidden rounded-[.5em] border-2',
        grande ? 'h-[3.4em] w-[3.4em]' : 'h-[2.4em] w-[2.4em]',
        opaco && 'opacity-45 grayscale',
      )}
      style={{ borderColor: shiny ? 'var(--color-shiny)' : 'var(--color-n700)', background: 'var(--color-n900)' }}
    >
      {url && <img src={url} alt="" className="h-full w-full object-contain [image-rendering:pixelated]" />}
    </span>
  )
}

function Faiscas({ cor }: { cor: string }): ReactNode {
  return (
    <div className="celeb-decorativo pointer-events-none absolute left-1/2 top-1/2 h-0 w-0">
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className="absolute block h-[.32em] w-[.32em] rounded-full"
          style={{
            background: cor,
            boxShadow: `0 0 6px ${cor}`,
            // Angulo fixo por indice, e nao sorteado: dois disparos precisam
            // sair iguais, senao um deles enfileira as faiscas num canto so e
            // le como falha de desenho.
            '--ang': `${i * 36}deg`,
            '--dist': `${5.5 + (i % 3) * 1.6}em`,
            animation: `celeb-faísca 1200ms ease-out ${i * 26}ms forwards`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}
