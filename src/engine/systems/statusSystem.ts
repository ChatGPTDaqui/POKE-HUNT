// Aplicacao e passagem do tempo dos status.
//
// COMO O TEMPO FUNCIONA AQUI. Nos jogos originais o status resolve no fim de
// cada turno da batalha. Este combate e continuo e nao tem turno global — cada
// POKE tem o SEU relogio (`proximoTurnoDeStatus`), que dispara a cada
// TURNO_SEGUNDOS. E o mesmo intervalo que separa duas acoes dele, entao um
// veneno de 1/8 por turno tira 1/8 no ritmo em que aquele POKE agiria.
//
// POR QUE O RELOGIO DE STATUS E SEPARADO DO COOLDOWN DE ACAO: um POKE dormindo
// nao age, mas o sono precisa continuar contando. Amarrar o tick de status ao
// `globalCooldown` deixaria o sono eterno — o POKE nunca agiria, entao o
// contador nunca desceria.
import { nextFloat, type Rng } from '@/core/rng'
import { SPECIES } from '@/data/pokes'
import { TURNO_SEGUNDOS } from '@/data/abilities'
import {
  podeReceberStatus, sortearDuracao, danoPorTurno, ehVolatil, perdeOTurno,
  chanceDeDescongelar, descongelaCom, chanceDeSeAtacar, poderDoAutoDano, imobiliza,
  SEGUNDOS_DE_IMUNIDADE_APOS_CURA,
  DURACAO_DE_ESTAGIO_SEGUNDOS, totalDeEstagio, envelhecerFontes,
  type StatusAtivo, type StatusCondition, type StatDeEstagio, type FonteDeEstagio,
} from '@/data/statusEffects'
import type { StatChange } from '@/data/generated/types'
import type { Ability } from '@/data/abilities'
import type { WorldEntity, Escudos, ClimaTipo } from '../types'
import { heal, VFX_CURA_DURACAO } from '../entity'
import { traitDoPoke, type TraitId } from '@/data/traits'
import {
  TRAIT_IMUNE_A_DANO_DE_CLIMA, CURA_POR_CLIMA, DANO_POR_CLIMA, TRAIT_SO_DANO_DIRETO,
  TRAIT_LEAF_GUARD, TRAIT_EARLY_BIRD, SHED_SKIN_CHANCE, TRAIT_HYDRATION,
  TRAIT_SPEED_BOOST, TRAIT_MOODY, PROTECAO_DE_ESTAGIO, TRAIT_CONTRARY, TRAIT_SIMPLE,
  REACAO_A_QUEDA_DE_ESTAGIO,
} from '@/data/traitEffects'

// Fracoes de HP MAXIMO por turno dos golpes de tick volatil novos (ver
// BaseEntity#seeded/curseDot/nightmareDot/regenPercent em engine/types.ts).
// Vivem aqui (nao em combatSystem.ts) porque so sao lidas dentro de
// tickStatus — quem SETA cada flag e resolveHit (combatSystem.ts), que tem
// suas proprias constantes de aplicacao (custo do Curse, regenPercent do
// Ingrain/Aqua Ring, etc).
const LEECH_SEED_DRAIN_PERCENT = 1 / 8
const CURSE_DOT_PERCENT = 1 / 4
const NIGHTMARE_DOT_PERCENT = 1 / 4

// Traits que impedem um status especifico de pegar (Fase 12). Cada uma cobre
// UM status so — nao existe trait "imune a tudo" neste catalogo.
const TRAIT_STATUS_IMUNIDADE: Partial<Record<TraitId, StatusCondition>> = {
  immunity: 'poison',
  limber: 'paralysis',
  insomnia: 'sleep',
  vital_spirit: 'sleep',
  water_veil: 'burn',
  magma_armor: 'freeze',
  own_tempo: 'confusion',
}

function traitBloqueiaStatus(alvo: WorldEntity, tipo: StatusCondition): boolean {
  const trait = traitDoPoke(alvo.poke)
  return trait != null && TRAIT_STATUS_IMUNIDADE[trait] === tipo
}

export function statusNaoVolatil(entity: WorldEntity): StatusAtivo | null {
  return entity.poke.status ?? null
}

/**
 * Este POKE esta travado no lugar por status?
 *
 * So o nao-volatil conta: confusao (volatil) faz perder o turno e se atacar,
 * mas nao prende ninguem no chao.
 */
export function imobilizadoPorStatus(entity: WorldEntity): boolean {
  return imobiliza(entity.poke.status?.tipo)
}

export function statusAtivos(entity: WorldEntity): StatusAtivo[] {
  const saida: StatusAtivo[] = []
  const nv = statusNaoVolatil(entity)
  if (nv) saida.push(nv)
  if (entity.statusVolatil) saida.push(entity.statusVolatil)
  return saida
}

/**
 * Vale a pena tentar este status neste alvo AGORA?
 *
 * Usada pela IA (`pickAbility`) antes de escolher um golpe de status puro. Sem
 * ela o inimigo gastaria turnos jogando Thunder Wave num POKE ja paralisado,
 * num POKE de tipo ELECTRIC, ou dentro da janela de imunidade de reaplicacao —
 * e a leitura pro jogador seria "esse POKE parou de atacar do nada".
 *
 * Nao sorteia nada: e a pergunta "pode pegar", nao "pegou".
 */
export function statusVaiPegar(
  alvo: WorldEntity, tipo: StatusCondition, abilityId?: string,
  /**
   * Clima ativo. So LEAF GUARD precisa dele (imunidade a status enquanto ha
   * sol forte). Opcional pra todo chamador antigo continuar valido — sem ele a
   * habilidade simplesmente nao pega, que e o comportamento anterior.
   */
  clima?: ClimaTipo | null,
): boolean {
  if (alvo.imunidadeDeStatus > 0) return false
  if ((alvo.escudos?.safeguard ?? 0) > 0) return false
  if (ehVolatil(tipo) && alvo.statusVolatil) return false
  if (traitBloqueiaStatus(alvo, tipo)) return false
  // LEAF GUARD: imune a QUALQUER status nao-volatil enquanto o sol estiver
  // forte. Nao e imunidade a um status especifico como as sete de
  // TRAIT_STATUS_IMUNIDADE — e condicional ao campo, por isso fora daquela
  // tabela.
  if (clima === 'sol' && traitDoPoke(alvo.poke) === TRAIT_LEAF_GUARD) return false
  const especie = SPECIES[alvo.poke.speciesId]
  return podeReceberStatus(tipo, {
    tipo1: especie.type,
    tipo2: especie.type2,
    statusAtual: statusNaoVolatil(alvo)?.tipo ?? null,
  }, abilityId)
}

/**
 * Tenta aplicar `tipo` em `alvo`. Devolve o status aplicado, ou null se nao
 * pegou (imunidade, ja tem status, imunidade de reaplicacao, ou o sorteio da
 * chance falhou).
 *
 * `abilityId` entra porque a imunidade a golpe de PO depende do GOLPE, nao do
 * status: GRASS ignora Sleep Powder mas nao ignora Hypnosis.
 */
export function aplicarStatus(
  rng: Rng,
  alvo: WorldEntity,
  tipo: StatusCondition,
  chance: number,
  abilityId?: string,
  /** Ver o mesmo parametro em `statusVaiPegar` — so LEAF GUARD o consome. */
  clima?: ClimaTipo | null,
): StatusAtivo | null {
  // A imunidade de reaplicacao vale pros dois tipos de status: e ela que
  // impede o Antidoto de virar ouro jogado fora num combate que nao acaba.
  if (alvo.imunidadeDeStatus > 0) return null

  // Safeguard: bloqueia qualquer status NOVO enquanto ativo. Nao mexe em
  // status que o alvo ja tinha antes de ativar o escudo — este guard so
  // impede a ENTRADA de um status daqui pra frente.
  if ((alvo.escudos?.safeguard ?? 0) > 0) return null
  // Traits de imunidade (Fase 12): Immunity/Limber/Insomnia/Vital Spirit/
  // Water Veil/Magma Armor/Own Tempo. Cada uma bloqueia so o SEU status —
  // ver TRAIT_STATUS_IMUNIDADE no topo do arquivo.
  if (traitBloqueiaStatus(alvo, tipo)) return null
  // LEAF GUARD, o par do guard em `statusVaiPegar`. Repetido aqui e nao
  // delegado porque as duas funcoes tem assinaturas diferentes de proposito:
  // `statusVaiPegar` e consulta da IA, esta e o caminho que APLICA, e um dos
  // dois esquecer a habilidade seria uma imunidade que a tela mostra e o
  // combate ignora.
  if (clima === 'sol' && traitDoPoke(alvo.poke) === TRAIT_LEAF_GUARD) return null

  const especie = SPECIES[alvo.poke.speciesId]
  const podeReceber = podeReceberStatus(tipo, {
    tipo1: especie.type,
    tipo2: especie.type2,
    statusAtual: statusNaoVolatil(alvo)?.tipo ?? null,
  }, abilityId)
  if (!podeReceber) return null

  // Confusao sobre confusao nao empilha nem estende, como nos jogos.
  if (ehVolatil(tipo) && alvo.statusVolatil) return null

  if (nextFloat(rng) * 100 >= chance) return null

  const status: StatusAtivo = { tipo, turnosRestantes: sortearDuracao(rng, tipo) }
  if (ehVolatil(tipo)) alvo.statusVolatil = status
  else alvo.poke.status = status
  return status
}

/**
 * Aplica as mudancas de estagio de atributo de um golpe ("power ups").
 *
 * `ability.statTarget === 'self'` manda no proprio usuario (Danca das Espadas);
 * ausente manda no alvo (Rosnado). Sem essa distincao, Danca das Espadas subiria
 * o Ataque do INIMIGO — e o dado cru da PokeAPI nao a carrega, ela vem de
 * `move.target` (ver fetch-usum-catalog.js).
 *
 * Devolve as mudancas que REALMENTE entraram: quem ja esta em +6 nao sobe mais,
 * e o chamador precisa saber disso pra nao anunciar um buff que nao houve.
 */
export function aplicarMudancasDeStat(
  rng: Rng,
  atacante: WorldEntity,
  alvo: WorldEntity,
  ability: Ability,
): StatChange[] {
  if (!ability.statChanges || !ability.statChance) return []
  if (nextFloat(rng) * 100 >= ability.statChance) return []

  const destino = ability.statTarget === 'self' ? atacante : alvo
  // Mist: bloqueia queda de estagio vinda de golpe do OPONENTE (statTarget
  // ausente/nao-'self', ou seja, o destino e o `alvo`). Nao mexe em queda
  // auto-infligida pelo proprio usuario (ex: golpe que baixa a propria stat).
  const bloqueadoPorMist = ability.statTarget !== 'self' && (alvo.escudos?.mist ?? 0) > 0
  const vemDoOponente = ability.statTarget !== 'self'
  const traitDoDestino = traitDoPoke(destino.poke)
  // CONTRARY inverte TODA mudanca de estagio no portador — inclusive as boas.
  // Por isso o sinal e trocado antes de qualquer guard: uma queda que virou
  // subida nao pode mais ser barrada por Clear Body.
  const inverte = traitDoDestino === TRAIT_CONTRARY
  // SIMPLE (PH-332): toda mudanca de estagio no portador conta em DOBRO — as
  // boas e as ruins, como nos jogos.
  //
  // Aplicada no DELTA, e nao no multiplicador de leitura. Nos jogos a
  // habilidade dobra o MODIFICADOR (e o teto de +-6 continua valendo); aqui o
  // resultado e o mesmo porque o `clamp` logo abaixo ja segura o teto, e o
  // caminho do delta tem duas vantagens concretas: `multiplicadorDeStat` e lido
  // em uma duzia de lugares (dano, velocidade, precisao) e nenhum deles conhece
  // habilidade nenhuma, e o numero que a ficha do POKE mostra passa a ser o
  // estagio de verdade — com o dobro escondido na leitura, a tela mostraria +1
  // enquanto o combate calcularia +2.
  //
  // DEPOIS do Contrary, e nao antes: as duas empilham (dobra o valor invertido),
  // e trocar a ordem daria o mesmo resultado — mas so por acaso, porque
  // `-2 * x === 2 * -x`. A ordem escrita e a dos jogos.
  const dobra = traitDoDestino === TRAIT_SIMPLE
  const aplicadas: StatChange[] = []
  let sofreuQuedaDoOponente = false
  for (const mudanca of ability.statChanges) {
    const invertido = inverte ? -mudanca.estagios : mudanca.estagios
    const delta = dobra ? invertido * 2 : invertido
    if (bloqueadoPorMist && delta < 0) continue
    // PROTECAO DE ESTAGIO (Clear Body, Hyper Cutter, Big Pecks, Keen Eye): so
    // contra QUEDA, e so contra queda vinda do OPONENTE — nos jogos nenhuma
    // delas impede o portador de baixar a propria stat (Belly Drum, Hammer Arm).
    const protegido = traitDoDestino ? PROTECAO_DE_ESTAGIO[traitDoDestino] : undefined
    const protegeEsteStat = traitDoDestino != null && traitDoDestino in PROTECAO_DE_ESTAGIO
      && (protegido === null || protegido === mudanca.stat)
    if (delta < 0 && vemDoOponente && protegeEsteStat) continue

    const antes = destino.estagios[mudanca.stat] ?? 0
    // PH-418: quem escreve o estagio e a FONTE. `registrarFonteDeEstagio`
    // renova o prazo quando a fonte ja existe (sem somar), soma quando e nova, e
    // devolve o total ja clampado.
    //
    // PH-121: a procedencia e anotada AQUI porque e o unico ponto onde `ability`
    // e `atacante` existem juntos. Depois do hit, `estagios` e um numero solto.
    const depois = registrarFonteDeEstagio(destino, mudanca.stat, comPrazoPadrao({
      id: ability.id,
      tipo: 'golpe',
      proprio: destino === atacante,
      deQuem: SPECIES[atacante.poke.speciesId]?.name ?? atacante.poke.speciesId,
      estagios: delta,
    }))
    // A REACAO OLHA A QUEDA REAL DO TOTAL, e nao o delta pedido. Nos jogos, um
    // atributo que ja esta no piso nao cai mais, o golpe falha e Defiant nao
    // ativa — comportamento que existia aqui de graca (o `continue` vinha antes)
    // e que a PH-418 tinha que preservar de proposito, porque agora a fonte e
    // registrada mesmo no piso (pra renovar o prazo do debuff).
    if (depois < antes && vemDoOponente) sofreuQuedaDoOponente = true
    if (depois === antes) continue // ja no teto ou no piso: renovou prazo, nada a anunciar
    aplicadas.push({ stat: mudanca.stat, estagios: depois - antes })
  }

  // DEFIANT / COMPETITIVE: levar um estagio rebaixado pelo oponente vira +2 em
  // Ataque (Defiant) ou Ataque Especial (Competitive). Uma unica vez por golpe,
  // por mais estagios que ele tenha derrubado — e como os jogos contam.
  const reacao = traitDoDestino ? REACAO_A_QUEDA_DE_ESTAGIO[traitDoDestino] : undefined
  if (sofreuQuedaDoOponente && reacao) {
    // A fonte aqui e a TRAIT do proprio destino, nao o golpe que o irritou: e o
    // Defiant dele que produziu o +2, e e isso que o selo tem que explicar.
    const subida = aplicarEstagioUnico(destino, reacao.stat, reacao.estagios, {
      id: traitDoDestino!,
      tipo: 'trait',
      proprio: true,
      deQuem: SPECIES[destino.poke.speciesId]?.name ?? destino.poke.speciesId,
    })
    if (subida) aplicadas.push(subida)
  }
  return aplicadas
}

/**
 * Aplica UMA mudanca de estagio direto, sem `Ability` por tras — usada pelo
 * HOOK DE ENTRADA EM COMBATE de Trait (Intimidate/Download, ver
 * combatSystem.ts#resolveEntryHook), que nao tem `ability.statChanges` pra
 * passar por `aplicarMudancasDeStat`. Mesmo clamp e mesma forma de retorno
 * (StatChange|null, null quando ja no teto/piso) pro chamador decidir se
 * anuncia o toast.
 */
export function aplicarEstagioUnico(
  alvo: WorldEntity,
  stat: StatDeEstagio,
  delta: number,
  /**
   * PH-121 — de onde veio. PH-418: virou o jeito de aplicar, nao um enfeite.
   *
   * Ausente ainda e aceito porque `fonteDeTrait` devolve `undefined` quando a
   * trait e nula, e o TS nao sabe que nos pontos de chamada ela sempre existe
   * (o hook so roda com a trait). Nesse caso entra uma fonte anonima, pra que o
   * estagio nunca fique sem prazo — um estagio eterno e exatamente o defeito
   * que esta issue conserta.
   */
  fonte?: Omit<FonteDeEstagio, 'estagios' | 'expiraEm'>,
): StatChange | null {
  const antes = alvo.estagios[stat] ?? 0
  const identidade = fonte ?? {
    id: 'anonimo',
    tipo: 'trait' as const,
    proprio: true,
    deQuem: SPECIES[alvo.poke.speciesId]?.name ?? alvo.poke.speciesId,
  }
  const depois = registrarFonteDeEstagio(alvo, stat, comPrazoPadrao({ ...identidade, estagios: delta }))
  if (depois === antes) return null // teto/piso: prazo renovado, nada a anunciar
  return { stat, estagios: depois - antes }
}

/**
 * Procedencia de estagio que veio de uma TRAIT (PH-121).
 *
 * `dono` e quem TEM a trait; `destino` e quem recebe o estagio. Os dois quase
 * sempre coincidem (Speed Boost, Moody, Moxie, Weak Armor, Download), e
 * Intimidate e a excecao que obriga a distinguir: a trait e do atacante e o
 * estagio cai no oponente, entao `proprio` tem que ser `false` ali e o "de quem"
 * tem que apontar pro dono, nao pra quem levou.
 */
export function fonteDeTrait(
  dono: WorldEntity, trait: TraitId | null | undefined, destino: WorldEntity = dono,
  // PH-418: devolve so a IDENTIDADE da fonte. Quem chama sabe quantos degraus
  // vale (`aplicarEstagioUnico` recebe o delta) e o prazo e sempre o padrao,
  // entao carregar os dois campos aqui obrigaria todo chamador a repeti-los.
): Omit<FonteDeEstagio, 'estagios' | 'expiraEm'> | undefined {
  if (!trait) return undefined
  return {
    id: trait,
    tipo: 'trait',
    proprio: dono === destino,
    deQuem: SPECIES[dono.poke.speciesId]?.name ?? dono.poke.speciesId,
  }
}

/**
 * Anota a procedencia de um estagio (PH-121) e, desde a PH-418, a contribuicao
 * e o prazo dela — e este e o unico jeito de um estagio entrar.
 *
 * REAPLICAR A MESMA FONTE RENOVA O PRAZO SEM SOMAR ESTAGIO. E o desenho pedido:
 * duas Dancas das Espadas seguidas dao +2 com prazo cheio, nao +4. Fontes
 * DIFERENTES somam, entao chegar ao teto exige golpes de buff distintos.
 *
 * Sem essa regra o pedido viraria outra coisa: Danca das Espadas recarrega em
 * 3,0s e o prazo e 18s, entao caberiam seis aplicacoes vivas — Ataque 4x
 * permanente. Do outro lado, Screech (1,5s de recarga, −2 de Defesa) fixaria a
 * Defesa do jogador em 25%.
 *
 * `magnitude` MAIOR EM MODULO SUBSTITUI: Growth no sol vale +2 onde normalmente
 * vale +1, e reaplicar com o sol aceso nao pode deixar o POKE preso no valor
 * fraco de antes.
 *
 * Devolve o total do atributo DEPOIS da mudanca — quem chama precisa dele pra
 * saber se houve mudanca de verdade (quem ja esta no teto nao sobe).
 */
export function registrarFonteDeEstagio(
  destino: WorldEntity, stat: StatDeEstagio, fonte: FonteDeEstagio,
): number {
  const mapa = (destino.estagiosFonte ??= {})
  const lista = (mapa[stat] ??= [])
  // `acumula` (Speed Boost, Moody) entra como entrada NOVA sempre — ver o campo
  // em `FonteDeEstagio` pro motivo. Sem esta linha o Speed Boost congelaria em
  // +1 em vez de subir um degrau por turno.
  //
  // A CHAVE NAO INCLUI `deQuem`, e essa decisao custou uma medicao. Com ele na
  // chave, "Rosnado do Rattata" e "Rosnado do Sentret" eram fontes distintas e
  // SOMAVAM — num auto-battler de campo aberto, onde passam dezenas de especies
  // diferentes, o jogador ia a −6 e ficava lá renovando. O teste de simulacao de
  // uma hora pegou: um POKE 22 niveis acima do mato gastou os 50 Revives.
  //
  // Conceitualmente o `deQuem` nunca deveria estar na chave: o modificador e do
  // ALVO, nao de quem aplicou, e nos jogos dois Rosnados de dois POKEs
  // diferentes empilham porque cada um e um TURNO diferente — o que aqui e
  // coberto pelo prazo, nao pela identidade de quem rosnou. O campo continua na
  // fonte, e e atualizado na renovacao, porque o selo do HUD mostra quem foi o
  // ultimo a causar.
  const existente = fonte.acumula ? undefined : lista.find(
    (f) => f.id === fonte.id && f.tipo === fonte.tipo && f.proprio === fonte.proprio,
  )
  if (existente) {
    existente.expiraEm = fonte.expiraEm
    existente.deQuem = fonte.deQuem
    if (Math.abs(fonte.estagios) > Math.abs(existente.estagios)) existente.estagios = fonte.estagios
  } else {
    lista.push(fonte)
  }
  return recalcularEstagio(destino, stat)
}

/**
 * Reescreve `estagios[stat]` a partir das fontes vivas (PH-418) e devolve o
 * total.
 *
 * `estagios` virou CACHE: a verdade e a lista de fontes. Toda escrita passa por
 * aqui, e nenhuma leitura precisou mudar — `multiplicadorDeStat`, a formula de
 * dano, a velocidade de movimento e o HUD continuam lendo `estagios`.
 *
 * Estagio 0 sai do objeto (`delete`) em vez de virar `0` explicito: e a
 * convencao do resto do arquivo, e o selo do HUD trata ausente e zero igual.
 */
export function recalcularEstagio(destino: WorldEntity, stat: StatDeEstagio): number {
  const fontes = destino.estagiosFonte?.[stat]
  const total = totalDeEstagio(fontes)
  if (total === 0) delete destino.estagios[stat]
  else destino.estagios[stat] = total
  // Lista vazia nao fica pendurada: sem fonte nao ha selo, e uma lista vazia
  // faria `estagiosFonte` crescer com uma chave por atributo ja usado na luta.
  if (destino.estagiosFonte && (!fontes || fontes.length === 0)) delete destino.estagiosFonte[stat]
  return total
}

/**
 * Apaga estagio e fonte de todos os atributos (PH-418) — Haze, a troca do POKE
 * em campo, e todo caminho que levanta um POKE caido.
 *
 * Os dois campos juntos, sempre: `estagios` e cache do que as fontes somam, e
 * limpar um sem o outro NAO limpa nada — `recalcularEstagio` reescreve o cache
 * a partir das fontes que sobraram, no proximo tick. Foi o defeito real do
 * Hospital: ele zerava `estagios` e o Rosnado voltava sozinho.
 *
 * MORA AQUI, e nao no `combatSystem`, porque `autoSystem` precisa dele pro
 * auto-revive e ja importa este modulo — o caminho contrario abriria ciclo.
 */
export function apagarTodosOsEstagios(entity: WorldEntity): void {
  entity.estagios = {}
  entity.estagiosFonte = undefined
}

/**
 * Prazo que sobra na fonte que ESTE golpe criou, ou `null` se ela nao existe
 * mais (PH-419).
 *
 * A busca e pela mesma identidade que `registrarFonteDeEstagio` usa pra decidir
 * renovacao — id, tipo e autoria. Perguntar so "tem fonte viva neste atributo"
 * daria a resposta errada no caso que importa: um Rosnado do inimigo tambem e
 * fonte de atkFis, e a IA nao renova o buff dela olhando o prazo do debuff
 * alheio.
 */
export function prazoDaFonteDoGolpe(
  entity: WorldEntity, stat: StatDeEstagio, abilityId: string, proprio: boolean,
): number | null {
  const fonte = entity.estagiosFonte?.[stat]?.find(
    (f) => f.id === abilityId && f.tipo === 'golpe' && f.proprio === proprio,
  )
  if (!fonte) return null
  // `expiraEm: null` e fonte permanente. Nada cria uma hoje, mas devolver 0 aqui
  // faria a IA reaplicar pra sempre uma fonte que nunca vence.
  return fonte.expiraEm ?? Number.POSITIVE_INFINITY
}

/**
 * Se a entidade tem alguma fonte PROPRIA viva neste atributo (PH-419).
 *
 * Existe pro Belly Drum, que e a excecao nomeada da issue: ele custa 50% do HP
 * maximo e vai direto ao teto, entao ele nao entra na renovacao preventiva e
 * ainda recusa entrar quando o POKE ja tem buff proprio de Ataque de pe —
 * empilhar o custo de HP em cima de um buff que ja existe e o pior negocio que
 * a IA consegue fechar.
 */
export function temFontePropriaViva(entity: WorldEntity, stat: StatDeEstagio): boolean {
  return Boolean(entity.estagiosFonte?.[stat]?.some((f) => f.proprio))
}
/**
 * Fonte nova com o prazo padrao (PH-418). Existe pra `DURACAO_DE_ESTAGIO_SEGUNDOS`
 * nao ficar repetida em cada um dos oito pontos que aplicam estagio.
 */
export function comPrazoPadrao(fonte: Omit<FonteDeEstagio, 'expiraEm'>): FonteDeEstagio {
  return { ...fonte, expiraEm: DURACAO_DE_ESTAGIO_SEGUNDOS }
}

// `esquecerFonteSeZerado` MORREU NA PH-418, e a razao vale registro: ela
// apagava a lista de fontes quando o total voltava a zero. Com o total derivado
// das fontes isso ficou errado — total zero costuma ser CANCELAMENTO (um Rosnado
// −1 sobre um Howl +1), as duas fontes seguem vivas contando o prazo, e quando o
// Rosnado expira o Howl volta a valer. Apagar mataria essa volta. Lista que
// esvaziou de verdade e limpa por `recalcularEstagio`.

// Efeito colateral de golpe: le `ability.status`/`statusChance` e tenta aplicar.
// Separado de `aplicarStatus` porque o golpe tambem PODE DESCONGELAR o alvo
// (golpe de FIRE com dano), e as duas coisas acontecem no mesmo hit.
export function aplicarEfeitosDoGolpe(
  rng: Rng, alvo: WorldEntity, ability: Ability,
  /** Repassado a `aplicarStatus` — so LEAF GUARD o consome. */
  clima?: ClimaTipo | null,
): StatusAtivo | null {
  const congelado = statusNaoVolatil(alvo)
  if (congelado && descongelaCom(congelado.tipo, ability.type, ability.power)) {
    curarStatus(alvo, congelado.tipo)
  }

  if (!ability.status || !ability.statusChance) return null
  return aplicarStatus(rng, alvo, ability.status, ability.statusChance, ability.id, clima)
}

/**
 * Tira um status e liga a imunidade de reaplicacao.
 *
 * `tipo` opcional: sem ele tira TUDO (o que o Centro Pokemon faz). Com ele,
 * tira so aquele — e o que um Antidoto faz.
 */
export function curarStatus(entity: WorldEntity, tipo?: StatusCondition): boolean {
  let curou = false
  const nv = statusNaoVolatil(entity)
  if (nv && (!tipo || nv.tipo === tipo)) {
    entity.poke.status = null
    curou = true
  }
  if (entity.statusVolatil && (!tipo || entity.statusVolatil.tipo === tipo)) {
    entity.statusVolatil = null
    curou = true
  }
  if (curou) {
    entity.imunidadeDeStatus = SEGUNDOS_DE_IMUNIDADE_APOS_CURA
    // Faisca verde de "curou status". Fica AQUI, e nao no tick de status, de
    // proposito: esta funcao e o caminho de toda cura por fonte EXTERNA
    // (Antidoto, Heal Bell, Centro, o Fogo derretendo o congelamento), e o
    // sono/congelamento/confusao que acabam sozinhos zeram
    // `poke.status`/`statusVolatil` direto no `tickStatus` sem passar por
    // aqui. Ou seja, a distincao que o pedido pede sai de graca da estrutura
    // que ja existia.
    entity.vfxCuraStatus = VFX_CURA_DURACAO
  }
  return curou
}

/**
 * Zera o que os jogos zeram no fim da batalha: status volatil (confusao) e o
 * hook de entrada em combate (Intimidate/Download/clima automatico — ver
 * combatSystem.ts#resolveEntryHook). O nao-volatil NAO sai daqui — ele
 * sobrevive a batalha nos jogos, e e por isso que existe Antidoto.
 *
 * ESTAGIO DE ATRIBUTO SAIU DESTA LISTA SO PELA METADE (PH-418).
 *
 * A primeira versao tirou o estagio inteiro daqui e deixou o PRAZO limitar. A
 * medicao reprovou: 100 mortes do jogador contra 15 antes, 628 abates/h contra
 * 786 (`farmOffline`, uma hora, route_46, Charmander Lv25). Ou seja −20%, quase
 * o mesmo −27% que o reset existia pra evitar.
 *
 * O furo e a RENOVACAO. Prazo de 18s so limita fonte que PARA de ser aplicada:
 * cada Rosnado novo renova os 18s, e numa hunt de campo aberto o jogador leva
 * Rosnado a cada poucos segundos, de especies diferentes, sem intervalo. "No
 * maximo 18s" virou "pra sempre" — exatamente o debuff eterno de antes, agora
 * com um relogio que nunca chega ao fim.
 *
 * ENTAO O CORTE E POR AUTORIA, e nao por tipo de estagio:
 *
 *   `proprio: true`   fica, e vive o prazo de 18s. E o pedido da issue: quem se
 *                     buffa usufrui pelo tempo prometido, sem morrer no vao de
 *                     um segundo entre dois spawns.
 *   `proprio: false`  sai, como saia antes. O que o jogador sofre de terceiro
 *                     nao atravessa a batalha, e e isso que segura o −27%.
 *
 * Isso NAO contraria "o mesmo vale para debuffs": um debuff que o jogador aplica
 * mora no ALVO, e alvo de hunt morre em segundos — atravessar batalha ali nao
 * significa nada. O que atravessa e o que o dono fez a si mesmo, nos dois
 * sentidos (Danca das Espadas e Hammer Arm). O motivo do reset era real e esta medido no `combatSystem`: sem ele, o
 * debuff dos selvagens empilhava ate −6 e nunca voltava, e isso custava 27% das
 * kills/hora. Só que o "fim de batalha" deste motor e *nenhum inimigo
 * engajado*, o que numa hunt de campo aberto acontece no vao entre cada spawn —
 * entao o mesmo reset que protegia do debuff eterno matava o buff proprio em
 * cerca de um segundo. Agora quem limita e o PRAZO (18s por fonte), que resolve
 * os dois lados: debuff nao fica eterno e buff dura o que promete. Mesma troca
 * que o clima fez na PH-329.
 *
 * A imunidade de reaplicacao tambem nao e mexida: ela e sobre o tempo desde a
 * ultima cura, nao sobre a batalha.
 *
 * `estagioDeCritico` (Focus Energy) e `proximoGolpeCriticoGarantido` (Laser
 * Focus) CONTINUAM saindo aqui: sao contador/flag por entidade de campo, nao
 * tem prazo proprio, e sem o reset ficariam eternos — que e justamente o que a
 * PH-418 evitou dando prazo ao estagio.
 */
export function limparEstadoVolatil(entity: WorldEntity): void {
  entity.statusVolatil = null
  entity.revelado = undefined
  entity.escudos = undefined
  entity.imuneAoTipoVolatil = undefined
  entity.flashFireAtivo = undefined
  // Lock/disable (Taunt/Spite/Disable/Encore/Torment) tambem e volatil pelo
  // mesmo motivo: sem fim de batalha real, sem isto o jogador acumularia
  // Encore/Disable/Torment de um inimigo pro proximo, pra sempre.
  entity.lastUsedAbilityId = null
  entity.silenciadoAte = 0
  entity.disabledAbilityId = null
  entity.disabledAbilityUntil = 0
  entity.forcedAbilityId = null
  entity.forcedAbilityUntil = 0
  entity.tormentedUntil = 0
  // TRUANT (PH-332): o contador de folga zera no fim da luta, como nos jogos.
  entity.truantDeFolga = undefined
  // Estagio de terceiro sai; o proprio fica contando o prazo. `recalcularEstagio`
  // reescreve o cache e limpa a chave que esvaziou, entao nao ha estado meio-limpo.
  if (entity.estagiosFonte) {
    for (const chave of Object.keys(entity.estagiosFonte) as StatDeEstagio[]) {
      const fontes = entity.estagiosFonte[chave]
      if (!fontes?.length) continue
      const proprias = fontes.filter((f) => f.proprio)
      if (proprias.length === fontes.length) continue
      entity.estagiosFonte[chave] = proprias
      recalcularEstagio(entity, chave)
    }
  }
  entity.estagioDeCritico = undefined
  entity.proximoGolpeCriticoGarantido = undefined
  // Golpes de tick volatil novos (leech_seed/curse/nightmare/ingrain/aqua_ring)
  // sao a mesma familia de "some no fim da batalha" do statusVolatil/estagios
  // acima — sem timer proprio, entao sem este ponto nunca sairiam sozinhos.
  entity.seeded = undefined
  entity.curseDot = undefined
  entity.nightmareDot = undefined
  entity.regenPercent = undefined
  // PRESO (PH-72): fim de luta solta o POKE. Sem esta linha o jogador ficaria
  // com a troca de equipe travada FORA de combate, sem nada na tela explicando —
  // o pior jeito de um estado volatil vazar.
  entity.presoAte = undefined
  entity.entradaProcessada = false
  // Fase 12: todo campo volatil novo tem que zerar aqui tambem — fim de
  // batalha e fim de batalha pra qualquer estado que nao sobrevive a troca de
  // cena, nao so pra confusao/estagio.
  entity.enduraAtiva = false
  entity.protegida = false
  // Contador de protecoes seguidas (Protect/Detect/Endure). Volatil como o
  // resto: uma batalha nova comeca com a chance cheia.
  entity.protecoesSeguidas = 0
  // TRACE: devolve a habilidade original. Sem isto o POKE do jogador sairia da
  // hunt com a habilidade copiada gravada no save — ver types.ts#traitOriginal.
  if (entity.traitOriginal !== undefined) {
    entity.poke.trait = entity.traitOriginal ?? undefined
    entity.traitOriginal = undefined
  }
  entity.destinyBondAtiva = false
  entity.curaBloqueadaAte = 0
  entity.miraGarantidaAlvoId = null
  entity.tipoForcado = undefined
  entity.perishCountdown = null
  entity.yawnTurnos = null
}

// Dano de clima por turno (Gen3+): 1/16 do HP MAXIMO, minimo 1, pra quem nao
// e imune ao clima ativo. Granizo poupa ICE; Areia poupa ROCK/GROUND/STEEL
// (qualquer um dos dois tipos da especie ja isenta).
const AREIA_TIPOS_IMUNES = new Set(['ROCK', 'GROUND', 'STEEL'])

function danoDeClimaPorTurno(clima: ClimaTipo | null, hpMax: number, tipo1: string, tipo2: string | null): number {
  if (clima === 'granizo' && tipo1 !== 'ICE' && tipo2 !== 'ICE') {
    return Math.max(1, Math.floor(hpMax / 16))
  }
  if (clima === 'areia' && !AREIA_TIPOS_IMUNES.has(tipo1) && !(tipo2 && AREIA_TIPOS_IMUNES.has(tipo2))) {
    return Math.max(1, Math.floor(hpMax / 16))
  }
  return 0
}

export interface TickDeStatus {
  /** Dano de veneno/queimadura aplicado neste turno (0 se nenhum). */
  dano: number
  /** Status que sairam sozinhos neste turno (sono acabou, descongelou, ...). */
  expirados: StatusCondition[]
  /**
   * Leech Seed: quanto curar em quem PLANTOU a semente, e o id dele.
   * Ausente = nada a drenar. A cura em si e cross-entity (precisa achar a
   * origem em `world.player`/`world.enemies`), entao quem aplica de fato e o
   * chamador (combatSystem.ts#updateCombat) — mesmo motivo de `dano` nao ser
   * aplicado aqui dentro (ver comentario da funcao).
   */
  drenoParaOrigem?: { sourceId: string; amount: number }
  /**
   * Cancao da Perdicao chegou a 0 neste turno (Fase 12) — o chamador
   * (combatSystem) precisa matar a entidade e creditar o kill/desmaio pelo
   * mesmo caminho que qualquer outra morte por dano de turno.
   */
  pereceu: boolean
}

/**
 * Passa o tempo dos status de UMA entidade. Chamado todo frame; so faz algo
 * quando o relogio de turno dela fecha.
 *
 * NAO aplica o dano no POKE — devolve quanto foi, pro chamador (combatSystem)
 * decidir sobre numero flutuante, morte e loot com o mesmo caminho que ja usa
 * pro resto do dano.
 */
export function tickStatus(rng: Rng, entity: WorldEntity, dt: number, clima: ClimaTipo | null = null): TickDeStatus {
  if (entity.imunidadeDeStatus > 0) {
    entity.imunidadeDeStatus = Math.max(0, entity.imunidadeDeStatus - dt)
  }
  // Heal Block (Fase 12): mesmo padrao de decaimento por dt de
  // `imunidadeDeStatus` acima, so que trava CURA em vez de reaplicacao de
  // status — ver os pontos de checagem em combatSystem#resolveHit.
  if (entity.curaBloqueadaAte && entity.curaBloqueadaAte > 0) {
    entity.curaBloqueadaAte = Math.max(0, entity.curaBloqueadaAte - dt)
  }

  // ESTAGIO DE ATRIBUTO (PH-418): prazo por fonte, em segundos corridos, no
  // mesmo formato dos timers acima e pelo mesmo motivo — o relogio de TURNO
  // desta entidade nao serve, porque o prazo de um buff nao pode depender de
  // quando o POKE age. Fonte que vence sai da lista e o total e recalculado; era
  // aqui que faltava a unica coisa que o modelo antigo nao tinha, o tempo.
  if (entity.estagiosFonte) {
    for (const chave of Object.keys(entity.estagiosFonte) as StatDeEstagio[]) {
      const fontes = entity.estagiosFonte[chave]
      if (!fontes?.length) continue
      const vivas = envelhecerFontes(fontes, dt)
      if (vivas.length === fontes.length) continue // ninguem venceu: nada a reescrever
      if (vivas.length === 0) {
        delete entity.estagiosFonte[chave]
        delete entity.estagios[chave]
        continue
      }
      entity.estagiosFonte[chave] = vivas
      const total = totalDeEstagio(vivas)
      if (total === 0) delete entity.estagios[chave]
      else entity.estagios[chave] = total
    }
  }

  // Escudos (Screens): mesmo padrao de `imunidadeDeStatus` acima — contam em
  // segundos reais, nao em "turnos", entao decrementam todo frame, nao so
  // quando o relogio de turno desta entidade fecha.
  if (entity.escudos) {
    for (const chave of Object.keys(entity.escudos) as (keyof Escudos)[]) {
      const restante = entity.escudos[chave] ?? 0
      if (restante > 0) entity.escudos[chave] = Math.max(0, restante - dt)
    }
  }

  // Timers de lock/disable (Taunt/Spite/Disable/Encore/Torment) — mesma forma
  // que imunidadeDeStatus acima: contam em segundos corridos, fora do
  // relogio de turno, e limpam o id associado quando zeram (senao
  // disabledAbilityId/forcedAbilityId ficariam com um id "morto" penduradas
  // depois do timer acabar).
  if (entity.silenciadoAte && entity.silenciadoAte > 0) {
    entity.silenciadoAte = Math.max(0, entity.silenciadoAte - dt)
  }
  if (entity.disabledAbilityUntil && entity.disabledAbilityUntil > 0) {
    entity.disabledAbilityUntil = Math.max(0, entity.disabledAbilityUntil - dt)
    if (entity.disabledAbilityUntil <= 0) entity.disabledAbilityId = null
  }
  if (entity.forcedAbilityUntil && entity.forcedAbilityUntil > 0) {
    entity.forcedAbilityUntil = Math.max(0, entity.forcedAbilityUntil - dt)
    if (entity.forcedAbilityUntil <= 0) entity.forcedAbilityId = null
  }
  if (entity.tormentedUntil && entity.tormentedUntil > 0) {
    entity.tormentedUntil = Math.max(0, entity.tormentedUntil - dt)
  }
  // PRESO (PH-72): mesmo formato dos timers acima — segundos corridos. O DANO
  // por turno fica junto do resto do tick volatil (leech_seed e companhia), mais
  // abaixo, porque ele depende do relogio de TURNO, nao do de frame.
  if (entity.presoAte && entity.presoAte > 0) {
    entity.presoAte = Math.max(0, entity.presoAte - dt)
  }

  entity.proximoTurnoDeStatus -= dt
  // EPSILON, e nao `> 0`: dez frames de 0.2s somam 1.9999999999999998, nao 2.
  // Sem a folga, um turno que fecha exatamente no fim de um frame escorrega
  // pro frame seguinte por causa de um erro de ponto flutuante — inofensivo
  // num tick, mas e o tipo de coisa que faz um teste de "quantos turnos ate
  // acordar" falhar de forma intermitente.
  if (entity.proximoTurnoDeStatus > 1e-9) return { dano: 0, expirados: [], pereceu: false }
  entity.proximoTurnoDeStatus += TURNO_SEGUNDOS

  const expirados: StatusCondition[] = []
  let dano = 0

  const nv = statusNaoVolatil(entity)
  if (nv) {
    // Poison Heal (Fase 12): em vez de tomar o dano de veneno por turno, CURA
    // a mesma fracao. Nao entra no `dano` reportado — o chamador
    // (combatSystem) so aplica dano de verdade, entao a cura acontece direto
    // aqui, no HP do proprio POKE.
    if (nv.tipo === 'poison' && traitDoPoke(entity.poke) === 'poison_heal') {
      const cura = danoPorTurno(nv.tipo, entity.poke.stats.hp)
      entity.poke.hp = Math.min(entity.poke.stats.hp, entity.poke.hp + cura)
    } else {
      dano += danoPorTurno(nv.tipo, entity.poke.stats.hp)
    }

    // Congelamento nao tem contador: e um sorteio por turno. Sono tem.
    const chanceDeSair = chanceDeDescongelar(nv.tipo)
    if (chanceDeSair > 0) {
      if (nextFloat(rng) < chanceDeSair) {
        entity.poke.status = null
        expirados.push(nv.tipo)
      }
    } else if (nv.turnosRestantes != null) {
      // EARLY BIRD: o sono passa em METADE dos turnos. Implementado como
      // "descontar 2 por turno" e nao como "metade da duracao no momento em que
      // o sono pega": assim a habilidade vale mesmo se o POKE for trocado por
      // uma que a tenha no meio do sono, e o numero na tela continua sendo o
      // que falta de verdade.
      const passo = nv.tipo === 'sleep' && traitDoPoke(entity.poke) === TRAIT_EARLY_BIRD ? 2 : 1
      nv.turnosRestantes -= passo
      if (nv.turnosRestantes <= 0) {
        entity.poke.status = null
        expirados.push(nv.tipo)
      }
    }
  }

  // Dano de clima: mesmo tick que ja resolve veneno/queimadura acima, mesmo
  // ponto de soma em `dano` -- combatSystem aplica os dois juntos, num unico
  // `takeDamage`/numero flutuante por turno, igual ao jogo real (granizo e
  // veneno no mesmo turno tiram um numero so, nao dois).
  const traitDaEntidade = traitDoPoke(entity.poke)
  if (clima) {
    const especie = SPECIES[entity.poke.speciesId]
    // Sand Veil, Snow Cloak, Ice Body, Sand Rush, Sand Force e Overcoat citam
    // "protege contra o dano do clima" na propria descricao. Magic Guard entra
    // pela regra geral dela (so dano DIRETO de golpe).
    const imuneAoClima = Boolean(traitDaEntidade && TRAIT_IMUNE_A_DANO_DE_CLIMA.has(traitDaEntidade))
    if (!imuneAoClima) {
      dano += danoDeClimaPorTurno(clima, entity.poke.stats.hp, especie.type, especie.type2)
    }

    // CURA POR CLIMA (Rain Dish, Ice Body, Dry Skin na chuva) e CUSTO POR CLIMA
    // (Solar Power e Dry Skin no sol). A cura entra direto no HP, como
    // Poison Heal acima — `dano` e o agregado que o chamador vai APLICAR, e
    // somar uma cura negativa ali confundiria os dois sinais.
    // `includes` e nao igualdade: Ice Body cura no granizo E na neve (PH-140).
    const cura = traitDaEntidade ? CURA_POR_CLIMA[traitDaEntidade] : undefined
    if (cura && clima && cura.climas.includes(clima)) {
      heal(entity, Math.max(1, Math.round(entity.poke.stats.hp * cura.fracao)))
    }
    const custo = traitDaEntidade ? DANO_POR_CLIMA[traitDaEntidade] : undefined
    if (custo && clima && custo.climas.includes(clima)) {
      dano += Math.max(1, Math.round(entity.poke.stats.hp * custo.fracao))
    }
  }

  // HABILIDADES DE FIM DE TURNO que mexem em status/estagio.
  //
  //   Shed Skin   33% de curar o status nao-volatil
  //   Hydration   cura o status SEMPRE, enquanto chover (nao e chance)
  //   Speed Boost +1 de Velocidade por turno
  //   Moody       +2 num atributo sorteado, -1 em outro
  //
  // Todas depois do bloco de status acima de proposito: curar aqui significa
  // "o turno passou COM o status", que e o que os jogos fazem — o dano de
  // veneno deste turno ja foi contabilizado.
  if (traitDaEntidade && entity.poke.status) {
    const curaPorHydration = traitDaEntidade === TRAIT_HYDRATION && clima === 'chuva'
    const curaPorShedSkin = traitDaEntidade === 'shed_skin' && nextFloat(rng) * 100 < SHED_SKIN_CHANCE
    if (curaPorHydration || curaPorShedSkin) {
      expirados.push(entity.poke.status.tipo)
      entity.poke.status = null
    }
  }
  if (traitDaEntidade === TRAIT_SPEED_BOOST) {
    // `acumula` (PH-418): habilidade de POR TURNO empilha, nao renova — sem isso
    // o Speed Boost congelaria em +1 em vez de subir um degrau a cada turno.
    aplicarEstagioUnico(entity, 'speed', 1, { ...fonteDeTrait(entity, traitDaEntidade)!, acumula: true })
  }
  if (traitDaEntidade === TRAIT_MOODY) {
    // Sobe 2 num atributo sorteado e desce 1 em OUTRO. Os dois sorteios saem da
    // mesma lista de estagios que o resto do motor usa; o segundo exclui o
    // primeiro pra nao subir e descer o mesmo (nos jogos tambem sao distintos).
    const opcoes: StatDeEstagio[] = ['atkFis', 'atkEsp', 'def', 'defEsp', 'speed', 'accuracy', 'evasion']
    const sobe = opcoes[Math.floor(nextFloat(rng) * opcoes.length)]
    const restantes = opcoes.filter((o) => o !== sobe)
    const desce = restantes[Math.floor(nextFloat(rng) * restantes.length)]
    // Mesmo `acumula` do Speed Boost, e pelo mesmo motivo: o Moody age todo
    // turno, e cada turno e uma mudanca nova, nao a repeticao de uma anterior.
    const fonteMoody = { ...fonteDeTrait(entity, traitDaEntidade)!, acumula: true }
    aplicarEstagioUnico(entity, sobe, 2, fonteMoody)
    aplicarEstagioUnico(entity, desce, -1, fonteMoody)
  }

  const vol = entity.statusVolatil
  if (vol && vol.turnosRestantes != null) {
    vol.turnosRestantes -= 1
    if (vol.turnosRestantes <= 0) {
      entity.statusVolatil = null
      expirados.push(vol.tipo)
    }
  }

  // A imunidade de reaplicacao comeca quando o status SAI sozinho, igual a
  // quando sai por item — senao o POKE que acabou de acordar levaria Hypnosis
  // de novo no mesmo instante.
  if (expirados.length) entity.imunidadeDeStatus = SEGUNDOS_DE_IMUNIDADE_APOS_CURA

  // --- Golpes de tick volatil novos (leech_seed/curse/nightmare/ingrain/
  // aqua_ring) --------------------------------------------------------------
  // Mesmo relogio de turno de cima (proximoTurnoDeStatus ja fechou, ou o
  // early-return no topo desta funcao teria saido antes de chegar aqui).
  // Somam no MESMO `dano` agregado que veneno/queimadura ja usa acima —
  // combatSystem aplica tudo junto num unico takeDamage/spawnDamageNumber.
  // CUIDADO se outra fase (clima) tambem mexer em `dano` aqui: somar, nunca
  // substituir.
  let drenoParaOrigem: { sourceId: string; amount: number } | undefined
  if (entity.seeded) {
    const quanto = Math.max(1, Math.round(entity.poke.stats.hp * LEECH_SEED_DRAIN_PERCENT))
    dano += quanto
    drenoParaOrigem = { sourceId: entity.seeded.sourceId, amount: quanto }
  }
  if (entity.curseDot) {
    dano += Math.max(1, Math.round(entity.poke.stats.hp * CURSE_DOT_PERCENT))
  }
  // Nightmare so causa dano ENQUANTO o alvo estiver dormindo — se ele acordar
  // a flag fica ligada (nao precisa limpar), mas simplesmente para de fazer
  // nada, exatamente como pedido.
  if (entity.nightmareDot && entity.poke.status?.tipo === 'sleep') {
    dano += Math.max(1, Math.round(entity.poke.stats.hp * NIGHTMARE_DOT_PERCENT))
  }
  // Ingrain/Aqua Ring (mesmo campo `regenPercent` pros dois): HoT puro, sem
  // dreno de ninguem, cura sempre a propria entidade.
  if (entity.regenPercent) {
    heal(entity, Math.max(1, Math.round(entity.poke.stats.hp * entity.regenPercent)))
  }

  // Yawn (Fase 12): sono ATRASADO em 1 turno. `aplicarStatus` (nao um
  // assignment direto) porque o sono ainda respeita imunidade de trait/
  // reaplicacao no momento em que realmente pega — exatamente como nos jogos,
  // onde o Yawn pode "falhar" se o alvo ganhar outro status entre o uso e o
  // proprio turno de pegar no sono.
  if (entity.yawnTurnos != null) {
    entity.yawnTurnos -= 1
    if (entity.yawnTurnos <= 0) {
      entity.yawnTurnos = null
      aplicarStatus(rng, entity, 'sleep', 100)
    }
  }

  // Perish Song (Fase 12): contador de 3 turnos rodando pros dois lados que
  // estavam em campo quando o golpe foi usado (ver combatSystem#resolveHit).
  // Chegar a 0 mata — o chamador (combatSystem) e quem aplica o dano letal e
  // credita o kill/desmaio, pelo mesmo caminho que qualquer outra morte por
  // dano de turno.
  // MAGIC GUARD: "so sofre dano nao causado diretamente por um golpe" —
  // veneno, queimadura, clima, Leech Seed, Curse, Nightmare e recuo. Zerado
  // AQUI, no fim, e nao em cada somatorio: assim nenhuma fonte nova de dano de
  // turno pode esquecer de consultar a habilidade.
  //
  // Perish Song fica de FORA da protecao (mesma regra dos jogos: e um KO
  // marcado, nao dano) — por isso este ponto vem antes do bloco dele.
  if (traitDaEntidade === TRAIT_SO_DANO_DIRETO) {
    dano = 0
    drenoParaOrigem = undefined
  }

  let pereceu = false
  if (entity.perishCountdown != null) {
    entity.perishCountdown -= 1
    if (entity.perishCountdown <= 0) {
      entity.perishCountdown = null
      pereceu = true
    }
  }

  return { dano, expirados, drenoParaOrigem, pereceu }
}

export type ResultadoDaAcao =
  | { agir: true }
  // `autoDano` so vem na confusao — nos outros o POKE simplesmente perde o
  // turno, sem se machucar.
  | { agir: false; motivo: StatusCondition; autoDano?: number }

/**
 * O POKE consegue agir neste turno?
 *
 * Ordem igual a dos jogos: o status nao-volatil resolve ANTES da confusao —
 * um POKE dormindo nem chega a se atacar de confuso.
 *
 * `calcularAutoDano` e injetado em vez de calculado aqui porque o dano de
 * confusao usa o MESMO pipeline de dano do combate (nivel, Ataque, Defesa),
 * que mora em combatSystem. Reimplementar aqui seria uma segunda formula de
 * dano pra divergir na primeira mudanca de balanceamento.
 */
export function tentarAgir(rng: Rng, entity: WorldEntity, calcularAutoDano: (poder: number) => number): ResultadoDaAcao {
  const nv = statusNaoVolatil(entity)
  if (nv && perdeOTurno(rng, nv)) return { agir: false, motivo: nv.tipo }

  const vol = entity.statusVolatil
  if (vol) {
    const chance = chanceDeSeAtacar(vol.tipo)
    if (chance > 0 && nextFloat(rng) < chance) {
      return { agir: false, motivo: vol.tipo, autoDano: calcularAutoDano(poderDoAutoDano(vol.tipo)) }
    }
  }
  return { agir: true }
}
