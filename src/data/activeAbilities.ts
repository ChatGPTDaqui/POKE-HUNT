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
import { getAbility, isDamagingAbility, BASIC_ATTACK, type Ability } from './abilities'
import { typedAoeMoveKey, TYPED_AOE_MOVES } from './typedAoeMoves'
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from './generated/formulas.generated'
// Direto do dado gerado, e nao de `./pokes`: `pokes.ts` importa ESTE modulo, e
// puxar um valor de la fecharia um ciclo em tempo de execucao. Os `type` acima
// nao contam — sao apagados na compilacao.
import { SPECIES_DATA } from './generated/pokes.generated'
import type { Species, PokeInstance } from './pokes'

export const MAX_ACTIVE_ABILITIES = 4

const STAB_MULTIPLIER = createFormulaEngine(FORMULAS).eval('STAB_MULTIPLIER')

/**
 * De qual especie cada uma evolui, e em que nivel.
 *
 * O dado gerado so aponta pra frente (`evolvesTo`), entao o caminho de volta e
 * montado uma vez aqui. `min` entre varios pais: uma especie alcancavel por
 * mais de um caminho existe a partir do MAIS CEDO deles.
 */
const paiDe = new Map<string, { id: string; nivel: number }>()
for (const especie of Object.values(SPECIES_DATA)) {
  if (!especie.evolvesTo || !especie.evolvesAtLevel) continue
  const atual = paiDe.get(especie.evolvesTo)
  if (!atual || especie.evolvesAtLevel < atual.nivel) {
    paiDe.set(especie.evolvesTo, { id: especie.id, nivel: especie.evolvesAtLevel })
  }
}

/**
 * O nivel em que o POKE REALMENTE passa a poder usar cada golpe.
 *
 * O CASO QUE ISTO CONSERTA (relatado como "Typhlosion tem golpe forte demais no
 * nivel 1"): no Ultra Sun, o learnset de uma especie evoluida traz um bloco de
 * nivel 1 com os golpes REMEMORAVEIS — inclusive os de fim de lista. Typhlosion
 * aparece com Eruption (150 de poder) e Double-Edge (120) no nivel 1, e isso
 * esta certo no jogo original: conferido contra a Bulbapedia, 251 de 251
 * especies batem (`npm run usum:learnsets`). O bloco existe pro Recordador de
 * Golpes, nao pra descrever o que um POKE daquele nivel sabe.
 *
 * Sao 108 das 251 especies com esse bloco, e 38 delas ofereciam um golpe de
 * poder >= 100 ja no nivel 1 — Forretress chegava a Explosion, com 200.
 *
 * COMO O JOGADOR CHEGAVA NESSE ESTADO: capturar reseta o POKE pro nivel 1
 * (CAPTURE_LEVEL, captureSystem.ts). Capturava-se um Typhlosion selvagem de
 * nivel 40 e ele voltava nivel 1 — com o bloco de rememoraveis inteiro na mao.
 *
 * Tres regras, nesta ordem:
 *
 *  1. o golpe que aparece no nivel 1 E TAMBEM num nivel maior vale pelo nivel
 *     maior. Eruption e 82, nao 1. Resolve 25 das 38;
 *  2. o que aparece SO no nivel 1 vale pelo nivel em que a LINHA EVOLUTIVA o
 *     aprende. Tackle e Ember estao no nivel 1 do Typhlosion porque Cyndaquil
 *     os aprende cedo — entao continuam cedo, e um Typhlosion recem-capturado
 *     nao fica sem golpe nenhum;
 *  3. o que nem a linha aprende por nivel e rememoravel puro: vale pelo nivel
 *     da evolucao, que e o mais cedo em que aquele POKE pode existir. Venusaur
 *     com Double-Edge passa a exigir 32 — e no jogo original um Venusaur de
 *     nivel 32 rememora Double-Edge mesmo, entao nao ha restricao inventada.
 *
 * O CATALOGO NAO E TOCADO de proposito: ele descreve o Ultra Sun e agora ha um
 * verificador provando isso (`npm run usum:learnsets`). Esta e uma regra do
 * jogo aplicada em cima do dado fiel, no unico ponto por onde combate, HUD e
 * tela de Equipes ja passam.
 */
const cache = new Map<string, Map<string, number>>()

function nivelExigido(species: Species): Map<string, number> {
  const pronto = cache.get(species.id)
  if (pronto) return pronto

  const porGolpe = new Map<string, number[]>()
  for (const entry of species.abilities) {
    const niveis = porGolpe.get(entry.key)
    if (niveis) niveis.push(entry.levelReq)
    else porGolpe.set(entry.key, [entry.levelReq])
  }

  const pai = paiDe.get(species.id)
  // Recursao ate a raiz da linha. Sem risco de laco: `evolvesAtLevel` e sempre
  // pra frente e o dex 1-251 nao tem ciclo — e o `cache` corta o caminho ja
  // percorrido de qualquer forma.
  const doPai = pai && SPECIES_DATA[pai.id] ? nivelExigido(SPECIES_DATA[pai.id] as Species) : null

  const saida = new Map<string, number>()
  for (const [key, niveis] of porGolpe) {
    const acimaDeUm = niveis.filter((n) => n > 1)
    if (acimaDeUm.length) { saida.set(key, Math.min(...acimaDeUm)); continue }
    const naLinha = doPai?.get(key)
    saida.set(key, naLinha ?? (pai ? pai.nivel : 1))
  }

  cache.set(species.id, saida)
  return saida
}

/**
 * TUDO que a especie ja aprendeu neste nivel, em ordem de aprendizado.
 *
 * Porta unica: e daqui que sai `unlockedAbilities` em toda parte (criacao de
 * POKE, captura, level-up, carga do servidor). Antes, cada um desses pontos
 * filtrava `entry.levelReq <= level` na mao — cinco copias da mesma regra, e a
 * correcao de nivel acima teria valido so pra escolha automatica dos 4 golpes,
 * deixando a tela de Equipes oferecer Eruption pra um POKE de nivel 1.
 *
 * Inclui o AOE de nivel 50: quem so quer os golpes de slot usa `learnsetAte`.
 */
export function golpesAprendidosAte(species: Species, level: number): string[] {
  return [...nivelExigido(species)]
    .filter(([key, nivel]) => nivel <= level && getAbility(key) != null)
    // Ordem estavel por nivel exigido. `species.abilities` ja vem em ordem de
    // nivel do catalogo, mas o AOE anexado no fim e a reescrita de nivel acima
    // quebrariam essa ordem se ela nao fosse refeita aqui.
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([key]) => key)
}

/** O nivel em que a especie aprende cada golpe, ja com a regra de nivel 1. */
export function nivelDeAprendizado(species: Species): Map<string, number> {
  return nivelExigido(species)
}

// Learnset real do POKE naquele nivel, em ordem de aprendizado e ja sem o AOE
// de nivel 50 (que e injetado em `species.abilities` no fim da lista, com
// levelReq 50 — sem o filtro ele cairia dentro da janela dos "4 ultimos" de
// qualquer POKE nivel 50+).
function learnsetAte(species: Species, level: number): string[] {
  const aoe = typedAoeMoveKey(species.type)
  return golpesAprendidosAte(species, level).filter((key) => key !== aoe)
}

// Selvagem: os 4 ultimos golpes aprendidos, sem filtrar categoria. E a regra
// dos jogos, e e o que faz golpe de status puro chegar as maos do inimigo (na
// pratica, quase nunca: medido, so 3% das especies tem um golpe de status puro
// entre os 4 ultimos no nivel 50).
export function activeAbilitiesSelvagem(species: Species, level: number): string[] {
  return learnsetAte(species, level).slice(-MAX_ACTIVE_ABILITIES)
}

// POKE do jogador: os 4 golpes de MAIOR DANO, com o bonus de tipo (STAB) ja
// contado. Golpe de status so entra pra completar slot que sobrou.
//
// POR QUE NAO E "os 4 ultimos aprendidos" (a regra que vale pro selvagem):
// medido, e a diferenca e brutal. Com "os 4 ultimos", uma caçada limitada por
// dano (Dojo Nv45) caiu de 1.785 para 905 kills/hora — metade. Com os 4 mais
// fortes, ficou em 1.772: o limite de 4 golpes passa a nao custar
// praticamente nada.
//
// A causa e simples quando se olha o learnset real: os ultimos golpes que uma
// especie aprende NAO sao os mais fortes. Sao os situacionais. Charizard
// aprende Flamethrower muito antes do fim da lista, e "os 4 ultimos" deixavam
// o golpe forte de fora — o POKE atacava com o que sobrou.
//
// O peso de STAB entra porque sem ele o criterio escolhe golpe NORMAL de poder
// alto no lugar do golpe do proprio tipo, que causa mais dano na pratica.
// Medido de novo: com STAB, 1.589/1.772/1.307 kills-hora nas tres caçadas de
// referencia, contra 1.518/1.776/1.287 sem.
//
// Isto e o DEFAULT, nao uma regra: a escolha do jogador nao tem restricao
// nenhuma — ele pode deixar os 4 slots com golpe de status se quiser.
export function activeAbilitiesPadrao(species: Species, level: number): string[] {
  const learnset = learnsetAte(species, level)
  const dano = learnset
    .map((key, i) => ({ key, i, ability: getAbility(key)! }))
    .filter((r) => isDamagingAbility(r.ability))
    // Empate resolvido pelo golpe aprendido MAIS TARDE (`b.i - a.i`): entre dois
    // golpes de mesmo dano efetivo, o mais recente costuma ser a versao melhor
    // do mesmo golpe.
    .sort((a, b) => danoEfetivo(b.ability, species) - danoEfetivo(a.ability, species) || b.i - a.i)
    .slice(0, MAX_ACTIVE_ABILITIES)
    .map((r) => r.key)

  if (dano.length >= MAX_ACTIVE_ABILITIES) return dano

  // Sobrou slot: completa com golpe de status, do mais recente pro mais antigo.
  // Enquanto a Leva B nao entrega os efeitos eles sao inertes, mas ocupar o
  // slot com eles nao tira nada de ninguem — nao ha golpe de dano restante.
  const status = learnset.filter((key) => !isDamagingAbility(getAbility(key))).reverse()
  return [...dano, ...status].slice(0, MAX_ACTIVE_ABILITIES)
}

// Poder base ponderado pelo bonus de tipo. Nao e o dano real (falta o alvo,
// que so existe em combate) — e o suficiente pra ordenar golpes do MESMO POKE
// entre si, que e tudo que este default precisa.
function danoEfetivo(ability: Ability, species: Species): number {
  const temStab = ability.type === species.type || ability.type === species.type2
  return ability.power * (temStab ? STAB_MULTIPLIER : 1)
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
  const escolha = poke.activeAbilities ?? activeAbilitiesPadrao(species, poke.level)
  const escolhidos = escolha.filter((key) => conhecidos.has(key)).slice(0, MAX_ACTIVE_ABILITIES)

  // RECOMPOE O SLOT QUE O FILTRO ESVAZIOU.
  //
  // O filtro acima existe pra escolha que aponta pra golpe que o POKE nao sabe
  // mais — golpe renomeado pela migracao do Ultra Sun, ou especie trocada por
  // evolucao. Sozinho ele so TIRA, e ai a escolha do jogador encolhe em
  // silencio: o POKE fica com 2 golpes, ou com nenhum, e luta de Ataque Basico
  // sem nada na tela dizendo por que.
  //
  // Deixou de ser hipotetico com a correcao do bloco de golpes rememoraveis do
  // nivel 1 (ver `nivelExigido`). Medido contra o banco de producao ANTES de
  // publicar: dos 7.184 POKEs salvos com golpes escolhidos, 3.188 perdiam ao
  // menos um e 714 ficavam com ZERO. A regra nova esta certa, mas aplica-la
  // tirando golpe de quem ja jogava seria trocar um bug por outro pior.
  //
  // Escolha VAZIA de proposito continua vazia: `[]` e a opcao valida de lutar so
  // com o Ataque Basico, e nao pode ser "consertada" pra 4 golpes.
  if (escolha.length > 0 && escolhidos.length < Math.min(escolha.length, MAX_ACTIVE_ABILITIES)) {
    for (const key of activeAbilitiesPadrao(species, poke.level)) {
      if (escolhidos.length >= MAX_ACTIVE_ABILITIES) break
      if (!escolhidos.includes(key) && conhecidos.has(key)) escolhidos.push(key)
    }
  }

  // O AOE de nivel 50 entra fora dos slots, e so depois de desbloqueado.
  const aoe = typedAoeMoveKey(species.type)
  return conhecidos.has(aoe) ? [...escolhidos, aoe] : escolhidos
}
