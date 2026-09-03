// Uma linha de "quem aparece aqui", usada pelo cartao de hunt e pela trilha.
//
// POR QUE ELA SAIU DO `HuntMenu` (PH-470). A linha existia la como `SpeciesRow`
// e mostrava face, tipo, efetividade e chance. A navegacao em dois niveis
// (PH-431) tirou as 120 hunts de bioma daquela lista e as pos na trilha, que
// listava o elenco por NOME e mais nada — as quatro informacoes ficaram
// disponiveis so pro conteudo de fim de jogo, que e justamente onde o jogador
// menos precisa escolher.
//
// Duplicar a marcacao nas duas telas seria garantir que as duas divergem na
// primeira mudanca; e a mesma razao pela qual `TypeChip` deixou de existir cinco
// vezes (ver o cabecalho dele).
import { faceIconUrl } from '@/data/sprites'
import { bestOffensiveMultiplier } from '@/data/typeMatchups'
import type { Species } from '@/data/pokes'
import { TypeChip } from '@/components/shared/TypeChip'
import { cn } from '@/lib/utils'

/**
 * Cor/rotulo do multiplicador ofensivo, mesma paleta de `TypeWeaknessSection`
 * (vantagem verde, fraqueza laranja/vermelha, imune cinza) — nao inventa cor
 * nova pro mesmo conceito.
 *
 * `null` no neutro de proposito: 1x nao informa nada e, numa lista de 40
 * especies, um rotulo em toda linha apaga os que importam.
 */
export function badgeEfetividade(mult: number): { rotulo: string; cor: string } | null {
  if (mult === 1) return null
  if (mult === 0) return { rotulo: 'imune', cor: 'var(--color-n500)' }
  if (mult >= 4) return { rotulo: '4x', cor: '#4ade80' }
  if (mult >= 2) return { rotulo: '2x', cor: '#4ade80' }
  if (mult <= 0.25) return { rotulo: '¼x', cor: 'var(--color-warn)' }
  return { rotulo: '½x', cor: 'var(--color-warn)' }
}

/**
 * A tag de protetor.
 *
 * O VOCABULARIO E `GUARDIAN` E `LORD`, e nunca "boss" ou "chefe" — regra do
 * projeto, e ela existe porque "boss" nomeia TRES sistemas distintos aqui: a
 * sala das hunts (que usa estes dois nomes), o Boss global (feature de fora
 * deste repo) e as "Hunts BOSS" do Modo Pesadelo, que mantem o nome em maiuscula
 * de proposito. Ver CLAUDE.md.
 *
 * LORD ganha ouro e GUARDIAN vermelho: o Lord mora na ULTIMA sala do estagio e e
 * quem credita o progresso do bioma, entao ele e o alvo, nao mais um pedagio. E
 * uma especie pode ser os dois (1.150 das 1.815 combinacoes tem o mesmo pool
 * pros dois papeis) — nesse caso vale o Lord, que e a informacao mais forte.
 */
function TagDeProtetor({ guardian, lord }: { guardian: boolean; lord: boolean }) {
  if (!guardian && !lord) return null
  const ehLord = lord
  return (
    <span
      title={
        lord && guardian
          ? 'Pode aparecer como Guardian nas salas iniciais e como Lord na última'
          : lord
            ? 'Pode aparecer como Lord na última sala do estágio'
            : 'Pode aparecer como Guardian nas salas iniciais'
      }
      className={cn(
        'shrink-0 rounded-[.3em] px-[.35em] py-[.05em] text-[.68em] font-bold',
        ehLord ? 'bg-gold/20 text-gold' : 'bg-[#ff4d4d26] text-[#ff6b6b]',
      )}
    >
      {ehLord ? '★ LORD' : '★ GUARDIAN'}
    </span>
  )
}

export function LinhaDeEspecie({
  species, pct, ativo, guardian = false, lord = false,
}: {
  species: Species
  /** Chance de aparicao em porcentagem. `null` esconde a coluna. */
  pct: number | null
  /** O POKE em campo, pra calcular a efetividade. `null` esconde o badge. */
  ativo: Species | null
  guardian?: boolean
  lord?: boolean
}) {
  const url = faceIconUrl(species.id)
  const badge = ativo ? badgeEfetividade(bestOffensiveMultiplier(ativo, species)) : null
  return (
    <div className="flex items-center gap-[.4em] text-[.85em]">
      {/* Especie sem arte de face cai num quadrado na cor dela, e nao num
          `<img>` quebrado: `faceIconUrl` devolve `null` pra quem nao esta em
          `SPECIES_WITH_ART`, e um 404 de imagem nao lanca erro — deixaria um
          buraco no trilho sem nada denunciando. */}
      {url ? (
        <img src={url} alt="" loading="lazy" className="h-[1.6em] w-[1.6em] shrink-0 object-contain" />
      ) : (
        <span className="h-[1.6em] w-[1.6em] shrink-0 rounded-[.3em]" style={{ background: species.color }} />
      )}
      <TypeChip type={species.type} />
      {species.type2 && <TypeChip type={species.type2} />}
      <span className="min-w-0 flex-1 truncate">{species.name}</span>
      <TagDeProtetor guardian={guardian} lord={lord} />
      {badge && (
        <span
          className="shrink-0 tabular-nums text-[.9em] font-semibold"
          style={{ color: badge.cor }}
          title={`Seu POKE ativo (${ativo!.name}) contra ${species.name}`}
        >
          {badge.rotulo}
        </span>
      )}
      {pct != null && (
        <span className="shrink-0 tabular-nums text-n400">{pct.toFixed(1)}%</span>
      )}
    </div>
  )
}
