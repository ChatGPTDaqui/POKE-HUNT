// Os 4 golpes ativos.
//
// Regra do jogo real: um Pokemon carrega no maximo 4 golpes por vez, mesmo
// conhecendo dezenas. Aqui `unlockedAbilities` continua sendo TUDO que o POKE
// aprendeu (derivavel de especie + nivel) e `activeAbilities` e o subconjunto
// que ele leva pra luta — a unica parte que e ESCOLHA do jogador, e por isso a
// unica que precisa ser gravada (ver a coluna `active_abilities` em
// supabase/migrations/20260814120100).
//
// ---------------------------------------------------------------------------
// 4 E 4: ATAQUE BASICO E EXPLOSAO ELEMENTAL OCUPAM SLOT (2026-08-18)
// ---------------------------------------------------------------------------
// Ate esta leva os dois viviam FORA dos 4: o Ataque Basico era injetado como
// primeira posicao fixa da fila (combatSystem#pickAbility) e a Explosao
// Elemental de nivel 50 (typedAoeMoves.ts) era anexada depois dos escolhidos.
// Na pratica o POKE do jogador lutava com SEIS golpes, e a tela dizia "4/4".
// Os dois eram liga/desliga em `disabledAbilities`, nao escolha de slot.
//
// Pedido explicito do usuario: o maximo e 4, ponto, e os dois sao golpes
// comuns que disputam slot com o resto do moveset. Consequencias que vieram
// junto, todas deliberadas:
//
//  - Nao ha mais rede de seguranca escondida. Um POKE que nao escolher o
//    Ataque Basico e ficar com os 4 slots em cooldown simplesmente espera. O
//    fallback continua existindo pro SELVAGEM (e o Struggle dele, ver
//    combatSystem#tentarAtaqueBasico), nunca pro jogador.
//  - `activeAbilitiesPadrao` passa a completar slot vago com o Ataque Basico,
//    justamente pra um POKE de learnset curto (nivel baixo, Igglybuff,
//    Togepi) nao nascer com slot vazio e lutando menos do que antes.
//  - A RPC `definir_golpes_ativos` recusava as duas chaves com "esse golpe nao
//    ocupa slot"; liberado na migration 20260818120000.
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
  const escolha = [...dano, ...status].slice(0, MAX_ACTIVE_ABILITIES)

  // AINDA sobrou slot: entra o Ataque Basico. Desde que ele passou a ocupar
  // slot (ver o topo do arquivo) ele deixou de ser gratuito, e um POKE de
  // learnset curto — nivel baixo, ou Igglybuff/Togepi/Unown, que tem 1 ou 2
  // golpes de dano no moveset inteiro — nasceria com slot VAZIO e atacando
  // menos do que atacava antes desta leva. Preenchendo aqui, o default
  // continua sendo a melhor jogada possivel; o jogador tira se quiser.
  while (escolha.length < MAX_ACTIVE_ABILITIES && !escolha.includes(BASIC_ATTACK.id)) {
    escolha.push(BASIC_ATTACK.id)
  }
  return escolha
}

// Poder base ponderado pelo bonus de tipo, pela PRECISAO e pelo RECUO. Nao e o
// dano real (falta o alvo, que so existe em combate) — e o suficiente pra
// ordenar golpes do MESMO POKE entre si, que e tudo que este default precisa.
//
// POR QUE PRECISAO E RECUO ENTRAM AQUI: sem eles, este default escolhia golpe
// que a propria IA de combate ja sabia ser pior. `combatSystem#danoEsperado` ja
// desconta precisao ha levas ("so essa troca vale 15% das kills/hora"), mas
// quem MONTA os 4 slots ranqueava por poder cru — entao o golpe bom nem chegava
// a ser candidato. Caso medido: Typhlosion Nv70 nascia com Inferno (100 de
// poder, 50% de precisao, cooldown 8s) e Double-Edge (120 de poder, -33% de
// recuo, sem STAB) ocupando dois dos quatro slots, na frente de Lava Plume
// (80 de poder, STAB, 100% de precisao). Resultado em duelo contra Kangaskhan
// de mesmo nivel: metade dos turnos jogada fora errando e o proprio POKE se
// machucando ate morrer antes de derrubar o alvo.
//
// O recuo entra como desconto proporcional (`drainPercent` negativo, a mesma
// fonte que `combatSystem#resolveHit` usa pra aplicar o dano em quem usou):
// Double-Edge vale 67% do que valeria sem recuo. Dreno POSITIVO (Absorb, Giga
// Drain) NAO ganha bonus — curar nao e dano, e inflar a nota faria golpe fraco
// de dreno passar na frente de golpe forte.
function danoEfetivo(ability: Ability, species: Species): number {
  const temStab = ability.type === species.type || ability.type === species.type2
  const precisao = (ability.accuracy ?? 100) / 100
  const recuo = Math.max(0, -(ability.drainPercent ?? 0)) / 100
  return ability.power * (temStab ? STAB_MULTIPLIER : 1) * precisao * (1 - recuo)
}

// Preenche slot VAZIO com golpe recem-aprendido, sem nunca derrubar escolha do
// jogador — o comportamento do jogo real quando ainda ha espaco livre. Com os 4
// slots cheios, o golpe novo so entra se o jogador trocar na tela de Equipes.
export function encaixarNovosGolpes(atuais: string[], novos: string[]): string[] {
  const saida = [...atuais]
  for (const key of novos) {
    if (saida.length >= MAX_ACTIVE_ABILITIES) break
    // A Explosao Elemental chega aqui como "golpe novo" no nivel 50 (e de novo
    // numa evolucao que muda o tipo) e desde 2026-08-18 ela ocupa slot como
    // qualquer outro golpe — entao pode preencher slot VAGO, mas continua sem
    // poder derrubar escolha nenhuma, que e a regra desta funcao inteira.
    //
    // O Ataque Basico fica de fora: ele nao e "aprendido" em nivel nenhum,
    // entao nunca chega como novidade — quem o coloca e o default
    // (`activeAbilitiesPadrao`) ou o proprio jogador.
    if (saida.includes(key) || key === BASIC_ATTACK.id) continue
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

  // O Ataque Basico nunca esta em `unlockedAbilities` — ele nao e aprendido em
  // nivel nenhum, todo POKE simplesmente tem. Sem entrar aqui, o filtro logo
  // abaixo o descartaria da escolha do jogador e ele nunca chegaria ao combate.
  const conhecidos = new Set([...poke.unlockedAbilities, BASIC_ATTACK.id])
  const escolha = poke.activeAbilities ?? activeAbilitiesPadrao(species, poke.level)
  // `escolha` pode ter golpe repetido (dado salvo antes da validacao existir —
  // ver `pokemon_instances.active_abilities` em producao). Duplicata aqui vira
  // `key` React duplicada em toda UI que mapeia por `ability.id`
  // (`AbilityHud`), e key duplicada corrompe a reconciliacao: o node extra fica
  // orfao e sobrevive a troca de POKE seguinte mostrando o golpe antigo.
  const escolhidos = [...new Set(escolha.filter((key) => conhecidos.has(key)))].slice(0, MAX_ACTIVE_ABILITIES)

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

  // NAO ha mais anexo depois dos slots. A Explosao Elemental costumava entrar
  // aqui, fora da conta dos 4 — desde 2026-08-18 ela e um golpe comum e so
  // luta se estiver entre os escolhidos (ver o topo do arquivo).
  return escolhidos
}
