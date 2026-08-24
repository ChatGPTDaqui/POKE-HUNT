// Qual clima esta em campo AGORA (PH-141).
//
// ---------------------------------------------------------------------------
// POR QUE ISTO PRECISA EXISTIR
// ---------------------------------------------------------------------------
// Granizo e areia tiram 1/16 do HP maximo por TURNO. Sem um lugar que diga
// "esta caindo granizo", o jogador ve o HP descendo sozinho e nao tem como
// saber por que — e a hunt dura 30 abates por sala, entao ele passa muito tempo
// nesse escuro. E a mesma classe de problema que a leitura do combate ja
// registra: dano sem canal de explicacao.
//
// O efeito visual no canvas (`render/climaVisual.ts`) e o canal bonito; ESTE e
// o canal confiavel. Ele nao depende do ajuste "vida no cenario", que desliga
// as particulas por desempenho: quem joga com o cenario limpo continua
// precisando saber que esta perdendo HP pro tempo.
//
// ---------------------------------------------------------------------------
// AMBIENTE E GOLPE SAO MOSTRADOS DIFERENTE, DE PROPOSITO
// ---------------------------------------------------------------------------
// Clima de ambiente vale a sala inteira; clima de golpe dura 10 turnos e some.
// Um jogador que acabou de usar Rain Dance precisa saber que aquilo e
// temporario — senao ele planeja a luta em cima de uma chuva que vai acabar.
import { useWorldStore } from '@/stores/worldStore'
import { cn } from '@/lib/utils'

import type { ClimaTipo } from '@/engine/types'

interface Aparencia {
  nome: string
  /** Emoji em vez de icone da Phosphor: clima e a unica coisa do HUD em que a
   *  forma exata (gota, floco, sol) importa mais que a consistencia do traco. */
  simbolo: string
  /** Classe de cor do texto. Casa com o filtro que o canvas aplica. */
  cor: string
  /** O que o clima FAZ, em uma linha. Vai no `title` — o chip e estreito. */
  efeito: string
}

const APARENCIA: Record<ClimaTipo, Aparencia> = {
  chuva: {
    nome: 'Chuva', simbolo: '🌧️', cor: 'text-[#8fc4e8]',
    efeito: 'Golpes de Agua +50% de dano, de Fogo −50%.',
  },
  sol: {
    nome: 'Sol forte', simbolo: '☀️', cor: 'text-[#ffc861]',
    efeito: 'Golpes de Fogo +50% de dano, de Agua −50%.',
  },
  granizo: {
    nome: 'Granizo', simbolo: '🧊', cor: 'text-[#a8e4f2]',
    efeito: 'Tira 1/16 do HP por turno de quem nao e do tipo Gelo.',
  },
  neve: {
    nome: 'Neve', simbolo: '❄️', cor: 'text-[#d7ecff]',
    efeito: 'Nao causa dano. +50% de Defesa para POKE do tipo Gelo.',
  },
  areia: {
    nome: 'Tempestade de areia', simbolo: '🌪️', cor: 'text-[#e0c286]',
    efeito: 'Tira 1/16 do HP por turno de quem nao e Pedra, Terra ou Aco.',
  },
  nevoa: {
    nome: 'Neblina', simbolo: '🌫️', cor: 'text-[#c3ccd4]',
    efeito: 'Precisao de todos os golpes cai para 60% do normal.',
  },
}

/** Climas que TIRAM HP por turno — os unicos que ganham destaque de alerta. */
const CLIMAS_QUE_MACHUCAM: ReadonlySet<ClimaTipo> = new Set<ClimaTipo>(['granizo', 'areia'])

export function ClimaChip() {
  const clima = useWorldStore((s) => s.clima)
  // Fora de hunt (Hospital) nao ha clima, e um chip vazio pendurado no HUD
  // leria como bug — mesma regra do SalaChip.
  if (!clima) return null

  const aparencia = APARENCIA[clima.tipo]
  if (!aparencia) return null

  const deGolpe = clima.origem === 'golpe'
  const machuca = CLIMAS_QUE_MACHUCAM.has(clima.tipo)
  const turnos = deGolpe && Number.isFinite(clima.turnosRestantes)
    ? Math.max(0, Math.ceil(clima.turnosRestantes))
    : null

  return (
    <div
      title={`${aparencia.nome} — ${aparencia.efeito}${deGolpe ? ' Ligado por golpe: acaba e o clima do lugar volta.' : ''}`}
      className={cn(
        'vidro flex shrink-0 items-center gap-[.4em] rounded-full px-[.8em] py-[.35em]',
        // So o clima que TIRA HP ganha borda de alerta. Pintar todos de
        // vermelho ensinaria o jogador a ignorar a borda — e ai o granizo
        // deixaria de avisar.
        machuca && 'border border-bad/45',
      )}
    >
      <span aria-hidden className="text-[.85em] leading-none">{aparencia.simbolo}</span>
      <span className={cn('text-[.75em] font-medium', aparencia.cor)}>{aparencia.nome}</span>
      {turnos != null && (
        // A contagem so aparece no clima de golpe. No de ambiente ela seria
        // "infinito", que nao e informacao.
        <span className="shrink-0 text-[.68em] tabular-nums text-n500">{turnos} turnos</span>
      )}
    </div>
  )
}
