// Preload de arte: carrega tudo que uma cena vai desenhar ANTES de a cena
// aparecer.
//
// O bug que isto corrige: `render/sprites.ts` carrega cada spritesheet de forma
// lazy, no primeiro frame que precisa dele. Entao o primeiro encontro com cada
// especie desenhava alguns frames de nada (antes, do placeholder geometrico
// colorido — ver o guard em `drawEntity`) enquanto o PNG baixava. Numa hunt com
// 8 especies no pool isso acontecia 8 vezes.
//
// Como funciona: aquece o MESMO `imageCache` que o desenho consulta (via
// `primeImage`), entao quando a cena monta o `img.complete` ja e true e o
// primeiro frame ja sai correto. Nao ha cache proprio aqui de proposito — dois
// caches significariam que o preload baixa uma copia e o desenho baixa outra, e o
// bug continuaria igual.
//
// Este modulo e SO do navegador (usa `Image`). Nao pode ser importado por
// `simulation.ts`/`headless.ts`, que rodam em Node no servidor de autoridade.
import { BATTLE_SPRITE_ANIMS, type AnimName } from './battleSpriteAnims'
import { battleSpriteUrl } from './battleSprites'
import { getMap } from './maps'
import { getEncounter } from './enemies'
import { faceIconUrl, spriteUrl } from './sprites'
import { primeImage } from '@/render/sprites'

// Teto de tempo pra NAO transformar uma rede ruim em "o botao Entrar nao
// funciona". Estourado o prazo, a cena entra do mesmo jeito e o que faltou
// termina de carregar por tras (o guard em `drawEntity` cobre o intervalo).
export const PRELOAD_TIMEOUT_MS = 4000

function comTimeout(promessa: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    void promessa.then(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}

/** Toda URL de spritesheet de batalha que esta especie pode desenhar. */
export function battleSpriteUrlsFor(speciesId: string, isShiny: boolean): string[] {
  const anims = BATTLE_SPRITE_ANIMS[speciesId]
  if (!anims) return []
  // Todas as animacoes que a especie tem, e nao so a atual: 'Faint' e
  // 'Shoot'/'Charge' sao exatamente as que aparecem em momento critico (o POKE
  // morrendo, o primeiro golpe) e seriam as ultimas a serem carregadas de forma
  // lazy.
  return (Object.keys(anims) as AnimName[]).map((name) => battleSpriteUrl(speciesId, name, isShiny))
}

/** Icones de lista/HUD da especie (mochila, loja, equipe, card do POKE ativo). */
export function iconUrlsFor(speciesId: string, isShiny: boolean): string[] {
  return [spriteUrl(speciesId, isShiny), faceIconUrl(speciesId, isShiny)].filter((u): u is string => u != null)
}

export interface EspeciePreload {
  speciesId: string
  isShiny: boolean
}

/** Aquece o cache pras especies dadas. Resolve quando tudo carregou ou no teto. */
export async function preloadEspecies(
  especies: EspeciePreload[],
  { timeoutMs = PRELOAD_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Promise<void> {
  const urls = new Set<string>()
  for (const { speciesId, isShiny } of especies) {
    for (const url of battleSpriteUrlsFor(speciesId, isShiny)) urls.add(url)
    for (const url of iconUrlsFor(speciesId, isShiny)) urls.add(url)
  }
  if (urls.size === 0) return
  await comTimeout(Promise.all([...urls].map(primeImage)), timeoutMs)
}

/**
 * Tudo que a hunt `mapId` vai desenhar: o fundo, o POKE do jogador e TODA especie
 * do pool de encontros — nas duas paletas (normal e shiny), porque um shiny pode
 * nascer no primeiro spawn e a versao shiny e um arquivo diferente.
 */
export async function preloadHunt(mapId: string, jogador: EspeciePreload | null): Promise<void> {
  const mapDef = getMap(mapId)
  if (!mapDef) return

  const especies: EspeciePreload[] = jogador ? [jogador] : []
  for (const encounterId of mapDef.enemyPool) {
    const encounter = getEncounter(encounterId)
    if (!encounter) continue
    especies.push({ speciesId: encounter.speciesId, isShiny: false })
    especies.push({ speciesId: encounter.speciesId, isShiny: true })
  }

  const fundo = mapDef.bg?.image ? [primeImage(mapDef.bg.image)] : []
  await Promise.all([preloadEspecies(especies), ...fundo])
}
