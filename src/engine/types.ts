// Tipos da arvore de estado EFEMERA de combate (o "world" de main.js) —
// separada de gameStateStore.ts (persistente). Porta js/entities/Entity.js
// (+Player.js/Enemy.js) e js/entities/Effect.js pra dado plano tipado.
//
// Desvio deliberado do original (nao e so traducao de sintaxe, ver plano
// Fase 3->4): no jogo vanilla, `entity.target`/`effect.owner`/
// `pendingHit.attacker`/`pendingHit.target` guardavam REFERENCIA DIRETA a
// outro objeto Entity mutavel. Com o motor rodando dentro de uma store
// Zustand+immer (cada update produz um novo objeto imutavel), guardar uma
// referencia direta arrisca apontar pra uma versao "velha" do objeto depois
// do proximo update. Toda referencia a outra entidade vira **id** (string) +
// lookup no momento do uso (`world.enemies.find(e => e.id === targetId)`) —
// mesma logica, forma diferente de apontar. Ability em pendingHit continua
// referencia direta porque `AbilityDataEntry` e dado estatico (nunca muda
// depois de carregado), sem risco de staleness.
import type { PokeInstance } from '@/data/pokes'
import type { MapDef } from '@/data/maps'
import type { ElementType } from '@/data/generated/types'
import type { Ability } from '@/data/abilities'
import type { ResolvedBattleAnim } from '@/data/battleSprites'
import type { StatusAtivo, EstagiosDeStat } from '@/data/statusEffects'
import type { Rng } from '@/core/rng'

export type EntityState = 'idle' | 'wander' | 'chase' | 'engaged' | 'dead'
export type AttackAnimKind = 'Shoot' | 'Charge'

// Escudos ("Screens"): Reflect/Light Screen/Safeguard/Mist/Lucky Chant/Wide
// Guard. Cada valor e segundos restantes (mesmo padrao de `imunidadeDeStatus`
// abaixo) — ausente ou 0 = inativo. Volateis pelo mesmo motivo de
// `estagios`/`statusVolatil`: nos jogos zeram quando o POKE sai de campo, e a
// entidade e o que e recriado a cada troca de cena.
export interface Escudos {
  reflect?: number
  lightScreen?: number
  safeguard?: number
  mist?: number
  luckyChant?: number
  wideGuard?: number
}

export interface Point {
  x: number
  y: number
}

export interface DamageRecord {
  amount: number
  age: number
}

export interface EffectLaneClaim {
  id: string
  lane: number
  size: number
}

// Campos compartilhados por Player e Enemy (era a classe base Entity).
export interface BaseEntity {
  id: string
  poke: PokeInstance
  x: number
  y: number
  facing: Point
  radius: number
  state: EntityState
  cooldowns: Record<string, number>
  globalCooldown: number
  targetId: string | null // era `target` (referencia direta), ver nota do topo
  deathHandled: boolean
  flashTimer: number
  // Lido por Counter (fisico) / Mirror Coat (especial) pra refletir 2x o
  // ultimo dano daquela categoria — ver CombatSystem.js#counterDamage.
  lastDamageTaken: { physical: DamageRecord; special: DamageRecord }
  battleAnim: ResolvedBattleAnim | null
  animFrame: number
  animElapsed: number
  attackAnim: AttackAnimKind | null
  attackAnimTimer: number
  effectLanes: EffectLaneClaim[]
  pathWaypoints: Point[] | null
  pathIndex: number
  pathRecalcTimer: number
  pathTargetX: number | null
  pathTargetY: number | null
  /**
   * Segundos seguidos em que `slideToward` nao conseguiu mover nada (os 3
   * jeitos — diagonal, so X, so Y — cairam em celula bloqueada). Bug real
   * achado testando body-block com geometria irregular (o abismo):
   * `hasLineOfSight` amostra a cada meia celula e pode pular uma parede
   * fina entre duas amostras, entao "linha limpa" as vezes mente pro
   * slide, que fica preso pra sempre num canto concavo sem tentar de
   * novo — o mesmo (tx,ty) recalculado da EXATAMENTE o mesmo resultado.
   * Ver movementSystem.ts#moveToward.
   */
  pathStuckSeconds: number

  // --- Marcadores visuais de cura -------------------------------------------
  // Segundos que ainda faltam pra faisca de cura terminar de tocar sobre o
  // corpo. Sao TIMERS NA ENTIDADE, e nao `WorldEffect` como o resto do VFX,
  // por um motivo concreto: cura acontece em nove lugares diferentes
  // (poção, dreno, Wish, Ingrain, Water Absorb, Poison Heal, ...) e a
  // maioria deles so tem a entidade em maos, nao o `world` — enfileirar um
  // efeito exigiria passar `world.effects`/`world.counters` por toda essa
  // cadeia. Marcados aqui, `heal()`/`curarStatus()` cobrem TODA fonte de uma
  // vez, que e exatamente o pedido ("curado por qualquer fonte").
  // Descontados em animationSystem#tickAttackAnimTimers. Ausente = nao esta
  // tocando.
  vfxCuraHp?: number
  vfxCuraStatus?: number

  // --- Status ---------------------------------------------------------------
  // O status NAO-VOLATIL (veneno, queimadura, paralisia, sono, congelamento)
  // mora no `poke`, nao aqui: ele sobrevive a hunt e vai pro banco, como nos
  // jogos, onde so o Centro Pokemon ou um item tira.
  //
  // A CONFUSAO mora aqui porque e VOLATIL: nos jogos ela some quando o POKE
  // sai de campo ou a batalha acaba. Como este combate nao acaba, o analogo e
  // a entidade — que e recriada a cada troca de cena.
  statusVolatil: StatusAtivo | null
  // Estagios de atributo (-6 a +6). Volateis pelo mesmo motivo da confusao:
  // nos jogos zeram quando o POKE sai de campo, e a entidade e o que e
  // recriado a cada troca de cena. Ausente = estagio 0 (multiplicador 1).
  estagios: EstagiosDeStat
  // Foresight/Miracle Eye: remove UMA imunidade de tipo especifica deste alvo
  // (Fantasma vs Normal/Lutador, ou Sombrio vs Psiquico) e ignora o estagio de
  // evasao dele, pelo resto da luta — sem timer, so `limparEstadoVolatil` tira.
  // Ausente = nenhuma das duas foi usada nele ainda.
  revelado?: 'ghost' | 'dark'
  // Contador PARALELO de estagio de critico (Focus Energy). NAO reaproveita
  // `estagios`/StatChange porque aqueles sao presos aos 5 stats do catalogo
  // gerado (+ accuracy/evasion, ja mesclado) — critico nao e um desses stats.
  // Sem timer proprio: persiste ate fim de luta, igual `estagios`. Ausente =
  // 0 estagios extra. Volatil pelo mesmo motivo de `estagios`: zerado em
  // `limparEstadoVolatil`.
  estagioDeCritico?: number
  // Flag de uso unico (Laser Focus): o PROXIMO golpe de DANO que esta entidade
  // usar sai critico garantido (ver computeDamage), e a flag e consumida
  // (volta a false) nesse momento. Golpe de status nao consome. Tambem
  // zerada em `limparEstadoVolatil` no fim de luta (nao deve sobreviver pra
  // proxima).
  proximoGolpeCriticoGarantido?: boolean
  // Segundos restantes de imunidade a novo status, contados depois que um
  // status sai (cura ou fim natural). Desvio aprovado, ver
  // scripts/usum/status.json#reaplicacao.
  imunidadeDeStatus: number
  // Quanto falta pro proximo "turno" de status deste POKE (dano de veneno,
  // contador de sono, roll de descongelar). Conta separado do cooldown de
  // acao: um POKE dormindo nao age, mas o sono precisa continuar passando.
  proximoTurnoDeStatus: number
  // Ver `Escudos` acima. Opcional porque nem toda entidade chega a usar um
  // golpe de Screen numa hunt — evita inicializar mais um objeto por entidade
  // criada quando nenhuma delas nunca vai usar.
  escudos?: Escudos
  // Imunidade de TIPO temporaria concedida por um golpe (hoje so Magnet Rise,
  // self-target: tipo='GROUND'). Diferente de `revelado` (que so IGNORA uma
  // imunidade natural), este campo CRIA uma — ver
  // combatSystem.ts#resolverImunidadeDeTipo. `restante` conta em segundos e
  // desce em entity.ts#tickCooldowns, que zera o campo quando acaba. Ausente =
  // nao esta imune a nenhum tipo por golpe agora.
  imuneAoTipoVolatil?: { tipo: ElementType; restante: number }
  // Trait Flash Fire: liga quando este POKE absorve um golpe FIRE (ver
  // resolverImunidadeDeTipo) e da +50% de dano aos PROPRIOS golpes FIRE dali
  // em diante. Permanente-ate-fim-de-luta, como os jogos — sem timer, so
  // `limparEstadoVolatil` desliga.
  flashFireAtivo?: boolean

  // --- Lock/disable (Taunt/Spite/Disable/Encore/Torment) --------------------
  // Ultimo golpe (nao-Ataque-Basico) que esta entidade escolheu e executou.
  // Spite/Disable/Encore agem sobre "o golpe que o alvo acabou de usar" — sem
  // isto nao ha o que travar/forcar/punir. Null enquanto a entidade nao usou
  // nenhum golpe ainda (o efeito falha nesse caso, ver combatSystem#resolveHit).
  lastUsedAbilityId?: string | null
  // Taunt: segundos restantes de silencio. Enquanto > 0, pickAbility pula
  // inteiro o bloco de golpe de status e vai direto pro golpe de dano.
  silenciadoAte?: number
  // Disable: golpe especifico travado + segundos restantes. Enquanto o timer
  // e > 0, esse id fica fora dos candidatos de pickAbility (mesmo ponto de
  // filtro que golpe permanentemente desligado pelo jogador via config).
  disabledAbilityId?: string | null
  disabledAbilityUntil?: number
  // Encore: golpe forcado + segundos restantes. Enquanto o timer e > 0,
  // pickAbility so pode escolher este id (cai pro Ataque Basico se ele
  // estiver em cooldown no momento).
  forcedAbilityId?: string | null
  forcedAbilityUntil?: number
  // Torment: segundos restantes. Enquanto > 0, pickAbility exclui
  // `lastUsedAbilityId` dos candidatos, recalculado a cada escolha (nunca
  // deixa repetir o golpe anterior, mas qual foi o anterior muda a cada turno).
  tormentedUntil?: number
  // Proximo indice a tentar em `poke.activeAbilities` (fila do jogador, na
  // ordem que ele escolheu). So avanca quando um golpe da fila E de fato
  // usado — pular por cooldown/filtro NAO avanca, pra tentar o mesmo golpe de
  // novo no proximo turno em vez de "perder a vez dele" pra sempre.
  filaGolpeIndex?: number

  // --- Golpes de tick volatil (leech_seed/curse/nightmare/ingrain/aqua_ring) -
  // Mesma familia do statusVolatil/estagios acima: nascem no combate, morrem
  // no fim dele (ver limparEstadoVolatil em statusSystem.ts) ou quando o
  // portador desmaia. Tickados dentro de tickStatus, no MESMO relogio de
  // proximoTurnoDeStatus (ver systems/statusSystem.ts#tickStatus).
  /** Leech Seed: quem plantou a semente, pra tickStatus saber quem curar. */
  seeded?: { sourceId: string }
  /** Curse (variante Ghost): 1/4 do HP MAXIMO por turno, sem timer. */
  curseDot?: boolean
  /** Nightmare: 1/4 do HP MAXIMO por turno, SO enquanto o alvo estiver com status sleep. */
  nightmareDot?: boolean
  /** Ingrain/Aqua Ring (mesmo campo pros dois): fracao do HP MAXIMO curada por turno (1/16). */
  regenPercent?: number
  /**
   * PRESO (PH-72): Wrap/Bind/Fire Spin/Clamp/Whirlpool/Sand Tomb/Infestation.
   * Segundos restantes, no mesmo formato de `silenciadoAte`/`tormentedUntil` (a
   * duracao nasce em turnos e vira segundos por TURNO_SEGUNDOS). Enquanto > 0, o
   * POKE do JOGADOR nao pode ser trocado por outro da equipe.
   *
   * SO ISSO: prender nao causa dano por turno. O campo tambem e setado no
   * selvagem (o efeito do golpe nao olha de que lado o alvo esta), mas ali nao
   * muda nada — selvagem nao tem equipe pra trocar.
   */
  presoAte?: number

  // Guarda contra reaplicar o HOOK DE ENTRADA EM COMBATE (Intimidate/Download/
  // clima automatico — ver combatSystem.ts#resolveEntryHook) todo frame
  // enquanto o estado continua 'engaged'. Ausente/false = ainda nao disparou
  // pra esta "entrada em campo". Reseta pra false quando a entidade desengaja
  // (ver updateCombat e limparEstadoVolatil) — a proxima vez que reengajar, o
  // hook dispara de novo, como uma troca de POKE nos jogos reais. Uma
  // entidade NOVA ja nasce com isto undefined, entao nunca precisa de reset
  // manual na criacao.
  entradaProcessada?: boolean

  // --- Fase 12: golpes sem-dano e Traits passivas ----------------------------
  // Todos volateis (fim de batalha limpa, ver statusSystem#limparEstadoVolatil)
  // e todos opcionais: entidade que nunca usou/recebeu o efeito correspondente
  // simplesmente nao tem o campo.
  /**
   * Endure usado neste turno: sobrevive com 1 HP se o PROXIMO golpe recebido
   * mataria. Consumida nesse hit — mate ele ou nao — depois volta a false.
   */
  enduraAtiva?: boolean
  /**
   * Quantas vezes SEGUIDAS um golpe de protecao (Protect/Detect/Endure) ja
   * funcionou nesta entidade.
   *
   * REGRA REAL (Gen V+): cada uso consecutivo bem-sucedido tem METADE da chance
   * do anterior — 100%, 50%, 25%, 12,5%. Usar qualquer outro golpe zera.
   *
   * POR QUE ISTO EXISTE, e o bug que ele fecha: sem a regra, um selvagem com
   * Endure fica em 1 de HP para sempre. Endure recarrega em 4s e o POKE do
   * jogador ataca a cada ~2-3s, entao o hit que mataria caia em cima da flag
   * quase toda vez. Relatado pelo usuario como "o Kangaskhan ficava com a vida
   * vazia e nao morria por minutos"; medido depois num duelo controlado.
   *
   * Nao e PP: o PP deste jogo e a base do COOLDOWN e nada mais. A regra que
   * equilibra protecao nos jogos reais e esta, nao o PP.
   */
  protecoesSeguidas?: number
  /**
   * A habilidade que este POKE tinha ANTES de TRACE sobrescrever `poke.trait`.
   *
   * Trace grava no proprio POKE porque todo o motor le a habilidade de la — e
   * o POKE do jogador e GRAVADO no banco pelo snapshot da sessao de hunt. Sem
   * este backup, um Porygon que copiou Intimidate de um Gyarados sairia da
   * hunt sendo um Porygon com Intimidate, permanentemente, e nada no jogo
   * explicaria por que. `limparEstadoVolatil` (fim de batalha) devolve o valor.
   *
   * `null` e valor legitimo aqui: significa "o POKE nao tinha habilidade
   * gravada", diferente de `undefined`, que significa "Trace nao rodou".
   */
  traitOriginal?: string | null
  /**
   * Protect/Detect ativo: bloqueia o proximo golpe recebido que realmente mire
   * nesta entidade (golpe de auto-alvo, tipo Danca das Espadas ou Recover,
   * ignora — ver combatSystem#golpeAtingeOAlvo). Consumida no hit bloqueado.
   */
  protegida?: boolean
  /**
   * Destiny Bond primado neste turno: se esta entidade morrer enquanto isto
   * for true, quem a matou tambem morre.
   */
  destinyBondAtiva?: boolean
  /**
   * Segundos restantes de Heal Block: golpe de cura ou dreno positivo nao faz
   * nada enquanto isto for > 0. Mesmo padrao de decaimento por dt que
   * `imunidadeDeStatus`, so que trava cura em vez de reaplicacao de status.
   */
  curaBloqueadaAte?: number
  /**
   * Id do alvo contra quem o PROXIMO ataque desta entidade acerta garantido
   * (Lock-On/Mind Reader). Consumido no proximo golpe usado contra esse alvo,
   * independente de precisar do sorteio de precisao.
   */
  miraGarantidaAlvoId?: string | null
  /**
   * Tipo que Soak forcou sobre esta entidade. Usado NO LUGAR do tipo da
   * especie so pro calculo de efetividade do dano que ela RECEBE — nao mexe
   * em STAB nem em imunidade de status.
   */
  tipoForcado?: ElementType
  /**
   * Turnos restantes ate a Cancao da Perdicao matar esta entidade
   * (Perish Song). `null`/ausente = sem contador ativo.
   */
  perishCountdown?: number | null
  /**
   * Turnos restantes ate o sono atrasado de Yawn pegar. `null`/ausente = sem
   * Yawn pendente nesta entidade.
   */
  yawnTurnos?: number | null
}

export interface PlayerEntity extends BaseEntity {
  kind: 'player'
  moveSpeed: number
  wanderTarget: Point | null
  wanderPause: number
  fainted: boolean
}

export interface EnemyEntity extends BaseEntity {
  kind: 'enemy'
  encounterId: string
  spawnPoint: Point
  moveSpeed: number
  wanderTarget: Point | null
  wanderPause: number
  aggroRadius: number
  wanderRadius: number
  leashRadius: number
  // Setado por stepWorld apos handleEnemyDefeated — cadaver fica visivel ate
  // o timer zerar (ou pra sempre, se mapDef.keepCorpses).
  deathRemovalTimer: number | null
}

export type WorldEntity = PlayerEntity | EnemyEntity

export type EffectType = 'damageNumber' | 'abilityName' | 'rewardText' | 'abilityEffect' | 'captureAnim'

export interface WorldEffect {
  id: string
  type: EffectType
  x: number
  y: number
  targetX?: number
  targetY?: number
  radius: number
  color: string
  duration: number
  delay: number
  age: number
  value?: number
  effectiveness?: string
  effectivenessLabel?: string
  text?: string
  unit?: string
  isAoe?: boolean
  worldSize?: number
  elementType?: ElementType
  // Id do golpe que criou este efeito. So o desenho usa (data/moveVfx.ts —
  // arte por GOLPE, consultada antes da arte por TIPO); a simulacao nunca le.
  // Existe porque `elementType` nao distingue Bullet Punch de Metal Claw, e os
  // dois desenhariam o mesmo efeito de aco.
  abilityId?: string
  // Angulo (radianos) do ATACANTE para o ALVO, no momento em que o golpe
  // concretizou. So o desenho usa, e so pra arte marcada `direcional` em
  // data/moveVfx.ts: burst radial (todo o lote por tipo elemental) ignora.
  // Fica no efeito, e nao e recalculado na hora de desenhar, porque o efeito
  // sobrevive ao atacante — POKE pode morrer, trocar de alvo ou andar dentro
  // dos 0,35s de vida do impacto, e a arte apontaria pra outro lugar no meio
  // da animacao.
  anguloDeAtaque?: number
  // Presente so em `abilityEffect` de golpe de STATUS (ver data/statusVfx.ts)
  // — troca o burst de impacto normal pela arte de buff/debuff por tipo.
  statusDirection?: 'aumenta' | 'diminui'
  ballItemId?: string
  success?: boolean
  laneSize: number
  ownerId: string | null // era `owner` (referencia direta), ver nota do topo
  lane: number
  // Entidade cuja posicao este efeito ACOMPANHA enquanto vive. Diferente de
  // `ownerId`: aquele e a coluna de TEXTO (numero de dano, nome do golpe) e
  // reserva uma raia; este so arrasta a arte junto com o POKE e nao reserva
  // nada. Sem ele a arte do golpe fica congelada onde a entidade estava no
  // instante do impacto e, como o efeito dura 1,0-1,2s, ela descola de quem
  // esta andando (ver o laco de tick de efeitos em combatSystem.ts).
  seguirId?: string
  // Posicao da entidade seguida no ultimo tick. O laco translada o efeito pelo
  // DESLOCAMENTO dela (nao reancorando por offset fixo) pra nao precisar saber
  // o que cada campo de coordenada significa em cada tipo de efeito: `x`/`y` e
  // `targetX`/`targetY` andam juntos, seja qual for a folga que o call-site
  // tenha somado. Se a entidade sumir do mundo antes do fim, o efeito
  // simplesmente para de andar e termina onde estava.
  seguirUltimoX?: number
  seguirUltimoY?: number
  // Entidade pra qual o rastro continua APONTANDO enquanto o efeito vive — o
  // atacante (PH-110). Presente SO em arte direcional: aquela e um risco que
  // liga atacante e alvo, e com o angulo congelado no instante do hit o
  // atacante andar descola o rastro do punho dele. Arte nao direcional nunca
  // recebe este campo, entao o congelamento (decisao registrada no call-site)
  // continua valendo pra ela.
  apontarParaId?: string
}

export interface PendingHit {
  id: string
  timer: number
  attackerId: string
  targetId: string | null // null pra hits isAoeVisual (sem alvo unico, ver combatSystem.ts#queueAoeVisual)
  ability: Ability
  isAoeVisual?: boolean
}

// Fila de Wish (cura atrasada 2 turnos) — MESMO padrao de PendingHit: tick
// down, resolve quando timer<=0, lookup por id (findEntityById) em vez de
// referencia direta. `targetId` guarda o id da ENTIDADE que lancou o golpe
// (world.player ou o enemy), nao o id do poke: world.player mantem o mesmo id
// mesmo trocando de poke ativo por desmaio (ver simulation.ts —
// autoSwitchTeamOnFaint troca `player.poke`, nunca `player.id`).
export interface PendingWish {
  timer: number
  healAmount: number
  targetId: string
}

// UM cooldown so, do TREINADOR — nao um por tipo de item.
//
// Antes eram dois (`pot` e `revive`, 1s cada), o que deixava o bot usar pocao e
// revive no MESMO instante: dois timers independentes nunca se esperam. Com o
// Treinador virando personagem, quem tem o cooldown e ELE: uma mao, um item de
// cada vez.
//
// Poke Ball nao passa por aqui de proposito (decisao explicita): capturar nao
// e curar, e amarrar as duas coisas ao mesmo relogio faria o jogador perder
// capturas por ter tomado uma pocao.
export interface AutoTimers {
  treinador: number
}

// A arvore de estado efemera inteira — reconstruida do zero a cada troca de
// cena (buildHospitalWorld/buildMapWorld no main.js original), nunca
// persistida. `mapDef: null` = cena do Hospital.
// Contadores de id que antes eram `let nextXId = 1` no topo de entity.ts,
// effect.ts e combatSystem.ts. Singleton de modulo nao serve pra um mundo
// reproduzivel: o id passa a depender de quantas cenas o jogador visitou nesta
// aba, e nao do estado do mundo. Isso ja mordeu de verdade duas vezes neste
// projeto (ver "Gotchas conhecidos" no CLAUDE.md: um `import()` extra resetava o
// contador e gerava ids colidindo com os do jogo). Vivendo aqui, sao salvos e
// retomados junto com o resto do mundo.
export interface WorldCounters {
  entity: number
  effect: number
  pendingHit: number
}

/**
 * A sala em que o jogador esta dentro da hunt.
 *
 * Uma hunt tem 10 salas; cada sala e um SUB-BIOMA sorteado do bioma dela, com
 * pool de especies e loot proprios. Ver engine/systems/salaSystem.ts pro
 * porque a condicao de limpeza e quota de abates e nao "zerar o campo".
 */
export interface SalaAtiva {
  /** 0 a SALAS_POR_HUNT-1. */
  indice: number
  /** Chave do sub-bioma (casa com SUB_BIOMA_ESPECIES / data/biomas.ts). */
  chave: string
  abates: number
  /** Quantas voltas completas de 10 salas ja foram fechadas nesta sessao. */
  ciclos: number
}

// Clima de combate (Gen3+): efeito de CAMPO, nao de entidade -- um unico
// valor no WorldState (nao por-lado), afeta jogador e inimigos por igual.
// Golpe novo SOBRESCREVE o clima atual (last-caster-wins, sem empilhar) --
// ver rain_dance/sunny_day/hail/sandstorm em data/abilities.ts#CLIMA_DO_GOLPE.
// Tambem ligado automaticamente por Trait no hook de entrada em combate
// (Drizzle -> chuva, Sand Stream -> areia, Snow Warning -> granizo, Drought ->
// sol — ver combatSystem.ts#resolveEntryHook).
export type ClimaTipo = 'chuva' | 'sol' | 'granizo' | 'areia'

export interface Clima {
  tipo: ClimaTipo
  turnosRestantes: number
}

// Armadilhas de campo do lado INIMIGO (Spikes/Toxic Spikes/Stealth Rock/
// Sticky Web) — setadas pelo JOGADOR usando o golpe correspondente (ver
// combatSystem.ts#resolveHit) e descarregadas no INIMIGO no instante do spawn
// (ver simulation.ts#aplicarHazardsAoInimigo). Contadores, nao booleanos puros,
// porque Spikes empilha ate 3 camadas e Toxic Spikes ate 2.
export interface EnemyHazards {
  spikes: number
  toxicSpikes: number
  stealthRock: boolean
  stickyWeb: boolean
}

export interface WorldState {
  mapDef: MapDef | null
  player: PlayerEntity | null
  enemies: EnemyEntity[]
  effects: WorldEffect[]
  pendingHits: PendingHit[]
  pendingWishes: PendingWish[]
  autoTimers: AutoTimers
  reviveCountdown: number | null
  respawnTimer: number | null
  /**
   * Segundos que faltam pro proximo POKE da equipe entrar em campo depois de
   * um desmaio, nos mapas com `autoSwitchTeamOnFaint` (hoje so a arena do
   * Campeao Lance). Nulo == ninguem esperando.
   *
   * EFEMERO DE PROPOSITO, e o `stepWorld` o REDERIVA em vez de carregar:
   * "jogador desmaiado + alguem vivo no banco" e uma condicao observavel a
   * qualquer momento, entao uma janela de flush que corte no meio da espera
   * so recomeca a contagem na janela seguinte. Carregar o numero exigiria
   * mais um campo em `ProgressoDaSessao` e no payload do servidor, e um
   * esquecimento ali travaria a luta pra sempre — o POKE fica desmaiado em
   * campo e a troca nunca acontece, que e o modo de falha de `sequenceIndex`
   * que `engine/lance.test.ts` existe pra impedir.
   */
  trocaEmCampo: number | null
  sequenceIndex: number
  sequenceCleared: boolean
  countdownRemaining: number | null
  /** Nulo nas hunts sem salas: a inicial, as 11 BOSS e a do Campeao Lance. */
  sala: SalaAtiva | null
  /**
   * Contagem regressiva "Entrando em nova area" (ver
   * engine/systems/salaSystem.ts#registrarAbate/aplicarTransicaoDeSala).
   * Nao nulo == quota de abates da sala atual ja fechou e o jogo esta
   * congelado ate a proxima sala entrar. Efemero de proposito, igual
   * `clima`: nao precisa atravessar reconstrucao de mundo por janela do
   * servidor — se um flush cortar bem no meio dela, a proxima janela so
   * reincide o gatilho no abate seguinte, autocurativo.
   */
  salaCountdownRemaining: number | null
  /** Sala ja sorteada (o "carregamento" adiantado) esperando a contagem
   *  regressiva zerar pra virar `sala` de verdade. */
  salaPendente: SalaAtiva | null
  /**
   * Quem decide a proxima sala e o SERVIDOR — ligado pelo cliente quando ha
   * sessao de hunt aberta (engine/controller.ts#enterMap).
   *
   * Com isto ligado, `registrarAbate` conta o abate e NAO sorteia: a sala
   * seguinte chega no flush, por `reconciliarSalaDaAutoridade`. Desligado (jogo
   * sem servidor, e a propria simulacao do servidor) o sorteio local vale, que e
   * o comportamento de sempre.
   *
   * Efemero como `salaCountdownRemaining`: nao atravessa reconstrucao de mundo
   * por janela — quem reconstroi do lado do servidor e a autoridade, e la ele e
   * false por definicao.
   */
  salaSobAutoridade: boolean
  /**
   * Segundos acumulados com a quota da sala fechada esperando a sala do
   * servidor. Estourando ESPERA_MAXIMA_PELA_AUTORIDADE, a predicao local volta a
   * valer — rede de seguranca pra servidor de versao antiga, ver
   * salaSystem.ts#garantirTransicaoDeQuotaFechada. Zera em toda troca de sala.
   */
  salaEsperaDaAutoridade: number
  /**
   * A sala em vigor saiu do FALLBACK local (a espera acima estourou), e nao da
   * autoridade — ou seja, e palpite que o servidor ainda nao confirmou.
   *
   * Serve pra duas coisas em `salaSystem.ts`, e as duas existem pro mesmo bug:
   * sem elas a predicao passava a frente do servidor pra sempre.
   *
   *  - `reconciliarSalaDaAutoridade` aceita a sala do servidor mesmo em posicao
   *    ANTERIOR enquanto isto estiver ligado. Sem isso, a protecao
   *    anti-regressao (escrita pro caso legitimo de flush atrasado) descartava
   *    todas as salas do servidor dali pra frente.
   *  - `garantirTransicaoDeQuotaFechada` nao arma uma SEGUNDA transicao local
   *    enquanto a primeira nao foi confirmada: o fallback vale por uma sala de
   *    adiantamento, nao por um trilho paralelo.
   *
   * Efemero como os vizinhos: no servidor `salaSobAutoridade` e false e nada
   * aqui e escrito.
   */
  salaPredita: boolean
  // Toda aleatoriedade da simulacao sai daqui. Ver core/rng.ts pro porque e
  // pros limites (isto torna a SEQUENCIA DE SORTEIOS reproduzivel; nao promete
  // replay bit-a-bit de coordenadas entre engines diferentes).
  rng: Rng
  counters: WorldCounters
  // Combate no PIOR CASO, usado so pelo farm offline: variacao de dano no
  // minimo e zero critico. Regra do usuario — offline nunca pode render mais
  // que jogar de verdade.
  //
  // Cobre a RESOLUCAO do combate, e nao o spawn: as duas alavancas aqui so
  // fazem matar mais devagar, entao o resultado e monotonicamente menor. Fixar
  // tambem qual inimigo aparece parecia pessimismo e nao era — ver a nota em
  // simulation.ts#spawnEnemyAt, onde isso deixava a mochila com centenas de
  // copias de uma unica especie e ainda capturava MAIS que o jogo ao vivo.
  //
  // Vive no WorldState (e nao num parametro solto) porque o combate decide no
  // meio de um respawn, longe de quem iniciou a simulacao.
  pessimista: boolean
  // Ver `Clima` acima. `null` = ceu limpo (default). Volatil como
  // estagios/statusVolatil: nao atravessa reconstrucao de mundo (novoMundo
  // nao herda `clima` do `carry`), entao um flush do servidor limpa o clima
  // igual limpa estagio de atributo.
  clima: Clima | null
  // Ver `EnemyHazards` acima. Ausente = nenhuma armadilha plantada ainda.
  // MESMO DESVIO que `clima`: nao atravessa reconstrucao de mundo (fora do
  // `ProgressoDaSessao` que `sala`/`sequenceIndex` usam pra sobreviver ao
  // flush do servidor) — plantar Spikes vale so dentro da MESMA janela de
  // simulacao. Se a persistencia entre flushes vier a importar, precisa
  // entrar em `ProgressoDaSessao` (engine/simulation.ts) explicitamente.
  enemyHazards?: EnemyHazards
}
