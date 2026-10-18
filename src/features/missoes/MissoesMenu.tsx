// Janela Missões (18/10/2026): Diário, Objetivos, Tasks, Especialidades,
// Conquistas e Bestiário como abas, em dois grupos (Hoje / Progresso), no mesmo
// padrão da Wiki. Cada aba reusa o menu que já existia.
import { SegmentedTabs } from '@/components/game/controls'
import { useUiStore } from '@/stores/uiStore'
import {
  ABAS_DE_MISSOES, GRUPOS_DE_MISSOES, grupoDaAba, type AbaDeMissoes, type GrupoDeMissoes,
} from '@/data/abasDeMissoes'
import { ConteudoDoDiario } from '@/features/primeirosPassos/Diario'
import { TasksMenu } from '@/features/tasks/TasksMenu'
import { EspecialidadesMenu } from '@/features/especialidades/EspecialidadesMenu'
import { ConquistasMenu } from '@/features/conquistas/ConquistasMenu'
import { BestiarioMenu } from '@/features/bestiario/BestiarioMenu'
import { avisarTrancado, useTrancas } from '@/features/primeirosPassos/useDesbloqueio'
import { MarcaDeCadeado } from '@/features/primeirosPassos/MarcaDeCadeado'
import { textoDoRequisito } from '@/data/desbloqueios'
import { usePendenciasDeMissoes } from './pendenciasDeMissoes'
import { AbaObjetivos } from './AbaObjetivos'

const CONTEUDO: Record<AbaDeMissoes, () => React.ReactElement | null> = {
  diario: ConteudoDoDiario,
  objetivos: AbaObjetivos,
  tasks: TasksMenu,
  especialidades: EspecialidadesMenu,
  conquistas: ConquistasMenu,
  bestiario: BestiarioMenu,
}

export function MissoesMenu() {
  const aba = useUiStore((s) => s.abaDeMissoes)
  const setAba = useUiStore((s) => s.setAbaDeMissoes)
  const tranca = useTrancas()
  const pendencias = usePendenciasDeMissoes()
  const grupo = grupoDaAba(aba)

  const rotulo = (a: AbaDeMissoes, nome: string) => {
    const n = pendencias[a] ?? 0
    return tranca(a) ? `${nome} 🔒` : n > 0 ? `${nome} (${n})` : nome
  }
  const escolher = (a: AbaDeMissoes) => {
    const passo = tranca(a)
    if (passo) return avisarTrancado(passo)
    setAba(a)
  }
  const escolherGrupo = (g: GrupoDeMissoes) => {
    const daquele = ABAS_DE_MISSOES.filter((x) => x.grupo === g)
    escolher((daquele.find((x) => !tranca(x.aba)) ?? daquele[0]).aba)
  }

  const passoQueTranca = tranca(aba)
  const Conteudo = CONTEUDO[aba]
  return (
    <div className="flex flex-col gap-[.6em]">
      <SegmentedTabs value={grupo} onChange={escolherGrupo} options={[...GRUPOS_DE_MISSOES]} />
      <SegmentedTabs
        value={aba}
        onChange={escolher}
        options={ABAS_DE_MISSOES.filter((x) => x.grupo === grupo).map((x) => ({ value: x.aba, label: rotulo(x.aba, x.rotulo) }))}
      />
      {passoQueTranca ? (
        // Aba que ficou na memoria de uma sessao anterior e hoje esta trancada
        // (conta nova no mesmo aparelho): explica em vez de abrir o conteudo.
        <div role="status" className="flex items-center gap-[.5em] rounded-[.5em] border border-menu-line p-[.6em] text-menu-muted">
          <MarcaDeCadeado passoId={passoQueTranca} />
          <span>{textoDoRequisito(passoQueTranca)}</span>
        </div>
      ) : <Conteudo />}
    </div>
  )
}
