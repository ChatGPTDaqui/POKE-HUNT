// Tela de Conquistas (spec 2026-10-14-conquistas-design).
//
// O catalogo vem do bundle (generated); o que o jogador tem e o progresso vem
// do servidor ao abrir a tela (`minhas_conquistas`, que avalia antes de
// responder). Nada aqui decide se uma conquista fechou.
import { useEffect, useMemo, useState } from 'react'
import { Medal, LockSimple, Star, Trophy } from '@phosphor-icons/react'
import { CATALOGO_DE_CONQUISTAS } from '@/data/generated/conquistas.generated'
import { NOME_DA_CATEGORIA, type CategoriaDeConquista, type ConquistaDaTela } from '@/data/conquistas'
import { TAMANHO_DA_VITRINE, useConquistasStore } from '@/stores/conquistasStore'
import { Meter, SegmentedTabs } from '@/components/game/controls'
import { SeletorDeTitulo } from '@/features/titulos/SeletorDeTitulo'
import { cn } from '@/lib/utils'
import { COR_DO_NIVEL_DE_CONQUISTA, NOME_DO_NIVEL_DE_CONQUISTA } from './nivelDeConquista'
import { resumoDaPlatina, textoDoProgresso } from './resumoDeConquistas'

type Filtro = 'todas' | 'faltando' | 'desbloqueadas'

const CATEGORIAS = Object.keys(NOME_DA_CATEGORIA) as CategoriaDeConquista[]
const fmtData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function ConquistasMenu() {
  const desbloqueadas = useConquistasStore((s) => s.desbloqueadas)
  const progresso = useConquistasStore((s) => s.progresso)
  const carregado = useConquistasStore((s) => s.carregado)
  const carregando = useConquistasStore((s) => s.carregando)
  const erro = useConquistasStore((s) => s.erro)
  const carregar = useConquistasStore((s) => s.carregar)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [categoria, setCategoria] = useState<CategoriaDeConquista | null>(null)

  useEffect(() => { void carregar() }, [carregar])

  const resumo = useMemo(() => resumoDaPlatina(CATALOGO_DE_CONQUISTAS, desbloqueadas), [desbloqueadas])

  const visiveis = useMemo(() => CATALOGO_DE_CONQUISTAS.filter((c) => {
    if (c.nivel === 'platina') return false
    if (categoria && c.categoria !== categoria) return false
    const tem = Boolean(desbloqueadas[c.id])
    if (filtro === 'faltando') return !tem
    if (filtro === 'desbloqueadas') return tem
    return true
  }), [categoria, filtro, desbloqueadas])

  const platina = CATALOGO_DE_CONQUISTAS.find((c) => c.nivel === 'platina')

  return (
    <div className="flex flex-col gap-[.6em]">
      <Cabecalho resumo={resumo} platina={platina} platinado={platina ? Boolean(desbloqueadas[platina.id]) : false} />

      {carregado && <TituloEVitrine desbloqueadas={desbloqueadas} />}

      <p className="text-[.74em] text-menu-muted">
        Só conta o que você conquistou: POKE comprado no Mercado ou recebido em troca não vale. Conquistas de
        POKE valem para as capturas a partir de 14/10/2026.
      </p>

      <SegmentedTabs<Filtro>
        value={filtro}
        onChange={setFiltro}
        options={[
          { value: 'todas', label: 'Todas' },
          { value: 'faltando', label: 'Faltando' },
          { value: 'desbloqueadas', label: 'Desbloqueadas' },
        ]}
      />

      <div className="flex flex-wrap gap-[.35em]" role="group" aria-label="Categoria">
        <ChipDeCategoria ativo={categoria === null} onClick={() => setCategoria(null)}>Todas</ChipDeCategoria>
        {CATEGORIAS.map((cat) => (
          <ChipDeCategoria key={cat} ativo={categoria === cat} onClick={() => setCategoria(cat)}>
            {NOME_DA_CATEGORIA[cat]}
          </ChipDeCategoria>
        ))}
      </div>

      {erro && (
        <div className="rounded-[.6em] border border-danger/50 bg-danger/10 p-[.6em] text-[.8em]">
          {erro} <button type="button" className="underline" onClick={() => void carregar()}>Tentar de novo</button>
        </div>
      )}
      {!carregado && carregando && <div className="text-[.8em] text-menu-muted">Carregando conquistas…</div>}

      <ul className="flex flex-col gap-[.4em]">
        {visiveis.map((c) => (
          <CartaoDeConquista key={c.id} c={c} em={desbloqueadas[c.id] ?? null} valor={progresso[c.id] ?? 0} />
        ))}
        {visiveis.length === 0 && carregado && (
          <li className="rounded-[.6em] border border-dashed border-menu-line p-[.7em] text-[.8em] text-menu-muted">
            Nada por aqui com esse filtro.
          </li>
        )}
      </ul>
    </div>
  )
}

function Cabecalho({ resumo, platina, platinado }: {
  resumo: ReturnType<typeof resumoDaPlatina>
  platina: ConquistaDaTela | undefined
  platinado: boolean
}) {
  const pct = resumo.total ? Math.round((resumo.feitas / resumo.total) * 100) : 0
  return (
    <div className="flex flex-col gap-[.45em] rounded-[.7em] border border-menu-line bg-menu-card p-[.65em]">
      <div className="flex items-center gap-[.6em]">
        <Trophy
          weight="fill"
          className="shrink-0 text-[1.8em]"
          style={{ color: platinado ? COR_DO_NIVEL_DE_CONQUISTA.platina : 'var(--color-menu-muted)' }}
        />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {platina?.nome ?? 'Platina'} — {resumo.feitas} / {resumo.total}
          </div>
          <div className="text-[.74em] text-menu-muted">
            {platinado
              ? 'Platinado! Todas as Bronze, Prata e Ouro desbloqueadas.'
              : resumo.secretasFaltando > 0
                ? `Faltam ${resumo.total - resumo.feitas}, incluindo ${resumo.secretasFaltando} secreta${resumo.secretasFaltando > 1 ? 's' : ''}.`
                : `Faltam ${resumo.total - resumo.feitas}.`}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono text-[1.1em] font-semibold tabular-nums">{resumo.pontos}</div>
          <div className="text-[.62em] uppercase tracking-wide text-menu-muted">pontos</div>
        </div>
      </div>
      <Meter pct={pct} color={COR_DO_NIVEL_DE_CONQUISTA.platina} />
      <div className="text-[.72em] text-menu-muted">
        <span style={{ color: COR_DO_NIVEL_DE_CONQUISTA.impossivel }}>Lenda Viva</span>: {resumo.lendasFeitas} / {resumo.lendasTotal}
        {' '}— conquistas quase impossíveis, fora da platina.
      </div>
    </div>
  )
}

// Titulo: seletor unico (conquistas + Especialidades), com o visual da gema
// (21/10/2026). Ver features/titulos/SeletorDeTitulo.
function TituloEVitrine(_props: { desbloqueadas: Record<string, string> }) {
  const vitrine = useConquistasStore((s) => s.vitrine)
  return (
    <div className="flex flex-col gap-[.35em] rounded-[.6em] border border-menu-line p-[.55em] text-[.8em]">
      <span className="text-menu-muted">Título no perfil</span>
      <SeletorDeTitulo />
      <span className="text-menu-muted">
        Vitrine: {vitrine.length}/{TAMANHO_DA_VITRINE} — toque na estrela de uma conquista desbloqueada para exibi-la no seu perfil.
      </span>
    </div>
  )
}

function ChipDeCategoria({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'rounded-full border px-[.65em] py-[.2em] text-[.74em] font-[inherit]',
        ativo ? 'border-menu-brand bg-menu-wash text-menu-ink' : 'border-menu-line text-menu-muted hover:border-menu-brand',
      )}
    >
      {children}
    </button>
  )
}

function CartaoDeConquista({ c, em, valor }: { c: ConquistaDaTela; em: string | null; valor: number }) {
  const tem = em !== null
  const escondida = c.secreta && !tem
  const cor = COR_DO_NIVEL_DE_CONQUISTA[c.nivel]
  const mostrarBarra = !tem && c.alvo > 1
  const pct = c.alvo ? Math.min(100, (valor / c.alvo) * 100) : 0

  return (
    <li
      className={cn(
        'flex items-start gap-[.6em] rounded-[.6em] border bg-menu-card p-[.55em]',
        tem ? 'border-menu-line' : 'border-menu-line/60',
      )}
    >
      <span
        className="mt-[.1em] flex h-[2.1em] w-[2.1em] shrink-0 items-center justify-center rounded-full border-2"
        style={{ borderColor: cor, background: tem ? `${cor}33` : 'transparent', opacity: tem ? 1 : 0.55 }}
        aria-hidden
      >
        {escondida
          ? <LockSimple weight="bold" style={{ color: cor }} />
          : <Medal weight={tem ? 'fill' : 'regular'} style={{ color: cor }} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-[.45em]">
          <span className={cn('font-semibold', !tem && 'text-menu-ink/80')}>{escondida ? '???' : c.nome}</span>
          <span className="text-[.62em] uppercase tracking-wide" style={{ color: cor }}>
            {NOME_DO_NIVEL_DE_CONQUISTA[c.nivel]}
          </span>
        </div>
        <div className="text-[.78em] text-menu-muted">
          {escondida ? 'Conquista secreta. Continue jogando para descobrir.' : c.descricao}
        </div>
        {!escondida && c.ref && <div className="text-[.64em] text-menu-muted/80">{c.ref}</div>}
        {mostrarBarra && !escondida && (
          <div className="mt-[.3em] flex items-center gap-[.5em]">
            <Meter pct={pct} color={cor} className="flex-1" />
            <span className="shrink-0 text-[.7em] tabular-nums text-menu-muted">{textoDoProgresso(c, valor)}</span>
          </div>
        )}
      </div>
      {tem && (
        <div className="flex shrink-0 flex-col items-end gap-[.2em]">
          <span className="text-[.66em] tabular-nums text-menu-muted">{fmtData.format(new Date(em))}</span>
          <BotaoDaVitrine id={c.id} nome={c.nome} />
        </div>
      )}
    </li>
  )
}

function BotaoDaVitrine({ id, nome }: { id: string; nome: string }) {
  const vitrine = useConquistasStore((s) => s.vitrine)
  const alternar = useConquistasStore((s) => s.alternarVitrine)
  const exibida = vitrine.includes(id)
  const cheia = !exibida && vitrine.length >= TAMANHO_DA_VITRINE
  return (
    <button
      type="button"
      aria-pressed={exibida}
      aria-label={exibida ? `Tirar ${nome} da vitrine` : `Exibir ${nome} na vitrine`}
      title={cheia ? `A vitrine já tem ${TAMANHO_DA_VITRINE}. Tire uma para trocar.` : undefined}
      disabled={cheia}
      onClick={() => void alternar(id)}
      className="rounded-[.3em] p-[.15em] text-[1em] disabled:opacity-35"
    >
      <Star weight={exibida ? 'fill' : 'regular'} className={exibida ? 'text-gold' : 'text-menu-muted'} />
    </button>
  )
}
