// Regras de status, como funcoes puras sobre STATUS_RULES (gerado de
// scripts/usum/status.json, Gen VII, conferido na Bulbapedia).
//
// TUDO AQUI E PURO E SEM ESTADO. Quem guarda status e aplica efeito e o
// motor (engine/systems/statusSystem.ts); este arquivo so responde perguntas
// — "esse POKE pode ser envenenado?", "quanto de dano por turno?", "quantos
// turnos dura?". Separado porque a tela tambem precisa das mesmas respostas
// (icone, tooltip) e nao pode depender do motor.
//
// O TURNO DESTE JOGO. Nos jogos originais um turno e uma rodada da batalha.
// Aqui o combate e continuo, entao "turno" e TURNO_SEGUNDOS (3s desde a
// PH-376; leia a constante, nao o numero neste comentario) — o mesmo
// intervalo minimo entre duas acoes de um POKE. Um veneno que tira 1/8 por
// turno tira 1/8 a cada 2 segundos.
import { STATUS_RULES } from './generated/status.generated'
import { TURNO_SEGUNDOS } from './abilities'
import type { ElementType, StatusCondition, StatusRule } from './generated/types'
import type { Rng } from '@/core/rng'
import { nextFloat } from '@/core/rng'

export type { StatusCondition }

// Guardado no PokeInstance (nao-volatil) ou na entidade (volatil).
// `turnosRestantes: null` = nao passa sozinho — so item ou Centro Pokemon.
export interface StatusAtivo {
  tipo: StatusCondition
  turnosRestantes: number | null
}

export const STATUS_NAO_VOLATEIS = Object.keys(STATUS_RULES.naoVolateis) as StatusCondition[]
export const STATUS_VOLATEIS = Object.keys(STATUS_RULES.volateis) as StatusCondition[]

export const TURNOS_DE_IMUNIDADE_APOS_CURA = STATUS_RULES.reaplicacao.turnosDeImunidade
export const SEGUNDOS_DE_IMUNIDADE_APOS_CURA = TURNOS_DE_IMUNIDADE_APOS_CURA * TURNO_SEGUNDOS

export function regraDoStatus(tipo: StatusCondition): StatusRule | null {
  return STATUS_RULES.naoVolateis[tipo] ?? STATUS_RULES.volateis[tipo] ?? null
}

export function ehVolatil(tipo: StatusCondition): boolean {
  return tipo in STATUS_RULES.volateis
}

export function nomeDoStatus(tipo: StatusCondition): string {
  return STATUS_RULES.nomes[tipo] ?? tipo
}

const GOLPES_DE_PO = new Set(STATUS_RULES.golpesDePo.golpes)

/**
 * O POKE alvo pode receber este status?
 *
 * Cobre as tres recusas do jogo real:
 *   1. imunidade por TIPO (Fogo nao queima, Eletrico nao paralisa, ...)
 *   2. imunidade a golpe de PO — GRASS ignora Spore/Stun Spore/Sleep Powder
 *      (Gen VI em diante). Depende do GOLPE, nao do status, por isso
 *      `abilityId` entra aqui.
 *   3. ja ter um status nao-volatil. Nos jogos so cabe um por vez: um POKE
 *      dormindo nao pode ser envenenado por cima.
 */
export function podeReceberStatus(
  tipo: StatusCondition,
  alvo: { tipo1: ElementType; tipo2: ElementType | null; statusAtual: StatusCondition | null },
  abilityId?: string,
): boolean {
  const regra = regraDoStatus(tipo)
  if (!regra) return false

  if (regra.imunidadesPorTipo.includes(alvo.tipo1)) return false
  if (alvo.tipo2 && regra.imunidadesPorTipo.includes(alvo.tipo2)) return false

  if (abilityId && GOLPES_DE_PO.has(abilityId)) {
    const imunes = STATUS_RULES.golpesDePo.imunesPorTipo
    if (imunes.includes(alvo.tipo1) || (alvo.tipo2 && imunes.includes(alvo.tipo2))) return false
  }

  // So vale pros nao-volateis: confusao convive com veneno, como nos jogos.
  if (!ehVolatil(tipo) && alvo.statusAtual != null) return false

  return true
}

// Sorteia a duracao inicial. `null` = permanente (veneno, queimadura,
// paralisia, congelamento — os que so saem por item ou pelo Centro Pokemon).
export function sortearDuracao(rng: Rng, tipo: StatusCondition): number | null {
  const regra = regraDoStatus(tipo)
  if (!regra || !regra.duracaoEmTurnos) return null
  const [min, max] = regra.duracaoEmTurnos
  return min + Math.floor(nextFloat(rng) * (max - min + 1))
}

// Dano de fim de turno (veneno/queimadura), em HP. Piso de 1: 1/16 de um POKE
// de 10 de HP arredondaria pra zero e a queimadura nao faria nada em nivel
// baixo.
export function danoPorTurno(tipo: StatusCondition, hpMaximo: number): number {
  const fracao = regraDoStatus(tipo)?.danoPorTurnoFracaoDoMaximo
  if (!fracao) return 0
  return Math.max(1, Math.floor(hpMaximo * fracao))
}

export function multiplicadorDeVelocidade(tipo: StatusCondition | null): number {
  if (!tipo) return 1
  return regraDoStatus(tipo)?.multiplicadorDeVelocidade ?? 1
}

export function multiplicadorDeDanoFisico(tipo: StatusCondition | null): number {
  if (!tipo) return 1
  return regraDoStatus(tipo)?.multiplicadorDeDanoFisico ?? 1
}

// Congelamento e sono impedem a acao sempre; paralisia impede em 25% dos
// turnos. Um so ponto de decisao pra os tres, porque quem chama so quer saber
// "esse POKE age agora?".
export function perdeOTurno(rng: Rng, status: StatusAtivo | null): boolean {
  if (!status) return false
  const regra = regraDoStatus(status.tipo)
  if (!regra) return false
  if (regra.bloqueiaAcao) return true
  if (regra.chanceDePerderOTurno) return nextFloat(rng) < regra.chanceDePerderOTurno
  return false
}

/**
 * A metade DETERMINISTICA de `perdeOTurno`: este status impede a acao SEMPRE
 * (sono e congelamento), sem sortear nada.
 *
 * Existe separada porque `perdeOTurno` consome `rng`, e quem so quer OBSERVAR
 * "este POKE esta impedido de agir agora" nao pode mexer na sequencia de
 * sorteio — mexer ali muda o resultado da propria luta que se esta observando.
 * A paralisia, que perde o turno por sorteio, fica de fora de proposito: ela
 * atrasa a acao, nao impede.
 *
 * PH-305: o cao de guarda do protetor (simulation.ts) usa isto pra nao contar
 * como impasse o tempo em que o POKE simplesmente nao consegue atacar.
 */
export function bloqueiaAcaoSempre(status: StatusAtivo | null): boolean {
  if (!status) return false
  return regraDoStatus(status.tipo)?.bloqueiaAcao === true
}

// Status que TRAVAM o POKE no lugar (movementSystem nao move quem esta com um
// deles). Escrito a mao aqui, e nao derivado de STATUS_RULES, porque nao tem
// equivalente nos jogos: la a batalha e por turnos e ninguem "anda". E uma
// regra deste jogo, que tem mundo continuo.
//
// Sao exatamente os dois que ja tem `bloqueiaAcao` — quem nao pode agir
// tambem nao sai do lugar. E os dois ACABAM SOZINHOS, o que e o que torna a
// regra segura: sono dura 2-4 turnos, e congelamento tem 20% de chance de
// descongelar por turno (~5 turnos em media) alem de derreter na hora com
// qualquer golpe de FOGO que cause dano.
//
// PARALISIA FICA DE FORA, por decisao do usuario depois de ver o numero: ela
// e PERMANENTE aqui (`duracaoEmTurnos: null`, so item ou Centro curam) e o
// raio de aggro do selvagem (175px) e menor que a distancia minima de spawn
// (250px). Um jogador paralisado que nao anda nunca mais encontraria inimigo
// — a hunt travava ate alguem curar. Paralisia continua so cortando
// velocidade pela metade e fazendo perder 25% dos turnos, como nos jogos.
const STATUS_QUE_IMOBILIZAM = new Set<StatusCondition>(['sleep', 'freeze'])

export function imobiliza(tipo: StatusCondition | null | undefined): boolean {
  return tipo != null && STATUS_QUE_IMOBILIZAM.has(tipo)
}

export function chanceDeSeAtacar(tipo: StatusCondition): number {
  return regraDoStatus(tipo)?.chanceDeSeAtacar ?? 0
}

export function poderDoAutoDano(tipo: StatusCondition): number {
  return regraDoStatus(tipo)?.poderDoAutoDano ?? 0
}

// Golpe de FIRE que causa dano descongela o alvo, como nos jogos. Vale so pro
// congelamento, e por isso a pergunta e feita pelo tipo do golpe, nao pelo
// status.
export function descongelaCom(tipo: StatusCondition, tipoDoGolpe: ElementType, poderDoGolpe: number): boolean {
  const regra = regraDoStatus(tipo)
  return Boolean(regra?.descongelaComTipo && regra.descongelaComTipo === tipoDoGolpe && poderDoGolpe > 0)
}

export function chanceDeDescongelar(tipo: StatusCondition): number {
  return regraDoStatus(tipo)?.chanceDeDescongelarPorTurno ?? 0
}

// --- Estagios de atributo ("power ups") -------------------------------------
//
// Danca das Espadas, Rosnado, Aro de Ferro e outros 87 golpes mexem em ESTAGIO,
// nao na stat. A stat da ficha nunca muda; o que muda e um multiplicador
// temporario, que some quando o POKE sai de campo — igual a confusao, e pelo
// mesmo motivo (nos jogos, sai da batalha, zera).
export const ESTAGIO_MINIMO = -6
export const ESTAGIO_MAXIMO = 6

export type StatDeEstagio = 'atkFis' | 'atkEsp' | 'def' | 'defEsp' | 'speed' | 'accuracy' | 'evasion'
export type EstagiosDeStat = Partial<Record<StatDeEstagio, number>>

/**
 * Quanto tempo um estagio de atributo dura, em segundos (PH-418).
 *
 * SEIS TURNOS. Derivado de `TURNO_SEGUNDOS` e nunca escrito como `18`: o turno
 * deste motor e tempo puro (`statusSystem#tickStatus` decrementa por `dt` e
 * recarrega `TURNO_SEGUNDOS`), entao mudar a duracao do turno tem que mudar
 * isto junto.
 *
 * Antes da PH-418 nao havia prazo nenhum: o estagio durava ate o "fim de
 * batalha", que este motor define como *nenhum inimigo engajado*. Numa hunt de
 * campo aberto isso acontece no vao entre um spawn e o proximo, ou seja, o buff
 * proprio morria em cerca de um segundo. Mesmo defeito que o clima tinha antes
 * da PH-329, e mesma correcao: a duracao e por tempo.
 */
export const DURACAO_DE_ESTAGIO_SEGUNDOS = 6 * TURNO_SEGUNDOS

/**
 * De onde saiu um estagio de atributo (PH-121), quanto ele contribui e ate
 * quando (PH-418).
 *
 * `estagios` guarda QUANTOS degraus, e so isso — o selo do HUD podia dizer
 * "Ataque −2" e nada mais. "De quem" e a metade util da informacao: baixar o
 * proprio Ataque (Hammer Arm) e levar Rosnado de um Rattata sao situacoes
 * diferentes, e a tela mostrava as duas igual.
 *
 * DEIXOU DE SER COSMETICO NA PH-418. A lista de fontes virou a fonte de
 * verdade: `entity.estagios[stat]` e o TOTAL DERIVADO da soma das contribuicoes
 * vivas (ver `totalDeEstagio`), clampado a +-6. Quem le continua lendo
 * `estagios` — `multiplicadorDeStat`, dano, velocidade, precisao e o HUD nao
 * mudaram uma linha —, mas quem ESCREVE tem que mexer na fonte e recalcular.
 *
 * Por que por fonte, e nao um prazo unico por atributo: o pedido e que reaplicar
 * o mesmo buff RENOVE o prazo sem somar estagio, e que golpes DIFERENTES somem.
 * Com um prazo so por atributo nao ha como distinguir "Danca das Espadas de
 * novo" de "Danca das Espadas mais Howl".
 */
export interface FonteDeEstagio {
  /** Id do golpe, ou da trait quando veio de hook de entrada (Intimidate). */
  id: string
  /** Se e golpe ou trait — decide como a tela resolve o nome de `id`. */
  tipo: 'golpe' | 'trait'
  /**
   * `true` = o proprio POKE fez isso em si mesmo (Danca das Espadas, Hammer
   * Arm). `false` = veio do oponente.
   */
  proprio: boolean
  /**
   * Nome da ESPECIE de quem causou. E o unico "quem" que existe numa hunt:
   * nao ha treinador adversario, so POKE selvagem.
   */
  deQuem: string
  /**
   * Quantos degraus ESTA fonte contribui, com sinal (PH-418). O total do
   * atributo e a soma das fontes vivas.
   */
  estagios: number
  /**
   * Segundos que faltam. `null` = permanente (nao expira nem no tick).
   *
   * Nada hoje cria fonte permanente — todas nascem com
   * `DURACAO_DE_ESTAGIO_SEGUNDOS`. O `null` existe porque um buff de item ou de
   * especialidade cairia exatamente aqui, e sem o campo ele obrigaria a
   * refatorar a estrutura inteira em vez de passar um valor.
   */
  expiraEm: number | null
  /**
   * Esta fonte EMPILHA em vez de renovar (PH-418).
   *
   * A regra geral e o contrario: reaplicar a mesma fonte renova o prazo e nao
   * soma, senao Danca das Espadas a cada 3,0s com prazo de 18s daria Ataque 4x
   * permanente.
   *
   * SPEED BOOST E MOODY SAO A EXCECAO, e nao por conveniencia: elas nao sao
   * golpe reaplicado, sao habilidade que sobe um degrau POR TURNO. Nos jogos o
   * Speed Boost acumula ate +6, e tratar cada turno como "renovacao" o
   * congelaria em +1 — o teste `habilidades.test.ts` pegou exatamente isso.
   *
   * Cada aplicacao vira uma entrada propria com prazo proprio, entao no
   * equilibrio ha uma entrada por turno vivo (6 entradas com prazo de 18s e
   * turno de 3s) e o teto continua sendo +6. O prazo faz o papel que o fim de
   * batalha fazia: a habilidade nao acumula pra sempre.
   */
  acumula?: boolean
}

/**
 * Fontes por atributo. LISTA, e nao a ultima fonte: quando dois golpes mexem no
 * mesmo atributo, sobrescrever apagaria metade da resposta — "Ataque +1" pode
 * ser Danca das Espadas (+2) mais um Rosnado (−1), e as duas linhas importam.
 * `registrarFonteDeEstagio` deduplica, entao a lista fica do tamanho do numero
 * de golpes distintos em jogo.
 */
export type EstagiosFonte = Partial<Record<StatDeEstagio, FonteDeEstagio[]>>

/**
 * Multiplicador de um estagio, formula exata dos jogos: (2+n)/2 subindo e
 * 2/(2-n) descendo.
 *
 * A assimetria e de proposito e e do jogo original: +1 da 1.5x, mas -1 da
 * 0.67x, nao 0.5x. Usar `1 + n*0.5` dos dois lados (o "obvio") tornaria os
 * debuffs bem mais fortes do que sao — em -2 a diferenca ja e 0.5 contra 0.5,
 * mas em -6 seria 0 (imortal) contra 0.25.
 */
export function multiplicadorDeEstagio(estagio: number): number {
  const n = Math.max(ESTAGIO_MINIMO, Math.min(ESTAGIO_MAXIMO, estagio))
  return n >= 0 ? (2 + n) / 2 : 2 / (2 - n)
}

export function multiplicadorDeStat(estagios: EstagiosDeStat | undefined, stat: StatDeEstagio): number {
  return multiplicadorDeEstagio(estagios?.[stat] ?? 0)
}

/**
 * O total de um atributo a partir das fontes vivas (PH-418) — soma das
 * contribuicoes, clampada a +-6.
 *
 * O CLAMP FICA AQUI, e nao na hora de aplicar, e isso muda o comportamento pro
 * melhor: quatro Danca das Espadas (+2 cada, de fontes distintas) somam +8 e
 * mostram +6; quando a primeira expira, sobram +6 e o total CONTINUA +6, em vez
 * de cair pra +4. O excedente fica guardado enquanto as fontes viverem, o que e
 * o que um jogador espera de "estou no maximo".
 */
export function totalDeEstagio(fontes: FonteDeEstagio[] | undefined): number {
  if (!fontes?.length) return 0
  let soma = 0
  for (const f of fontes) soma += f.estagios
  return Math.max(ESTAGIO_MINIMO, Math.min(ESTAGIO_MAXIMO, soma))
}

/**
 * Desconta `dt` dos prazos e devolve as fontes que sobraram (PH-418).
 *
 * Fonte com `expiraEm: null` nunca sai. Fonte que zerou o prazo sai da lista —
 * nao fica com prazo 0, porque `totalDeEstagio` soma tudo que esta na lista e
 * uma fonte expirada continuaria contando.
 */
export function envelhecerFontes(fontes: FonteDeEstagio[], dt: number): FonteDeEstagio[] {
  const vivas: FonteDeEstagio[] = []
  for (const f of fontes) {
    if (f.expiraEm == null) { vivas.push(f); continue }
    const restante = f.expiraEm - dt
    if (restante > 0) { f.expiraEm = restante; vivas.push(f) }
  }
  return vivas
}

/**
 * Multiplicador de estagio de precisao/evasao — formula exata dos jogos, e
 * DIFERENTE da formula generica acima: base 3, nao base 2. (3+n)/3 subindo,
 * 3/(3-n) descendo. +1 da 1.33x (nao 1.5x); -1 da 0.75x (nao 0.67x).
 *
 * Eixo separado de proposito: accuracy/evasion nunca reusa `multiplicadorDeEstagio`
 * porque as duas fórmulas divergem — usar a de base 2 aqui deixaria Areia-Fina/
 * Duplo Time mais fortes do que sao nos jogos reais.
 */
export function multiplicadorDeAccuracyOuEvasion(estagio: number): number {
  const n = Math.max(ESTAGIO_MINIMO, Math.min(ESTAGIO_MAXIMO, estagio))
  return n >= 0 ? (3 + n) / 3 : 3 / (3 - n)
}
