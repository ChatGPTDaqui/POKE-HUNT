// O que cada habilidade faz, EM PORTUGUES, e se ela de fato funciona aqui.
//
// Tres arquivos, tres papeis, pra nao virar um so de 2.000 linhas:
//   traits.ts        ATRIBUICAO — quem tem qual habilidade (dado gerado)
//   traitEffects.ts  MECANICA   — as tabelas e funcoes puras que o motor le
//   traitInfo.ts     TEXTO      — este, o que o JOGADOR le, e o status de cada uma
//
// POR QUE O TEXTO NAO VEM DO DADO GERADO: o catalogo traz o `short_effect` da
// PokeAPI, em ingles e escrito pra desenvolvedor ("Strengthens moves of 60 base
// power or less to 1.5x their power"). O jogo e em portugues, e uma tabela de
// habilidade que o jogador le precisa dizer o que acontece NESTE jogo — onde
// nao existe troca de POKE, item equipado nem ordem de turno. Traduzir na tela,
// em runtime, alem de impossivel, esconderia justamente as habilidades cuja
// descricao real nao se aplica aqui.
//
// A LISTA DE STATUS E ESCRITA A MAO, DE PROPOSITO. Derivar "esta implementada?"
// procurando a chave no codigo do motor daria falso positivo na primeira vez
// que uma habilidade fosse CITADA sem ser implementada (aconteceu: `imposter`
// aparece em TRACE_NAO_COPIA e uma varredura por texto a marcaria como pronta).
// O teste `traitInfo.test.ts` guarda o outro lado: toda chave daqui existe no
// catalogo, e o catalogo inteiro esta coberto.
import { TRAITS } from './traits'

/**
 * Por que uma habilidade NAO tem efeito neste jogo.
 *
 * Cada entrada e um motivo ESTRUTURAL — algo que o motor nao tem —, nunca
 * "ainda nao deu tempo". Quando um desses buracos for fechado (troca de POKE em
 * batalha, item equipado, ordem de turno), a habilidade correspondente vira
 * trabalho imediato. A lista completa, com o que cada uma exigiria, esta em
 * `docs/14-habilidades.md`.
 */
export const MOTIVO_SEM_EFEITO: Record<string, string> = {
  // --- nao existe troca de POKE em batalha ---------------------------------
  natural_cure: 'Cura o status ao TROCAR de POKE. Este jogo não tem troca em batalha — o POKE ativo só muda quando desmaia.',
  regenerator: 'Recupera HP ao TROCAR de POKE. Mesmo motivo do Natural Cure.',
  imposter: 'Se transforma no oponente ao ENTRAR em campo. Não há mecânica de transformação neste motor.',

  // --- nao existe item equipado -------------------------------------------
  frisk: 'Revela o item que o oponente carrega. Neste jogo POKE não carrega item.',
  pickpocket: 'Rouba o item de quem encosta. Sem item equipado, não há o que roubar.',
  sticky_hold: 'Impede que roubem o item equipado. Sem item equipado, nada a proteger.',
  unburden: 'Dobra a Velocidade depois de gastar o item equipado.',
  gluttony: 'Come a Berry equipada mais cedo. Não há Berries neste jogo.',
  harvest: 'Recupera a Berry usada. Mesmo motivo do Gluttony.',
  unnerve: 'Impede o oponente de comer Berries.',

  // --- nao existe aliado em campo (o combate e 1 POKE contra N inimigos) ---
  friend_guard: 'Reduz o dano que os ALIADOS levam. Este jogo tem um POKE seu em campo por vez.',
  healer: 'Cura o status dos ALIADOS. Mesmo motivo do Friend Guard.',
  telepathy: 'Evita o dano de golpes dos ALIADOS.',
  plus: 'Fortalece quando um ALIADO tem Plus ou Minus.',
  minus: 'Fortalece quando um ALIADO tem Plus ou Minus. Mesmo motivo do Plus.',

  // --- nao existe ordem de turno nem prioridade ---------------------------
  prankster: 'Da PRIORIDADE aos golpes de status. Este motor não tem prioridade de golpe — a ordem sai de cooldown e Velocidade.',
  analytic: 'Fortalece o golpe quando o portador age POR ÚLTIMO no turno. Não há turno com ordem definida aqui.',
  stall: 'Faz o portador agir SEMPRE POR ÚLTIMO. Mesmo motivo do Prankster e do Analytic: não há ordem de turno.',

  // --- nao existe PP gasto ------------------------------------------------
  pressure: 'Faz o oponente gastar PP dobrado. Neste jogo o PP só define o tempo de recarga do golpe; não é consumido.',

  // --- nao existe fuga nem prisao do oponente -----------------------------
  run_away: 'Garante a fuga de batalha selvagem. O jogador nunca foge aqui — a caçada é automática.',
  arena_trap: 'Impede o oponente de fugir. Mesmo motivo: ninguém foge.',
  shadow_tag: 'Impede o oponente de fugir.',
  magnet_pull: 'Impede POKE de AÇO de fugir.',
  suction_cups: 'Impede ser expulso de campo por golpe do oponente.',

  // --- nao existe a mecanica citada ---------------------------------------
  cute_charm: 'Pode apaixonar quem encosta. Não existe condição de "apaixonado" neste motor.',
  skill_link: 'Faz golpes de 2 a 5 acertos saírem sempre no máximo. Golpe de multiplos acertos não existe aqui.',
  rivalry: 'Muda o dano conforme o GÊNERO dos dois POKE. Não há gênero neste jogo.',
  illuminate: 'Dobra a taxa de encontro selvagem. O spawn deste jogo e por sala e por hunt, não por POKE em campo.',

  // --- o TIPO do POKE nao muda em batalha (PH-332) ------------------------
  // As tres mexem no tipo do portador em pleno combate. Aqui o tipo e
  // propriedade da ESPECIE (`SPECIES[id].type`), lida por toda a tabela de
  // efetividade e pela arte; nao existe tipo por INSTANCIA que daria pra
  // reescrever no meio da luta. E a mesma fronteira do Imposter.
  color_change: 'Muda pro tipo do golpe que acabou de acertar. O tipo aqui é da espécie, não da instância — não há o que reescrever em batalha.',
  protean: 'Muda pro tipo do golpe que vai usar. Mesmo motivo do Color Change.',
  normalize: 'Torna todo golpe do portador tipo Normal. Mesmo motivo: a tipagem não é mutável neste motor.',

  // --- nao existe categoria de golpe de VENTO (PH-332) -------------------
  wind_rider: 'Imunidade a golpe de VENTO. O catálogo deste jogo não marca quais golpes são de vento — não há como identificar o gatilho.',

  // --- so mostra informacao, e a tela nao tem onde mostrar ----------------
  forewarn: 'Revela o golpe mais forte do oponente ao entrar em campo. Não há tela de combate onde caberia esse aviso.',
  anticipation: 'Avisa quando o oponente tem um golpe perigoso. Mesmo motivo do Forewarn.',
  pickup: 'Pode achar um item depois da batalha. O loot deste jogo é por hunt e por inimigo, não por POKE.',
  honey_gather: 'Pode achar Mel depois da batalha. Mesmo motivo do Pickup.',
}

/**
 * O que a habilidade faz, na descricao que o jogador le.
 *
 * Escrita a partir do `short_effect` da PokeAPI (o contrato mecanico, ver
 * generated/types.ts#TraitCatalogEntry) e ajustada ao vocabulario deste jogo —
 * "estagio" e nao "stage", "Atk Fis" e nao "Attack", e sem citar mecanica que
 * este motor nao tem. Habilidade sem efeito aqui e descrita PELA REGRA REAL, e
 * o motivo de ela nao valer vem de `MOTIVO_SEM_EFEITO` acima.
 */
// FORA DA TABELA, com motivo: `pure_power` e implementada no motor
// (multiplicadorDeAtaquePorTrait) mas NENHUMA especie deste elenco a tem, entao
// ela nao esta no catalogo gerado. Texto pra habilidade que o jogador nunca vai
// ver e o mesmo defeito que o teste desta tabela existe pra pegar.
export const DESCRICAO_DA_TRAIT: Record<string, string> = {
  adaptability: 'O bônus de tipo (STAB) sobe de 1,5x para 2x.',
  aftermath: 'Ao ser derrubado por um golpe de contato, causa 1/4 do HP máximo em quem atacou.',
  analytic: 'Golpes 30% mais fortes quando age por último.',
  anger_point: 'Ao receber um crítico, o Ataque Físico vai ao máximo.',
  anticipation: 'Avisa se o oponente tem um golpe super efetivo ou de KO.',
  arena_trap: 'O oponente não consegue fugir.',
  battle_armor: 'Não recebe golpe crítico.',
  big_pecks: 'A Defesa nunca é rebaixada pelo oponente.',
  blaze: 'Com 1/3 ou menos do HP, os golpes de FOGO causam 50% a mais.',
  chlorophyll: 'Velocidade DOBRADA sob sol forte.',
  clear_body: 'Nenhum atributo é rebaixado pelo oponente.',
  cloud_nine: 'Anula todos os efeitos do clima, dos dois lados.',
  competitive: 'Cada atributo rebaixado pelo oponente da +2 estágios de Atk Esp.',
  compound_eyes: 'Precisão dos próprios golpes 30% maior.',
  contrary: 'Toda mudança de atributo no portador é INVERTIDA.',
  cursed_body: '30% de chance de trancar o golpe que acertou o portador.',
  cute_charm: '30% de apaixonar quem encosta.',
  damp: 'Ninguém em campo consegue usar Explosão ou Autodestruição.',
  defiant: 'Cada atributo rebaixado pelo oponente da +2 estágios de Atk Fis.',
  download: 'Ao entrar em campo, sobe o ataque correspondente a defesa mais fraca do oponente.',
  drizzle: 'Faz chover assim que entra em campo.',
  drought: 'Traz sol forte assim que entra em campo.',
  dry_skin: 'Absorve golpes de ÁGUA e cura 1/4 do HP. Toma 25% a mais de FOGO. Cura na chuva, sofre no sol.',
  early_bird: 'Acorda em metade do tempo.',
  effect_spore: '30% de envenenar, paralisar ou fazer dormir quem encosta.',
  filter: 'Reduz em 25% o dano de golpes super efetivos.',
  flame_body: '30% de queimar quem encosta.',
  flash_fire: 'Imune a FOGO. Depois de absorver um, os próprios golpes de FOGO causam 50% a mais.',
  forewarn: 'Revela o golpe mais forte do oponente.',
  friend_guard: 'Reduz o dano que os aliados recebem.',
  frisk: 'Revela o item do oponente.',
  gluttony: 'Come a Berry equipada mais cedo.',
  guts: 'Com um status alterado ativo, o Atk Fis sobe 50%.',
  harvest: 'Pode recuperar a Berry usada.',
  healer: 'Pode curar o status dos aliados.',
  honey_gather: 'Pode achar Mel depois da batalha.',
  huge_power: 'Ataque Físico DOBRADO.',
  hustle: 'Atk Fis 50% maior, com 20% menos de precisão nos golpes físicos.',
  hydration: 'Cura qualquer status alterado a cada turno enquanto chove.',
  hyper_cutter: 'O Ataque Físico nunca é rebaixado pelo oponente.',
  ice_body: 'Cura 1/16 do HP por turno no granizo E na neve, e não sofre dano de clima.',
  illuminate: 'Dobra a taxa de encontro selvagem.',
  immunity: 'Não pode ser envenenado.',
  imposter: 'Se transforma no oponente ao entrar em campo.',
  infiltrator: 'Ignora Reflect, Light Screen, Safeguard e Mist do alvo.',
  inner_focus: 'Nunca perde o turno por flinch.',
  insomnia: 'Não pode dormir.',
  intimidate: 'Ao entrar em campo, baixa 1 estágio do Ataque Físico do oponente.',
  iron_fist: 'Golpes de soco 20% mais fortes.',
  justified: 'Ao levar um golpe SOMBRIO, ganha +1 de Atk Fis.',
  keen_eye: 'A precisão nunca é rebaixada, e ignora a Evasão do alvo.',
  leaf_guard: 'Imune a status alterado enquanto houver sol forte.',
  levitate: 'Imune a golpes de TERRA.',
  light_metal: 'Peso reduzido a metade.',
  lightning_rod: 'Absorve golpes ELÉTRICOS e ganha +1 de Atk Esp.',
  limber: 'Não pode ser paralisado.',
  liquid_ooze: 'Quem drena HP do portador toma o dano em vez de curar.',
  magic_bounce: 'Golpes sem dano voltam para quem os usou.',
  magic_guard: 'Só sofre dano DIRETO de golpe — nada de veneno, queimadura, clima ou recuo.',
  magma_armor: 'Não pode ser congelado.',
  magnet_pull: 'POKE de AÇO não consegue fugir.',
  marvel_scale: 'Com um status alterado ativo, a Defesa sobe 50%.',
  mold_breaker: 'Ignora a habilidade defensiva do alvo.',
  moody: 'A cada turno, +2 estágios num atributo sorteado e -1 em outro.',
  moxie: 'Cada POKE derrubado da +1 de Atk Fis.',
  multiscale: 'Com o HP CHEIO, o dano recebido cai pela metade.',
  natural_cure: 'Cura o status ao trocar de POKE.',
  neutralizing_gas: 'Nenhuma habilidade em campo funciona enquanto o portador estiver lá.',
  no_guard: 'Todo golpe acerta — os do portador E os contra ele.',
  oblivious: 'Imune a Provocação (Taunt) e a atração.',
  overcoat: 'Não sofre dano de clima.',
  overgrow: 'Com 1/3 ou menos do HP, os golpes de PLANTA causam 50% a mais.',
  own_tempo: 'Não pode ficar confuso.',
  pickpocket: 'Rouba o item de quem encosta.',
  pickup: 'Pode achar um item depois da batalha.',
  plus: 'Fortalece quando um aliado tem Plus ou Minus.',
  poison_point: '30% de envenenar quem encosta.',
  poison_touch: '30% de envenenar o alvo em golpe de contato.',
  prankster: 'Golpes de status agem com prioridade.',
  pressure: 'O oponente gasta PP dobrado.',
  quick_feet: 'Com um status alterado ativo, a Velocidade sobe 50% e o corte da paralisia e ignorado.',
  rain_dish: 'Cura 1/16 do HP por turno enquanto chove.',
  rattled: 'Ao levar golpe SOMBRIO, FANTASMA ou INSETO, ganha +1 de Velocidade.',
  reckless: 'Golpes de recuo 20% mais fortes.',
  regenerator: 'Recupera 1/3 do HP ao trocar de POKE.',
  rivalry: 'O dano muda conforme o gênero dos dois POKE.',
  rock_head: 'Não sofre o recuo dos próprios golpes.',
  run_away: 'Garante a fuga de batalha selvagem.',
  sand_force: 'Na tempestade de areia, golpes de PEDRA, TERRA e AÇO ficam 30% mais fortes. Não sofre dano da areia.',
  sand_rush: 'Velocidade DOBRADA na tempestade de areia, e não sofre dano dela.',
  sand_stream: 'Levanta uma tempestade de areia assim que entra em campo.',
  sand_veil: 'Evasão 25% maior na tempestade de areia, e não sofre dano dela.',
  sap_sipper: 'Absorve golpes de PLANTA e ganha +1 de Atk Fis.',
  scrappy: 'Golpes NORMAIS e de LUTA acertam POKE FANTASMA.',
  serene_grace: 'Dobra a chance dos efeitos secundários dos próprios golpes.',
  shadow_tag: 'O oponente não consegue fugir.',
  shed_skin: '33% de chance de curar o status alterado a cada turno.',
  sheer_force: 'Golpes com efeito secundário ficam 30% mais fortes, mas perdem o efeito.',
  shell_armor: 'Não recebe golpe crítico.',
  shield_dust: 'Imune aos efeitos secundários dos golpes recebidos.',
  skill_link: 'Golpes de 2 a 5 acertos saem sempre no máximo.',
  sniper: 'Os críticos do portador causam 50% a mais do que um crítico normal.',
  snow_cloak: 'Evasão 25% maior no granizo E na neve, e não sofre dano de clima.',
  solar_power: 'Sob sol forte, Atk Esp 50% maior ao custo de 1/8 do HP por turno.',
  soundproof: 'Imune a golpes de som.',
  speed_boost: '+1 estágio de Velocidade a cada turno.',
  static: '30% de paralisar quem encosta.',
  steadfast: 'Cada flinch sofrido da +1 de Velocidade.',
  stench: '10% de causar flinch com qualquer golpe.',
  sticky_hold: 'O item equipado não pode ser roubado.',
  sturdy: 'Com o HP cheio, sobrevive com 1 HP a um golpe que mataria.',
  suction_cups: 'Não pode ser expulso de campo.',
  super_luck: '+1 estágio na chance de crítico.',
  swarm: 'Com 1/3 ou menos do HP, os golpes de INSETO causam 50% a mais.',
  swift_swim: 'Velocidade DOBRADA na chuva.',
  synchronize: 'Devolve veneno, paralisia e queimadura para quem os aplicou.',
  tangled_feet: 'Evasão DOBRADA enquanto estiver confuso.',
  technician: 'Golpes de até 60 de poder ficam 50% mais fortes.',
  telepathy: 'Evita o dano de golpes dos aliados.',
  thick_fat: 'Metade do dano de golpes de FOGO e GELO.',
  tinted_lens: 'Golpes pouco efetivos causam o DOBRO.',
  torrent: 'Com 1/3 ou menos do HP, os golpes de ÁGUA causam 50% a mais.',
  trace: 'Ao entrar em campo, copia a habilidade do oponente até o fim da batalha.',
  unaware: 'Ignora os estágios de atributo do oponente.',
  unburden: 'Dobra a Velocidade depois de gastar o item equipado.',
  unnerve: 'O oponente não consegue comer Berries.',
  vital_spirit: 'Não pode dormir.',
  volt_absorb: 'Absorve golpes ELÉTRICOS e cura 1/4 do HP.',
  water_absorb: 'Absorve golpes de ÁGUA e cura 1/4 do HP.',
  water_veil: 'Não pode ser queimado.',
  weak_armor: 'Ao levar golpe físico: +2 de Velocidade e -1 de Defesa.',
  wonder_skin: 'Golpes sem dano contra o portador caem para 50% de precisão.',
  // --- As 19 habilidades que entraram com a Geracao III (PH-332) --------
  // Texto do que acontece NESTE jogo. Onde a habilidade nao tem efeito aqui,
  // `MOTIVO_SEM_EFEITO` diz por que — e a ficha do POKE mostra os dois.
  air_lock: 'Anula todos os efeitos do clima, dos dois lados.',
  color_change: 'Muda de tipo pro tipo do golpe que acabou de acertar.',
  forecast: 'Muda de tipo conforme o clima da área.',
  heavy_metal: 'Dobra o próprio peso.',
  minus: 'Atk Esp 50% maior quando um aliado tem Plus ou Minus.',
  normalize: 'Todo golpe do portador passa a contar como tipo Normal.',
  poison_heal: 'Envenenado, CURA 1/8 do HP máximo por turno em vez de perder.',
  protean: 'Muda de tipo pro tipo do golpe que vai usar, antes de usar.',
  pure_power: 'DOBRA o Ataque Físico.',
  rough_skin: 'Machuca quem encosta: 1/8 do HP máximo do atacante.',
  simple: 'Toda mudança de atributo no portador conta em DOBRO.',
  solid_rock: 'Golpe super efetivo causa 25% menos dano.',
  stall: 'Age sempre por último.',
  storm_drain: 'Imune a ÁGUA: em vez de dano, sobe um estágio de Atk Esp.',
  toxic_boost: 'Envenenado, o Ataque Físico sobe 50%.',
  truant: 'Age em turnos ALTERNADOS — descansa um turno a cada golpe.',
  white_smoke: 'Nenhum atributo é rebaixado pelo oponente.',
  wind_rider: 'Imune a golpe de vento, e ganha um estágio de Ataque ao levar um.',
  wonder_guard: 'SÓ golpe super efetivo machuca. Qualquer outro não tira HP.',
}

/** A habilidade tem efeito mecanico neste jogo? */
export function traitEstaAtiva(id: string | null | undefined): boolean {
  return Boolean(id) && !(id! in MOTIVO_SEM_EFEITO)
}

/**
 * A frase que a ficha do POKE e a Wiki mostram. Cai no nome da habilidade
 * quando nao ha descricao — nunca em string vazia, que na tela leria como
 * "esta habilidade nao faz nada".
 */
export function descricaoDaTrait(id: string | null | undefined): string {
  if (!id) return ''
  return DESCRICAO_DA_TRAIT[id] ?? TRAITS[id]?.nome ?? id
}

/** Por que ela nao vale aqui. `null` quando vale. */
export function motivoSemEfeito(id: string | null | undefined): string | null {
  if (!id) return null
  return MOTIVO_SEM_EFEITO[id] ?? null
}
