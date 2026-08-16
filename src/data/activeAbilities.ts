// Os 4 golpes ativos.
//
// Regra do jogo real: um Pokemon carrega no maximo 4 golpes por vez, mesmo
// conhecendo dezenas. Aqui `unlockedAbilities` continua sendo TUDO que o POKE
// aprendeu (derivavel de especie + nivel) e `activeAbilities` e o subconjunto
// que ele leva pra luta — a unica parte que e ESCOLHA do jogador, e por isso a
// unica que precisa ser gravada (ver a coluna `active_abilities` em
// supabase/migrations/20260814120100).
//
// O golpe de nivel 50 do proprio tipo (typedAoeMoves.ts) e o Ataque Basico
// (abilities.ts) NAO tem tratamento especial pro POKE do jogador — pedido
// explicito do usuario revertendo uma decisao anterior: "o ataque basico e a
// explosao elemental nao sao diferentes... podem ser retirados como qualquer
// outro golpe". Os dois competem pelos mesmos 4 slots, escolhiveis/removiveis
// como qualquer golpe aprendido. Selvagem continua sem os dois (ver
// `activeAbilitiesSelvagem`) — fora do escopo do pedido, que era sobre a
// escolha do treinador.
import { getAbility, isDamagingAbility, BASIC_ATTACK, type Ability } from './abilities'
import { typedAoeMoveKey, TYPED_AOE_MOVES } from './typedAoeMoves'
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from './generated/formulas.generated'
import type { Species, PokeInstance } from './pokes'

export const MAX_ACTIVE_ABILITIES = 4

const STAB_MULTIPLIER = createFormulaEngine(FORMULAS).eval('STAB_MULTIPLIER')

/**
 * O nivel em que o POKE passa a poder usar cada golpe.
 *
 * Historico: o catalogo Ultra Sun (fonte PokeAPI) trazia, ate a migracao
 * `1dd5302`, o bloco de golpes do Recordador de Golpes junto com o learnset de
 * nivel de cada especie evoluida (Typhlosion aparecia com Eruption, 150 de
 * poder, ja no nivel 1). Aquela migracao corrigiu o SINTOMA aqui, em runtime,
 * sem tocar o catalogo. Decisao de jogo seguinte: um POKE so aprende golpe que
 * tem nivel real na SUA propria especie — sem atalho de Recordador — e essa
 * regra foi pra fonte (`scripts/lib/pokeapi.js#removerGolpesDeRecordador`,
 * `npm run usum:baixar`). O catalogo gerado ja sai com no maximo UM nivel por
 * golpe por especie; esta funcao fica so como porta unica, sem ambiguidade pra
 * resolver.
 */
const cache = new Map<string, Map<string, number>>()

function nivelExigido(species: Species): Map<string, number> {
  const pronto = cache.get(species.id)
  if (pronto) return pronto

  const saida = new Map<string, number>()
  for (const entry of species.abilities) saida.set(entry.key, entry.levelReq)

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

// Learnset real do POKE naquele nivel, em ordem de aprendizado. Inclui o AOE
// de nivel 50 quando desbloqueado — pedido explicito do usuario: "ataque
// basico e a explosao elemental nao sao diferentes... podem ser retirados
// como qualquer outro golpe" — os dois competem pelos mesmos 4 slots, nao tem
// mais um "de graca" fora do cap.
function learnsetAte(species: Species, level: number): string[] {
  return golpesAprendidosAte(species, level)
}

// Selvagem: os 4 ultimos golpes aprendidos, sem filtrar categoria. E a regra
// dos jogos, e e o que faz golpe de status puro chegar as maos do inimigo (na
// pratica, quase nunca: medido, so 3% das especies tem um golpe de status puro
// entre os 4 ultimos no nivel 50).
//
// Exclui o AOE de nivel 50 aqui (so aqui): selvagem nunca "escolhe" golpe —
// deixar o AOE entrar na janela dos "4 ultimos" faria todo encontro nivel 50+
// da MESMA especie repetir o mesmo golpe forte, empurrando pra fora o que
// varia por individuo. Fora do escopo do pedido do usuario (era sobre a
// escolha do TREINADOR); poke do jogador continua livre pra escolher o AOE.
export function activeAbilitiesSelvagem(species: Species, level: number): string[] {
  const aoe = typedAoeMoveKey(species.type)
  return learnsetAte(species, level)
    .filter((key) => key !== aoe)
    .slice(-MAX_ACTIVE_ABILITIES)
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
  // Ataque Basico entra no pool de candidatos: e ele quem garante que um POKE
  // sem golpe de dano ainda (Hoppip nivel 1-9) receba pelo menos um default
  // que causa dano de verdade — o proprio motivo dele existir, so que agora
  // via selecao normal, nao mais via append escondido.
  const learnset = [...learnsetAte(species, level), BASIC_ATTACK.id]
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
    // Ataque Basico nunca chega aqui como "golpe novo" — ele nao vem do
    // aprendizado por nivel, e sempre disponivel desde o inicio.
    if (saida.includes(key) || key === BASIC_ATTACK.id) continue
    // O AOE de nivel 50 agora e um golpe normal (pedido do usuario): se
    // sobrar slot vazio quando ele desbloqueia, preenche como qualquer outro
    // golpe recem-aprendido.
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

  // Ataque Basico nunca esteve em `species.abilities`/`unlockedAbilities` —
  // e um fallback hand-authored (ver abilities.ts), nao golpe aprendido por
  // nivel. Precisa entrar aqui pra ser candidato valido nos mesmos 4 slots.
  const conhecidos = new Set([...poke.unlockedAbilities, BASIC_ATTACK.id])
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

  return escolhidos
}
