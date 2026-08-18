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
import { todasAsTirasDeVfx } from './vfxTiras'
import { todosOsIconesDeHabilidade } from './abilityIcons'
import { todosOsVfxDeStatus } from './statusVfx'
import { primeImage } from '@/render/sprites'
import { CENA_HOSPITAL } from './hospital'

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

/**
 * Arte do Centro Pokemon. Vale o preload proprio porque o Hospital e a
 * PRIMEIRA cena de toda sessao (e a unica de quem so abriu o jogo): sem isto,
 * o saguao aparece como um retangulo escuro por alguns frames enquanto o JPEG
 * de 600kB decodifica. Chamado no boot, nao ao entrar em cena — quando o
 * jogador volta da hunt a imagem ja tem que estar quente.
 */
export function preloadHospital(): Promise<void> {
  return primeImage(CENA_HOSPITAL.imagem)
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
  // Arte de efeito de golpe (18 tipos, 1 tira cada — ver data/vfxTiras.ts),
  // faisca de cura, simbolos de sono/confusao e icone de slot. Todos de uma
  // vez em vez de derivar quais tipos esta hunt pode usar: o proprio POKE do
  // jogador muda de golpe ao subir de nivel e ao evoluir, e "quais tipos vao
  // aparecer" nao e uma pergunta que da pra responder na entrada da hunt.
  //
  // As tiras somam ~1 MB (PNG-8; eram 4,5 MB em RGBA). E o item mais pesado
  // deste preload, e o teto de PRELOAD_TIMEOUT_MS existe justamente pra rede
  // ruim nao transformar isso em "o botao Entrar nao funciona".
  // Arte por GOLPE nao entra aqui de proposito (ver o cabecalho de
  // data/moveVfx.ts): sao 23 tiras hoje, e um jogador ve os golpes que o
  // time dele sabe — meia duzia. Aquecer arquivo que a sessao nao vai usar
  // troca boot rapido por nada; o primeiro uso de cada golpe cai no
  // procedural por alguns frames enquanto a tira baixa, que e exatamente o
  // que o fallback existe pra fazer.
  const efeitos = [...todasAsTirasDeVfx(), ...todosOsIconesDeHabilidade(), ...todosOsVfxDeStatus()].map(primeImage)
  await Promise.all([preloadEspecies(especies), ...fundo, ...efeitos])
}
