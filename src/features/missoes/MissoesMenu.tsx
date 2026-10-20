// Janela Missões (18/10/2026). Nível de cima: Diário, Objetivos e Progresso.
// Progresso abre um SUBMENU (Tasks, Especialidades, Conquistas, Bestiário),
// desenhado como um bloco encaixado embaixo da aba Progresso — a trilha
// "Progresso › Tasks" e a borda que liga os dois deixam claro que é um nível
// abaixo. Cada aba reusa o menu que já existia.
import { CaretRight } from '@phosphor-icons/react'
import { SegmentedTabs } from '@/components/game/controls'
import { useUiStore } from '@/stores/uiStore'
import {
  ABAS_DE_MISSOES, GRUPOS_DE_MISSOES, grupoDaAba, grupoTemSubmenu, type AbaDeMissoes, type GrupoDeMissoes,
} from '@/data/abasDeMissoes'
import { ConteudoDoDiario } from '@/features/primeirosPassos/Diario'
import { ContratosMenu } from '@/features/contratos/ContratosMenu'
import { EspecialidadesMenu } from '@/features/especialidades/EspecialidadesMenu'
import { ConquistasMenu } from '@/features/conquistas/ConquistasMenu'
import { BestiarioMenu } from '@/features/bestiario/BestiarioMenu'
import { avisarTrancado, useTrancas } from '@/features/primeirosPassos/useDesbloqueio'
import { MarcaDeCadeado } from '@/features/primeirosPassos/MarcaDeCadeado'
import { textoDoRequisito } from '@/data/desbloqueios'
import { cn } from '@/lib/utils'
import { usePendenciasDeMissoes } from './pendenciasDeMissoes'
import { AbaObjetivos } from './AbaObjetivos'

const CONTEUDO: Record<AbaDeMissoes, () => React.ReactElement | null> = {
  diario: ConteudoDoDiario,
  objetivos: AbaObjetivos,
  tasks: ContratosMenu,
  especialidades: EspecialidadesMenu,
  conquistas: ConquistasMenu,
  bestiario: BestiarioMenu,
}

const comContagem = (nome: string, n: number) => (n > 0 ? `${nome} (${n})` : nome)

export function MissoesMenu() {
  const aba = useUiStore((s) => s.abaDeMissoes)
  const setAba = useUiStore((s) => s.setAbaDeMissoes)
  const tranca = useTrancas()
  const pendencias = usePendenciasDeMissoes()
  const grupo = grupoDaAba(aba)
  const daquele = (g: GrupoDeMissoes) => ABAS_DE_MISSOES.filter((x) => x.grupo === g)
  const contagemDoGrupo = (g: GrupoDeMissoes) => daquele(g).reduce((s, x) => s + (pendencias[x.aba] ?? 0), 0)

  const escolher = (a: AbaDeMissoes) => {
    const passo = tranca(a)
    if (passo) return avisarTrancado(passo)
    setAba(a)
  }
  // Entrar num grupo com submenu cai na primeira aba destrancada dele, e se
  // nenhuma estiver livre mostra a primeira com o cadeado explicado abaixo.
  const escolherGrupo = (g: GrupoDeMissoes) => {
    if (g === grupo) return
    const abas = daquele(g)
    setAba((abas.find((x) => !tranca(x.aba)) ?? abas[0]).aba)
  }

  const submenu = grupoTemSubmenu(grupo)
  const rotuloDoGrupo = GRUPOS_DE_MISSOES.find((g) => g.value === grupo)!.label
  const rotuloDaAba = ABAS_DE_MISSOES.find((x) => x.aba === aba)!.rotulo
  const passoQueTranca = tranca(aba)
  const Conteudo = CONTEUDO[aba]

  return (
    <div className="flex flex-col gap-[.6em]">
      <SegmentedTabs
        value={grupo}
        onChange={escolherGrupo}
        options={GRUPOS_DE_MISSOES.map((g) => ({ value: g.value, label: comContagem(g.label, contagemDoGrupo(g.value)) }))}
      />
      {submenu && (
        <nav aria-label={`Seções de ${rotuloDoGrupo}`}
          className="-mt-[.35em] rounded-b-[.6em] rounded-tr-[.6em] border-l-[3px] border-menu-brand bg-menu-wash/60 px-[.55em] pt-[.35em] pb-[.45em]">
          <p className="mb-[.3em] flex items-center gap-[.25em] text-[.7em] tracking-wide text-menu-muted uppercase">
            <span>{rotuloDoGrupo}</span><CaretRight aria-hidden /><span className="font-medium text-menu-ink">{rotuloDaAba}</span>
          </p>
          <SegmentedTabs
            value={aba}
            onChange={escolher}
            className="text-[.92em]"
            options={daquele(grupo).map((x) => ({
              value: x.aba,
              label: tranca(x.aba) ? `${x.rotulo} 🔒` : comContagem(x.rotulo, pendencias[x.aba] ?? 0),
            }))}
          />
        </nav>
      )}
      <div className={cn(submenu && 'border-l-[3px] border-menu-brand/30 pl-[.55em]')}>
        {passoQueTranca ? (
          // Aba trancada (ex.: lembrada de outra sessao, ou primeira do grupo sem
          // nenhuma livre): explica em vez de abrir o conteudo.
          <div role="status" className="flex items-center gap-[.5em] rounded-[.5em] border border-menu-line p-[.6em] text-menu-muted">
            <MarcaDeCadeado passoId={passoQueTranca} />
            <span>{textoDoRequisito(passoQueTranca)}</span>
          </div>
        ) : <Conteudo />}
      </div>
    </div>
  )
}
