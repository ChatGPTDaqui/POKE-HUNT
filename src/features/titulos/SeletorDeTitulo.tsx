// Seletor de titulo (21/10/2026): cada opcao ja mostra o efeito da gema, entao o
// jogador escolhe vendo como vai ficar. Perfil do treinador e aba Conquistas.
import { useConquistasStore } from '@/stores/conquistasStore'
import { useGameStateStore } from '@/stores/gameStateStore'
import { titulosDisponiveis, VISUAL_DA_GEMA } from '@/data/titulos'
import { cn } from '@/lib/utils'
import { TituloComGema } from './TituloComGema'

export function SeletorDeTitulo({ className }: { className?: string }) {
  const desbloqueadas = useConquistasStore((s) => s.desbloqueadas)
  const atual = useConquistasStore((s) => s.titulo)
  const escolher = useConquistasStore((s) => s.escolherTitulo)
  const carregado = useConquistasStore((s) => s.carregado)
  const especialidades = useGameStateStore((s) => s.especialidades)
  const opcoes = titulosDisponiveis(desbloqueadas, especialidades)

  if (!carregado) return <p className={cn('text-[.8em] text-menu-muted', className)}>Carregando títulos…</p>
  if (opcoes.length === 0) {
    return (
      <p className={cn('text-[.8em] text-menu-muted', className)}>
        Ganhe títulos com conquistas Ouro, Impossível e Platina, e com Especialidade nos níveis 3, 7 e 10.
      </p>
    )
  }
  return (
    <div role="radiogroup" aria-label="Título exibido" className={cn('flex max-h-[14em] flex-col gap-[.25em] overflow-y-auto', className)}>
      <OpcaoDeTitulo ativo={atual == null} onClick={() => void escolher(null)}>
        <span className="text-menu-muted">Sem título</span>
      </OpcaoDeTitulo>
      {opcoes.map((t) => (
        <OpcaoDeTitulo key={t.id} ativo={atual === t.id} onClick={() => void escolher(t.id)}>
          <TituloComGema titulo={t} className="min-w-0" />
          <span className="ml-auto shrink-0 text-[.75em] text-menu-muted">{VISUAL_DA_GEMA[t.gema].nome}</span>
        </OpcaoDeTitulo>
      ))}
    </div>
  )
}

function OpcaoDeTitulo({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={ativo} onClick={onClick}
      className={cn(
        'flex min-h-[2.2em] w-full items-center gap-[.5em] rounded-[.45em] border px-[.6em] py-[.25em] text-left text-[.85em]',
        ativo ? 'border-menu-brand bg-menu-wash' : 'border-menu-line hover:bg-menu-wash',
      )}>
      {children}
    </button>
  )
}
