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
  natural_cure: 'Cura o status ao TROCAR de POKE. Este jogo nao tem troca em batalha — o POKE ativo so muda quando desmaia.',
  regenerator: 'Recupera HP ao TROCAR de POKE. Mesmo motivo do Natural Cure.',
  imposter: 'Se transforma no oponente ao ENTRAR em campo. Nao ha mecanica de transformacao neste motor.',

  // --- nao existe item equipado -------------------------------------------
  frisk: 'Revela o item que o oponente carrega. Neste jogo POKE nao carrega item.',
  pickpocket: 'Rouba o item de quem encosta. Sem item equipado, nao ha o que roubar.',
  sticky_hold: 'Impede que roubem o item equipado. Sem item equipado, nada a proteger.',
  unburden: 'Dobra a Velocidade depois de gastar o item equipado.',
  gluttony: 'Come a Berry equipada mais cedo. Nao ha Berries neste jogo.',
  harvest: 'Recupera a Berry usada. Mesmo motivo do Gluttony.',
  unnerve: 'Impede o oponente de comer Berries.',

  // --- nao existe aliado em campo (o combate e 1 POKE contra N inimigos) ---
  friend_guard: 'Reduz o dano que os ALIADOS levam. Este jogo tem um POKE seu em campo por vez.',
  healer: 'Cura o status dos ALIADOS. Mesmo motivo do Friend Guard.',
  telepathy: 'Evita o dano de golpes dos ALIADOS.',
  plus: 'Fortalece quando um ALIADO tem Plus ou Minus.',

  // --- nao existe ordem de turno nem prioridade ---------------------------
  prankster: 'Da PRIORIDADE aos golpes de status. Este motor nao tem prioridade de golpe — a ordem sai de cooldown e Velocidade.',
  analytic: 'Fortalece o golpe quando o portador age POR ULTIMO no turno. Nao ha turno com ordem definida aqui.',

  // --- nao existe PP gasto ------------------------------------------------
  pressure: 'Faz o oponente gastar PP dobrado. Neste jogo o PP so define o tempo de recarga do golpe; nao e consumido.',

  // --- nao existe fuga nem prisao do oponente -----------------------------
  run_away: 'Garante a fuga de batalha selvagem. O jogador nunca foge aqui — a caçada e automatica.',
  arena_trap: 'Impede o oponente de fugir. Mesmo motivo: ninguem foge.',
  shadow_tag: 'Impede o oponente de fugir.',
  magnet_pull: 'Impede POKE de ACO de fugir.',
  suction_cups: 'Impede ser expulso de campo por golpe do oponente.',

  // --- nao existe a mecanica citada ---------------------------------------
  cute_charm: 'Pode apaixonar quem encosta. Nao existe condicao de "apaixonado" neste motor.',
  skill_link: 'Faz golpes de 2 a 5 acertos saírem sempre no maximo. Golpe de multiplos acertos nao existe aqui.',
  rivalry: 'Muda o dano conforme o GENERO dos dois POKE. Nao ha genero neste jogo.',
  light_metal: 'Reduz o peso do POKE pela metade. Nenhum golpe daqui usa peso.',
  illuminate: 'Dobra a taxa de encontro selvagem. O spawn deste jogo e por sala e por hunt, nao por POKE em campo.',

  // --- so mostra informacao, e a tela nao tem onde mostrar ----------------
  forewarn: 'Revela o golpe mais forte do oponente ao entrar em campo. Nao ha tela de combate onde caberia esse aviso.',
  anticipation: 'Avisa quando o oponente tem um golpe perigoso. Mesmo motivo do Forewarn.',
  pickup: 'Pode achar um item depois da batalha. O loot deste jogo e por hunt e por inimigo, nao por POKE.',
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
  adaptability: 'O bonus de tipo (STAB) sobe de 1,5x para 2x.',
  aftermath: 'Ao ser derrubado por um golpe de contato, causa 1/4 do HP maximo em quem atacou.',
  analytic: 'Golpes 30% mais fortes quando age por ultimo.',
  anger_point: 'Ao receber um critico, o Ataque Fisico vai ao maximo.',
  anticipation: 'Avisa se o oponente tem um golpe super efetivo ou de KO.',
  arena_trap: 'O oponente nao consegue fugir.',
  battle_armor: 'Nao recebe golpe critico.',
  big_pecks: 'A Defesa nunca e rebaixada pelo oponente.',
  blaze: 'Com 1/3 ou menos do HP, os golpes de FOGO causam 50% a mais.',
  chlorophyll: 'Velocidade DOBRADA sob sol forte.',
  clear_body: 'Nenhum atributo e rebaixado pelo oponente.',
  cloud_nine: 'Anula todos os efeitos do clima, dos dois lados.',
  competitive: 'Cada atributo rebaixado pelo oponente da +2 estagios de Atk Esp.',
  compound_eyes: 'Precisao dos proprios golpes 30% maior.',
  contrary: 'Toda mudanca de atributo no portador e INVERTIDA.',
  cursed_body: '30% de chance de trancar o golpe que acertou o portador.',
  cute_charm: '30% de apaixonar quem encosta.',
  damp: 'Ninguem em campo consegue usar Explosao ou Autodestruicao.',
  defiant: 'Cada atributo rebaixado pelo oponente da +2 estagios de Atk Fis.',
  download: 'Ao entrar em campo, sobe o ataque correspondente a defesa mais fraca do oponente.',
  drizzle: 'Faz chover assim que entra em campo.',
  drought: 'Traz sol forte assim que entra em campo.',
  dry_skin: 'Absorve golpes de AGUA e cura 1/4 do HP. Toma 25% a mais de FOGO. Cura na chuva, sofre no sol.',
  early_bird: 'Acorda em metade do tempo.',
  effect_spore: '30% de envenenar, paralisar ou fazer dormir quem encosta.',
  filter: 'Reduz em 25% o dano de golpes super efetivos.',
  flame_body: '30% de queimar quem encosta.',
  flash_fire: 'Imune a FOGO. Depois de absorver um, os proprios golpes de FOGO causam 50% a mais.',
  forewarn: 'Revela o golpe mais forte do oponente.',
  friend_guard: 'Reduz o dano que os aliados recebem.',
  frisk: 'Revela o item do oponente.',
  gluttony: 'Come a Berry equipada mais cedo.',
  guts: 'Com um status alterado ativo, o Atk Fis sobe 50%.',
  harvest: 'Pode recuperar a Berry usada.',
  healer: 'Pode curar o status dos aliados.',
  honey_gather: 'Pode achar Mel depois da batalha.',
  huge_power: 'Ataque Fisico DOBRADO.',
  hustle: 'Atk Fis 50% maior, com 20% menos de precisao nos golpes fisicos.',
  hydration: 'Cura qualquer status alterado a cada turno enquanto chove.',
  hyper_cutter: 'O Ataque Fisico nunca e rebaixado pelo oponente.',
  ice_body: 'Cura 1/16 do HP por turno no granizo, e nao sofre dano dele.',
  illuminate: 'Dobra a taxa de encontro selvagem.',
  immunity: 'Nao pode ser envenenado.',
  imposter: 'Se transforma no oponente ao entrar em campo.',
  infiltrator: 'Ignora Reflect, Light Screen, Safeguard e Mist do alvo.',
  inner_focus: 'Nunca perde o turno por flinch.',
  insomnia: 'Nao pode dormir.',
  intimidate: 'Ao entrar em campo, baixa 1 estagio do Ataque Fisico do oponente.',
  iron_fist: 'Golpes de soco 20% mais fortes.',
  justified: 'Ao levar um golpe SOMBRIO, ganha +1 de Atk Fis.',
  keen_eye: 'A precisao nunca e rebaixada, e ignora a Evasao do alvo.',
  leaf_guard: 'Imune a status alterado enquanto houver sol forte.',
  levitate: 'Imune a golpes de TERRA.',
  light_metal: 'Peso reduzido a metade.',
  lightning_rod: 'Absorve golpes ELETRICOS e ganha +1 de Atk Esp.',
  limber: 'Nao pode ser paralisado.',
  liquid_ooze: 'Quem drena HP do portador toma o dano em vez de curar.',
  magic_bounce: 'Golpes sem dano voltam para quem os usou.',
  magic_guard: 'So sofre dano DIRETO de golpe — nada de veneno, queimadura, clima ou recuo.',
  magma_armor: 'Nao pode ser congelado.',
  magnet_pull: 'POKE de ACO nao consegue fugir.',
  marvel_scale: 'Com um status alterado ativo, a Defesa sobe 50%.',
  mold_breaker: 'Ignora a habilidade defensiva do alvo.',
  moody: 'A cada turno, +2 estagios num atributo sorteado e -1 em outro.',
  moxie: 'Cada POKE derrubado da +1 de Atk Fis.',
  multiscale: 'Com o HP CHEIO, o dano recebido cai pela metade.',
  natural_cure: 'Cura o status ao trocar de POKE.',
  neutralizing_gas: 'Nenhuma habilidade em campo funciona enquanto o portador estiver la.',
  no_guard: 'Todo golpe acerta — os do portador E os contra ele.',
  oblivious: 'Imune a Provocacao (Taunt) e a atracao.',
  overcoat: 'Nao sofre dano de clima.',
  overgrow: 'Com 1/3 ou menos do HP, os golpes de PLANTA causam 50% a mais.',
  own_tempo: 'Nao pode ficar confuso.',
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
  rivalry: 'O dano muda conforme o genero dos dois POKE.',
  rock_head: 'Nao sofre o recuo dos proprios golpes.',
  run_away: 'Garante a fuga de batalha selvagem.',
  sand_force: 'Na tempestade de areia, golpes de PEDRA, TERRA e ACO ficam 30% mais fortes. Nao sofre dano da areia.',
  sand_rush: 'Velocidade DOBRADA na tempestade de areia, e nao sofre dano dela.',
  sand_stream: 'Levanta uma tempestade de areia assim que entra em campo.',
  sand_veil: 'Evasao 25% maior na tempestade de areia, e nao sofre dano dela.',
  sap_sipper: 'Absorve golpes de PLANTA e ganha +1 de Atk Fis.',
  scrappy: 'Golpes NORMAIS e de LUTA acertam POKE FANTASMA.',
  serene_grace: 'Dobra a chance dos efeitos secundarios dos proprios golpes.',
  shadow_tag: 'O oponente nao consegue fugir.',
  shed_skin: '33% de chance de curar o status alterado a cada turno.',
  sheer_force: 'Golpes com efeito secundario ficam 30% mais fortes, mas perdem o efeito.',
  shell_armor: 'Nao recebe golpe critico.',
  shield_dust: 'Imune aos efeitos secundarios dos golpes recebidos.',
  skill_link: 'Golpes de 2 a 5 acertos saem sempre no maximo.',
  sniper: 'Os criticos do portador causam 50% a mais do que um critico normal.',
  snow_cloak: 'Evasao 25% maior no granizo, e nao sofre dano dele.',
  solar_power: 'Sob sol forte, Atk Esp 50% maior ao custo de 1/8 do HP por turno.',
  soundproof: 'Imune a golpes de som.',
  speed_boost: '+1 estagio de Velocidade a cada turno.',
  static: '30% de paralisar quem encosta.',
  steadfast: 'Cada flinch sofrido da +1 de Velocidade.',
  stench: '10% de causar flinch com qualquer golpe.',
  sticky_hold: 'O item equipado nao pode ser roubado.',
  sturdy: 'Com o HP cheio, sobrevive com 1 HP a um golpe que mataria.',
  suction_cups: 'Nao pode ser expulso de campo.',
  super_luck: '+1 estagio na chance de critico.',
  swarm: 'Com 1/3 ou menos do HP, os golpes de INSETO causam 50% a mais.',
  swift_swim: 'Velocidade DOBRADA na chuva.',
  synchronize: 'Devolve veneno, paralisia e queimadura para quem os aplicou.',
  tangled_feet: 'Evasao DOBRADA enquanto estiver confuso.',
  technician: 'Golpes de ate 60 de poder ficam 50% mais fortes.',
  telepathy: 'Evita o dano de golpes dos aliados.',
  thick_fat: 'Metade do dano de golpes de FOGO e GELO.',
  tinted_lens: 'Golpes pouco efetivos causam o DOBRO.',
  torrent: 'Com 1/3 ou menos do HP, os golpes de AGUA causam 50% a mais.',
  trace: 'Ao entrar em campo, copia a habilidade do oponente ate o fim da batalha.',
  unaware: 'Ignora os estagios de atributo do oponente.',
  unburden: 'Dobra a Velocidade depois de gastar o item equipado.',
  unnerve: 'O oponente nao consegue comer Berries.',
  vital_spirit: 'Nao pode dormir.',
  volt_absorb: 'Absorve golpes ELETRICOS e cura 1/4 do HP.',
  water_absorb: 'Absorve golpes de AGUA e cura 1/4 do HP.',
  water_veil: 'Nao pode ser queimado.',
  weak_armor: 'Ao levar golpe fisico: +2 de Velocidade e -1 de Defesa.',
  wonder_skin: 'Golpes sem dano contra o portador caem para 50% de precisao.',
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
