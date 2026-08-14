// Os 4 golpes ativos.
//
// Regra do jogo real: um Pokemon carrega no maximo 4 golpes por vez, mesmo
// conhecendo dezenas. Aqui `unlockedAbilities` continua sendo TUDO que o POKE
// aprendeu (derivavel de especie + nivel) e `activeAbilities` e o subconjunto
// que ele leva pra luta — a unica parte que e ESCOLHA do jogador, e por isso a
// unica que precisa ser gravada (ver a coluna `active_abilities` em
// supabase/migrations/20260814120100).
//
// O golpe de nivel 50 do proprio tipo (typedAoeMoves.ts) fica FORA dos 4 para o
// POKE do jogador — decisao explicita: ele e conteudo deste idle, nao ocupa
// slot. Selvagem nao tem esse golpe de jeito nenhum.
import { getAbility, isDamagingAbility, BASIC_ATTACK } from './abilities'
import { typedAoeMoveKey, TYPED_AOE_MOVES } from './typedAoeMoves'
import type { Species, PokeInstance } from './pokes'

export const MAX_ACTIVE_ABILITIES = 4

// Learnset real do POKE naquele nivel, em ordem de aprendizado e ja sem o AOE
// de nivel 50 (que e injetado em `species.abilities` no fim da lista, com
// levelReq 50 — sem o filtro ele cairia dentro da janela dos "4 ultimos" de
// qualquer POKE nivel 50+).
function learnsetAte(species: Species, level: number): string[] {
  const aoe = typedAoeMoveKey(species.type)
  return species.abilities
    .filter((entry) => entry.levelReq <= level && entry.key !== aoe && getAbility(entry.key) != null)
    // Estavel por levelReq: `species.abilities` ja vem em ordem de nivel do
    // catalogo, mas o AOE anexado no fim quebraria a ordem se nao fosse
    // filtrado acima. Ordenar aqui torna a regra independente disso.
    .map((entry, i) => ({ key: entry.key, levelReq: entry.levelReq, i }))
    .sort((a, b) => a.levelReq - b.levelReq || a.i - b.i)
    .map((entry) => entry.key)
}

// Selvagem: os 4 ultimos golpes aprendidos, sem filtrar categoria. E a regra
// dos jogos, e e o que faz golpe de status puro chegar as maos do inimigo (na
// pratica, quase nunca: medido, so 3% das especies tem um golpe de status puro
// entre os 4 ultimos no nivel 50).
export function activeAbilitiesSelvagem(species: Species, level: number): string[] {
  return learnsetAte(species, level).slice(-MAX_ACTIVE_ABILITIES)
}

// POKE do jogador: mesma janela dos 4 ultimos, mas golpe de DANO tem
// precedencia sobre golpe de status na hora de montar o conjunto INICIAL.
//
// DESVIO CONSCIENTE, e so no default: os 4 ultimos crus podem ser todos de
// status (e, enquanto a Leva B nao entrega os efeitos, golpe de status e
// inerte). Num idle isso vira "meu POKE nao ataca" sem que o jogador tenha
// escolhido nada. A escolha do jogador em si nao tem restricao nenhuma — ele
// pode deixar os 4 slots com golpe de status se quiser.
export function activeAbilitiesPadrao(species: Species, level: number): string[] {
  const learnset = learnsetAte(species, level)
  const dano = learnset.filter((key) => isDamagingAbility(getAbility(key)))
  const status = learnset.filter((key) => !isDamagingAbility(getAbility(key)))
  return [...dano.slice(-MAX_ACTIVE_ABILITIES), ...status.slice(-MAX_ACTIVE_ABILITIES)]
    .slice(0, MAX_ACTIVE_ABILITIES)
}

// Preenche slot VAZIO com golpe recem-aprendido, sem nunca derrubar escolha do
// jogador — o comportamento do jogo real quando ainda ha espaco livre. Com os 4
// slots cheios, o golpe novo so entra se o jogador trocar na tela de Equipes.
export function encaixarNovosGolpes(atuais: string[], novos: string[]): string[] {
  const saida = [...atuais]
  for (const key of novos) {
    if (saida.length >= MAX_ACTIVE_ABILITIES) break
    if (saida.includes(key) || key === BASIC_ATTACK.id) continue
    // O AOE de nivel 50 chega como "golpe novo" no level-up (e de novo numa
    // evolucao que muda o tipo). Ele nunca ocupa slot — sem este filtro, o
    // primeiro slot livre de todo POKE seria comido por ele no nivel 50.
    if (ehGolpeAoeDeNivel50(key)) continue
    if (!getAbility(key)) continue
    saida.push(key)
  }
  return saida
}

export function ehGolpeAoeDeNivel50(key: string): boolean {
  return key in TYPED_AOE_MOVES
}

// O conjunto que o combate pode usar. Ponto unico de leitura: a IA
// (`pickAbility`), o HUD de golpes e a tela de Equipes passam todos por aqui.
//
// `selvagem` nao le `poke.activeAbilities`: inimigo e descartavel e recriado a
// cada spawn, e derivar garante que ele nunca carregue uma escolha antiga de
// quando a especie era do jogador (POKE capturado vira instancia nova).
export function golpesUtilizaveis(poke: PokeInstance, species: Species, selvagem: boolean): string[] {
  if (selvagem) return activeAbilitiesSelvagem(species, poke.level)

  const conhecidos = new Set(poke.unlockedAbilities)
  const escolhidos = (poke.activeAbilities ?? activeAbilitiesPadrao(species, poke.level))
    .filter((key) => conhecidos.has(key))
    .slice(0, MAX_ACTIVE_ABILITIES)

  // O AOE de nivel 50 entra fora dos slots, e so depois de desbloqueado.
  const aoe = typedAoeMoveKey(species.type)
  return conhecidos.has(aoe) ? [...escolhidos, aoe] : escolhidos
}
