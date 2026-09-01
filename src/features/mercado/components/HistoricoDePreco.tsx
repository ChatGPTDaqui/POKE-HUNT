// Historico de preco do Mercado (PH-97): serie de 30 dias + volume + resumo.
//
// ---------------------------------------------------------------------------
// DUAS FAIXAS EMPILHADAS, NUNCA DOIS EIXOS
// ---------------------------------------------------------------------------
// Preco e volume sao medidas de escalas sem relacao (ouro por unidade contra
// unidades negociadas). Sobrepor as duas num grafico com dois eixos Y e o erro
// classico de visualizacao: as duas curvas se cruzam onde as ESCALAS foram
// escolhidas pra se cruzar, e o leitor le correlacao onde nao ha nenhuma. Aqui
// sao duas faixas separadas, compartilhando o eixo do tempo.
//
// ---------------------------------------------------------------------------
// O NUMERO EM TEXTO NAO E DECORACAO DO GRAFICO — E O CONTEUDO
// ---------------------------------------------------------------------------
// A pergunta do jogador e "quanto vale isso", e um sparkline de 60px de altura
// num celular de 390px nao responde. O grafico responde outra coisa ("esta
// subindo ou caindo"), que tambem importa mas e secundaria. Por isso a linha de
// numeros vem PRIMEIRO no DOM e sobrevive sozinha: se a serie estiver vazia mas
// houver resumo, ou vice-versa, cada metade aparece por conta propria.
//
// Rotulo direto so no MINIMO e no MAXIMO da janela. Numero em todo ponto
// transforma o grafico em tabela ruim, e sao 30 pontos.
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as mercadoRpc from '@/data/remote/mercadoRpc'
import type { HistoricoDePreco as Dados, PontoDeHistorico } from '@/data/remote/mercadoRpc'
import { SectionLabel } from '@/components/game/controls'
import { fmt, STALE_MS } from '../utils'

const ALTURA_PRECO = 42
const ALTURA_VOLUME = 14
const LARGURA = 300

interface Props {
  /** Item ou especie: um dos dois, nunca os dois. */
  itemId?: string
  speciesId?: string
  currency?: 'gold' | 'diamond'
}

function Vazio({ motivo }: { motivo: string }) {
  return <p className="text-[.75em] text-n500">{motivo}</p>
}

function LinhaDeResumo({ resumo, currency }: { resumo: NonNullable<Dados['resumo']>; currency: string }) {
  const unidade = currency === 'diamond' ? '◆' : '🪙'
  return (
    <div className="flex flex-wrap items-baseline gap-x-[.9em] gap-y-[.15em] text-[.8em] tabular-nums">
      <span>
        <span className="text-n500">24h </span>
        {/* `null` e "não houve negocio", nao zero. Mostrar 0 aqui daria um
            preco em que da pra clicar. */}
        {resumo.mediana24h == null
          ? <span className="text-n500">—</span>
          : <span className="font-medium text-gold">{unidade} {fmt.format(resumo.mediana24h)}</span>}
      </span>
      <span>
        <span className="text-n500">7d </span>
        {resumo.mediana7d == null
          ? <span className="text-n500">—</span>
          : <span className="font-medium text-gold">{unidade} {fmt.format(resumo.mediana7d)}</span>}
      </span>
      <span>
        <span className="text-n500">vol 24h </span>
        <span className="text-n300">{fmt.format(resumo.volume24h)}</span>
      </span>
      <span>
        <span className="text-n500">30d </span>
        <span className="text-n300">{fmt.format(resumo.negocios30d)} negócios</span>
      </span>
    </div>
  )
}

function Grafico({ serie, currency }: { serie: PontoDeHistorico[]; currency: string }) {
  const [focado, setFocado] = useState<number | null>(null)
  const unidade = currency === 'diamond' ? '◆' : '🪙'

  const geo = useMemo(() => {
    const precos = serie.map((p) => p.mediana)
    const min = Math.min(...precos)
    const max = Math.max(...precos)
    // Faixa achatada (todo dia no mesmo preco) daria divisao por zero e a linha
    // sairia no topo ou no rodape. Centraliza.
    const amplitude = max - min || 1
    const volMax = Math.max(...serie.map((p) => p.volume), 1)
    // Um ponto so nao tem "entre": ancora no meio em vez de dividir por zero.
    const passo = serie.length > 1 ? LARGURA / (serie.length - 1) : 0
    const pontos = serie.map((p, i) => ({
      x: serie.length > 1 ? i * passo : LARGURA / 2,
      y: ALTURA_PRECO - ((p.mediana - min) / amplitude) * (ALTURA_PRECO - 6) - 3,
      hVol: Math.max(1, (p.volume / volMax) * ALTURA_VOLUME),
      dado: p,
    }))
    return {
      pontos, min, max,
      iMin: precos.indexOf(min),
      iMax: precos.indexOf(max),
      // Largura da barra de volume com folga de 2px entre vizinhas — sem o
      // vao, barras adjacentes viram um bloco solido e o volume por dia deixa
      // de ser legivel.
      larguraBarra: Math.max(1, (serie.length > 1 ? passo : LARGURA) - 2),
    }
  }, [serie])

  const caminho = geo.pontos.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const emFoco = focado != null ? geo.pontos[focado] : null

  return (
    <div className="flex flex-col gap-[.2em]">
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA_PRECO + ALTURA_VOLUME + 4}`}
        className="w-full"
        // O grafico e um resumo do que a linha de numeros acima ja diz em
        // texto; leitor de tela le os numeros, nao o desenho.
        role="presentation"
        preserveAspectRatio="none"
        onPointerLeave={() => setFocado(null)}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const frac = (e.clientX - r.left) / r.width
          setFocado(Math.min(serie.length - 1, Math.max(0, Math.round(frac * (serie.length - 1)))))
        }}
      >
        {/* Faixa de PRECO */}
        <path d={caminho} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-gold" />
        {geo.pontos.length <= 1 && (
          <circle cx={geo.pontos[0]?.x ?? 0} cy={geo.pontos[0]?.y ?? 0} r={3} className="fill-gold" />
        )}
        {/* Rotulo direto so nos extremos. */}
        {[geo.iMax, geo.iMin].map((i, k) => (
          <circle key={`e${k}`} cx={geo.pontos[i].x} cy={geo.pontos[i].y} r={2.5} className="fill-gold" />
        ))}

        {/* Faixa de VOLUME, com a base ancorada no rodape. */}
        {geo.pontos.map((p, i) => (
          <rect
            key={`v${i}`}
            x={p.x - geo.larguraBarra / 2}
            y={ALTURA_PRECO + 4 + (ALTURA_VOLUME - p.hVol)}
            width={geo.larguraBarra}
            height={p.hVol}
            rx={1}
            className="fill-n600"
          />
        ))}

        {emFoco && (
          <line
            x1={emFoco.x} x2={emFoco.x} y1={0} y2={ALTURA_PRECO + ALTURA_VOLUME + 4}
            strokeWidth={1} className="stroke-n500"
          />
        )}
      </svg>

      {/* Leitura do ponto sob o cursor/dedo. Ocupa altura fixa pra o painel nao
          pular de tamanho quando o cursor entra e sai. */}
      <div className="min-h-[1.2em] text-[.72em] tabular-nums text-n400">
        {emFoco
          ? `${emFoco.dado.dia} · ${unidade} ${fmt.format(emFoco.dado.mediana)} · ${fmt.format(emFoco.dado.volume)} un`
          : `min ${unidade} ${fmt.format(geo.min)} · max ${unidade} ${fmt.format(geo.max)} · 30 dias`}
      </div>
    </div>
  )
}

export function HistoricoDePreco({ itemId, speciesId, currency = 'gold' }: Props) {
  const chave = itemId ? ['mercado', 'hist-item', itemId, currency] : ['mercado', 'hist-poke', speciesId, currency]
  const { data, isLoading } = useQuery({
    queryKey: chave,
    queryFn: () => (itemId
      ? mercadoRpc.historicoDoItem(itemId, currency)
      : mercadoRpc.historicoDaEspecie(speciesId!, currency)),
    enabled: Boolean(itemId || speciesId),
    // Historico de 30 dias nao muda a cada segundo; vale um cache mais longo
    // que a vitrine (que reflete o que os outros estao fazendo AGORA).
    staleTime: STALE_MS * 6,
  })

  return (
    <div className="flex flex-col gap-[.3em]">
      <SectionLabel>PREÇO NEGOCIADO</SectionLabel>
      {isLoading && <Vazio motivo="Carregando histórico..." />}
      {!isLoading && data && (
        <>
          {data.resumo
            ? <LinhaDeResumo resumo={data.resumo} currency={currency} />
            : <Vazio motivo="Sem histórico: ninguém negociou isso nos últimos 30 dias." />}
          {data.serie.length > 0 && <Grafico serie={data.serie} currency={currency} />}
        </>
      )}
    </div>
  )
}
