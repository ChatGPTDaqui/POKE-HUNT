// Catalogo do mural de contratos: quem pode aparecer num contrato, por bioma, e
// as habilidades da forma base que nasce do ovo. Separado de `ovos.ts` de
// proposito: este arquivo puxa o catalogo inteiro de hunts e so serve ao
// gerador da migration (`ovos.test.ts` com GERAR_OVOS=1), nunca a tela.
import { SPECIES } from './pokes'
import { BIOMAS } from './biomas'
import { SUB_BIOMA_ESPECIES } from './generated/subBiomas.generated'
import { SPAWN_WEIGHT_BY_SPECIES } from './generated/spawnTiers.generated'
import { LEGENDARY_SPECIES_IDS } from './legendaries'
import { raizDaLinha } from './huntSpawnOverrides'
import { traitsDaEspecie } from './traits'
import { PESO_DE_REFERENCIA } from './ovos'

export interface LinhaDoCatalogoDeOvos {
  bioma: string
  speciesId: string
  baseId: string
  peso: number
  /** Habilidades normais da forma BASE (a que nasce). */
  traits: string[]
  traitOculta: string | null
}

/**
 * Quem pode aparecer num contrato, por bioma: toda especie dos sub-biomas
 * normais do bioma (sala especial fica fora — ela aparece 5% das vezes), menos
 * as lendarias. O ovo choca a FORMA BASE da linha (pedido do dono).
 */
export function catalogoDeOvos(): LinhaDoCatalogoDeOvos[] {
  const lendarias = new Set(LEGENDARY_SPECIES_IDS)
  const linhas: LinhaDoCatalogoDeOvos[] = []
  for (const bioma of BIOMAS) {
    const vistas = new Set<string>()
    for (const sub of bioma.subBiomas) {
      for (const speciesId of SUB_BIOMA_ESPECIES[sub.chave] ?? []) {
        if (vistas.has(speciesId) || lendarias.has(speciesId) || !SPECIES[speciesId]) continue
        const baseId = raizDaLinha(speciesId)
        if (!SPECIES[baseId] || lendarias.has(baseId)) continue
        vistas.add(speciesId)
        const t = traitsDaEspecie(baseId)
        linhas.push({
          bioma: bioma.chave,
          speciesId,
          baseId,
          peso: SPAWN_WEIGHT_BY_SPECIES[speciesId] ?? PESO_DE_REFERENCIA,
          traits: t?.normais ?? [],
          traitOculta: t?.oculta ?? null,
        })
      }
    }
  }
  return linhas.sort((a, b) => a.bioma.localeCompare(b.bioma) || a.speciesId.localeCompare(b.speciesId))
}

