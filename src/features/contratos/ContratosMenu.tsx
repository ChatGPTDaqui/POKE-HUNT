// Mural de contratos (20/10/2026, pedido do dono): substitui as cadeias de
// Tasks. Cinco contratos por dia, pregados num quadro de cortica; cada um pede
// abates (ou um shiny) de uma especie e paga um OVO da forma base dela, na
// raridade do contrato. Refresh pago em diamantes, preco dobrando no dia.
import { useEffect, useMemo, useState } from 'react'
import { ArrowsClockwise, Diamond } from '@phosphor-icons/react'
import { SPECIES } from '@/data/pokes'
import { RARITIES } from '@/data/rarity'
import { gen5SpriteUrl } from '@/data/gen5Sprites'
import { colorForType } from '@/data/typeColors'
import { precoDoRefresh, progressoDoContrato, type Contrato } from '@/data/ovos'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useToastStore } from '@/stores/toastStore'
import { useMuralStore } from '@/data/remote/muralRpc'
import { GameButton } from '@/components/game/controls'
import { cn } from '@/lib/utils'
import { OvoArte } from '@/features/ovos/OvoArte'
import { ListaDeOvos } from '@/features/ovos/CartaoDoOvo'
import '@/features/ovos/ovos.css'

const fmt = new Intl.NumberFormat('pt-BR')
const GIROS = ['-1.6deg', '1.2deg', '-0.8deg', '1.8deg', '-1.2deg']
const ALFINETES = ['#c0392b', '#2e86de', '#27ae60', '#f39c12', '#8e44ad']

function toast(m: string, tipo: 'success' | 'error' = 'success') {
  useToastStore.getState().pushToast(m, tipo, 'world')
}

/** Tempo ate a meia-noite de Brasilia (UTC-3, sem horario de verao). */
function ateAMeiaNoite(agora = Date.now()): string {
  const brt = agora - 3 * 3600_000
  const resto = 86_400_000 - (brt % 86_400_000)
  const h = Math.floor(resto / 3600_000)
  const m = Math.floor((resto % 3600_000) / 60_000)
  return `${h}h${String(m).padStart(2, '0')}`
}

export function ContratosMenu() {
  const { mural, carregando, erro, carregar, refresh } = useMuralStore()
  const diamantes = useGameStateStore((s) => s.wallet.diamonds)
  const [trocando, setTrocando] = useState(false)
  const [relogio, setRelogio] = useState(() => ateAMeiaNoite())

  useEffect(() => { void carregar() }, [carregar])
  useEffect(() => {
    const t = setInterval(() => setRelogio(ateAMeiaNoite()), 30_000)
    return () => clearInterval(t)
  }, [])

  const preco = precoDoRefresh(mural?.refreshes ?? 0)
  const algumAberto = mural?.contratos.some((c) => !c.reivindicado) ?? false

  async function trocar() {
    setTrocando(true)
    try {
      await refresh()
      toast('Contratos novos no mural!')
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      setTrocando(false)
    }
  }

  return (
    <div className="flex flex-col gap-[.7em]">
      <div className="mural-quadro">
        <div className="mural-faixa">Mural de Contratos</div>
        <div className="mb-[.7em] flex flex-wrap items-center justify-between gap-[.5em] px-[.2em] text-[.8em] text-[#fbe9c8]">
          <span>Novos contratos em <b>{relogio}</b></span>
          <GameButton variant="secondary" disabled={!algumAberto || trocando || diamantes < preco} carregando={trocando} onClick={trocar}
            title={diamantes < preco ? `Precisa de ${preco} diamantes` : 'Troca os contratos ainda não reivindicados'}>
            <ArrowsClockwise aria-hidden /> Trocar <Diamond weight="fill" aria-hidden className="text-[#7fd6ff]" /> {preco}
          </GameButton>
        </div>

        {erro && !mural && <p className="rounded-[.4em] bg-black/30 p-[.6em] text-[.85em] text-[#fbe9c8]">Não foi possível abrir o mural: {erro}</p>}
        {!mural && carregando && <p className="p-[.6em] text-center text-[.85em] text-[#fbe9c8]">Pregando os contratos…</p>}

        {mural && (
          <div className="mural-grade">
            {mural.contratos.map((c, i) => <CartaoDeContrato key={`${mural.dia}-${c.slot}-${c.speciesId}`} contrato={c} indice={i} />)}
          </div>
        )}
      </div>

      <ListaDeOvos onde="todos" titulo="Seus ovos" />
      <p className="text-[.75em] text-menu-muted">
        O ovo choca com abates enquanto estiver na equipe (ocupa uma das 6 vagas). Na Mochila ele espera.
      </p>
    </div>
  )
}

function CartaoDeContrato({ contrato: c, indice }: { contrato: Contrato; indice: number }) {
  const kills = useGameStateStore((s) => s.pokedexKills[c.speciesId])
  const reivindicar = useMuralStore((s) => s.reivindicar)
  const [ocupado, setOcupado] = useState(false)
  const especie = SPECIES[c.speciesId]
  const base = SPECIES[c.baseId]
  const feito = progressoDoContrato(c, kills)
  const cumprido = feito >= c.alvo
  const raridade = RARITIES[c.raridade]
  const shiny = c.tipo === 'shiny'
  const nome = especie?.name ?? c.speciesId
  const pedido = useMemo(
    () => (shiny ? `Derrote 1 ${nome} shiny` : `Derrote ${fmt.format(c.alvo)} ${nome}`),
    [shiny, nome, c.alvo],
  )

  async function receber() {
    setOcupado(true)
    try {
      toast(await reivindicar(c.slot))
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      toast(/cumprido/i.test(m) ? 'Quase lá! Os últimos abates ainda estão sincronizando (até 30 s).' : m, 'error')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <article className={cn('contrato', shiny && 'contrato-shiny')}
      style={{ ['--giro' as string]: GIROS[indice % GIROS.length], ['--alfinete' as string]: ALFINETES[indice % ALFINETES.length], ['--tipo' as string]: colorForType(especie?.type), ['--raridade' as string]: raridade.color }}>
      <span className="contrato-alfinete" aria-hidden />
      <div className="contrato-titulo">{shiny ? '✦ Contrato Shiny ✦' : 'Contrato'}</div>
      <div className="contrato-retrato">
        {especie && <img src={gen5SpriteUrl(especie.id, shiny)} alt={nome} loading="lazy" />}
      </div>
      <div className="contrato-pedido">{pedido}</div>
      {!c.reivindicado && (
        <>
          <div className="contrato-barra" role="progressbar" aria-valuemin={0} aria-valuemax={c.alvo} aria-valuenow={feito}>
            <span style={{ width: `${(feito / c.alvo) * 100}%` }} />
          </div>
          <div className="text-center text-[.72em] tabular-nums opacity-80">{fmt.format(feito)} / {fmt.format(c.alvo)}</div>
        </>
      )}
      <div className="contrato-premio">
        <OvoArte raridade={c.raridade} shiny={shiny} tamanho={2} />
        <span>Ovo de <b>{base?.name ?? c.baseId}</b>{shiny && <> · 25% de nascer shiny</>}</span>
      </div>
      <span className="contrato-lacre" aria-label={`Raridade ${raridade.label}`}>{raridade.label.slice(0, 4)}</span>
      {c.reivindicado
        ? <span className="contrato-carimbo contrato-carimbo-feito">Entregue</span>
        : cumprido && <span className="contrato-carimbo contrato-carimbo-cumprido">Cumprido</span>}
      {!c.reivindicado && (
        <GameButton variant={cumprido ? 'primary' : 'secondary'} disabled={!cumprido || ocupado} carregando={ocupado} onClick={receber}>
          {cumprido ? 'Receber ovo' : 'Em andamento'}
        </GameButton>
      )}
    </article>
  )
}
