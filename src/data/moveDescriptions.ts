import { CLIMA_DO_GOLPE, DANO_SEM_PODER_BASE, OHKO_DESLIGADO } from './abilities'

// Descricao de cada golpe, pro tooltip da barra de habilidades e da aba
// "Golpes" do perfil.
//
// FONTE: os efeitos reais dos golpes em Pokemon Ultra Sun (Geracao VII), que e
// a base de dados do jogo. O texto e escrito aqui em portugues e resumido — nao
// e copia de nenhuma pagina.
//
// A cobertura e 1:1 com `ABILITIES_DATA` e isso e TESTADO
// (src/data/moveDescriptions.test.ts): golpe sem descricao nao quebra nada, so
// deixa o tooltip vazio — o tipo de falha que ninguem nota ate um jogador
// reclamar. Foi assim que a migracao para a Gen VII chegou aqui com 278 golpes
// sem texto e 15 chaves obsoletas (a grafia mudou: `solarbeam` -> `solar_beam`,
// `psychic_m` -> `psychic`, `hi_jump_kick` -> `high_jump_kick`, ...).
//
// AVISO QUE O TOOLTIP MOSTRA JUNTO, E QUE E O PONTO DELICADO DESTE ARQUIVO:
// nem todo golpe de poder 0 e "sem efeito nenhum" — desde a leva de combate
// (clima/traits/escudos/etc, ver docs/03-motor-de-simulacao.md), dezenas de
// golpes de status/suporte TEM efeito real implementado (Taunt trava golpe de
// status do alvo, Leech Seed drena HP, Thunder Wave paraliza, Reflect ergue
// escudo...). `golpeTemEfeitoReal` (abaixo) e quem sabe distinguir os dois
// casos, olhando o mesmo dado/id que o motor de combate usa — por isso
// `AVISO_SEM_DANO` so aparece nos golpes que SAO mesmo inertes aqui (ex:
// Splash, Transform, Sleep Talk — catalogados, sem mecanica nenhuma
// implementada).
// REGRA DO TEXTO, decidida na revisao de 2026-08-21 (PH-71), depois de uma
// auditoria dos 479 golpes contra o dado e contra o motor:
//
//   1. Golpe que CAUSA DANO (ou que tem efeito real) nao mostra aviso nenhum na
//      ficha — nele o texto e a unica informacao que o jogador tem. Ele NAO PODE
//      prometer mecanica que este motor nao tem. 26 textos foram reescritos por
//      esta regra: prometiam confusao no fim (Outrage/Thrash/Petal Dance), dano
//      ao errar (Jump Kick), auto-KO (Explosion/Self-Destruct, que aqui custam
//      metade do HP), prioridade de turno (Sucker Punch), troca de POKE
//      (U-turn/Dragon Tail), item do alvo (Knock Off), veneno que escala
//      (Toxic), dreno "enorme" quando os tres golpes de dreno curam os mesmos
//      50% do dano causado (Mega Drain/Giga Drain)...
//
//   2. Golpe INERTE mantem o texto de sabor do golpe original. Nele a ficha ja
//      estampa AVISO_SEM_DANO logo abaixo ("nao causa dano e nao tem nenhum
//      efeito extra implementado aqui"), que contradiz a promessa de forma
//      explicita. Reescrever os 65 pra "este golpe nao faz nada" apagaria a
//      informacao de que golpe e aquele, sem ganhar nada — o aviso ja e a
//      informacao honesta.
//
//   3. Numero de efeito nao se escreve aqui. Chance de status, estagio de
//      atributo, percentual de dreno, chance de flinch e estagio de critico
//      saem do proprio objeto `Ability`, renderizados por
//      components/shared/AbilityTooltip.tsx#efeitosDoGolpe. Texto a mao nao
//      pode competir com o dado que o motor le: foi assim que a divergencia
//      cresceu sem ninguem notar.
export const AVISO_SEM_DANO =
  'Neste jogo este golpe não causa dano, e não tem nenhum efeito extra implementado aqui.'

// Golpe cujo dano NAO sai do dano base — ele tem `power: 0` no catalogo e o
// numero real vem de uma regra propria (nivel do usuario, HP do alvo, o ultimo
// golpe recebido...). Sem esta linha a ficha mostrava "Dano base 0" e mais nada,
// que le como "golpe fraco" num Seismic Toss que tira o nivel inteiro.
// Guilhotina/Fissura de VERDADE (horn_drill/fissure): a regra existe e mata o
// alvo, mas o golpe esta fora da selecao por balanceamento. Dizer "nao tem efeito
// implementado" neles seria falso; dizer nada deixaria o jogador esperando um
// golpe que nunca sai.
export const AVISO_OHKO_DESLIGADO =
  'Este golpe mata o alvo de uma vez, e por isso está desligado: o POKE nunca vai escolhê-lo.'

export const AVISO_DANO_POR_REGRA_PROPRIA =
  'O dano deste golpe sai de uma regra própria, não do dano base.'

// Golpes de poder 0 cujo efeito e HARDCODED por id em combatSystem.ts (o
// catalogo nao tem coluna pra eles — nada em `Ability` denuncia sozinho que
// fazem algo). MANTER EM SINCRONIA com combatSystem.ts#golpeDeApoioUtil e o
// switch "GOLPES DE SUPORTE SEM DANO" logo depois de resolveHit — cada id
// aqui tem um `case` la que faz algo de verdade quando o golpe e usado.
export const GOLPES_COM_EFEITO_HARDCODED = new Set([
  // trava/lock do oponente
  'taunt', 'torment', 'disable', 'encore', 'spite',
  // dreno/regeneracao continua
  'leech_seed', 'curse', 'nightmare', 'ingrain', 'aqua_ring', 'wish',
  // imunidade temporaria / revela fraqueza natural
  'magnet_rise', 'foresight', 'miracle_eye', 'odor_sleuth',
  // estagio de critico
  'focus_energy', 'laser_focus',
  // "GOLPES DE SUPORTE SEM DANO" (switch dedicado em resolveHit)
  'endure', 'protect', 'detect', 'destiny_bond', 'haze', 'psych_up',
  'pain_split', 'heal_block', 'rest', 'yawn', 'belly_drum', 'acupressure',
  'aromatherapy', 'heal_bell', 'lock_on', 'mind_reader', 'guard_swap',
  'power_swap', 'soak', 'perish_song', 'psycho_shift',
])

// Golpes de escudo (Reflect/Light Screen/Safeguard/Mist/Lucky Chant/Wide
// Guard) — mesmas chaves de combatSystem.ts#ESCUDO_ABILITIES.
export const GOLPES_DE_ESCUDO = new Set([
  'reflect', 'light_screen', 'safeguard', 'mist', 'lucky_chant', 'wide_guard',
])

/**
 * Este golpe tem ALGUM efeito real implementado aqui, mesmo sem causar dano?
 *
 * So decide SE `AVISO_SEM_DANO` aparece — nunca decide nada de combate de
 * verdade (isso continua 100% em combatSystem.ts). Dois jeitos de reconhecer
 * efeito: DADO no proprio golpe (`status`/`statChanges`/`hazard`/
 * `healPercent`/`drainPercent`, que o motor le sem precisar saber o id) ou
 * HARDCODED por id (`GOLPES_COM_EFEITO_HARDCODED`/`GOLPES_DE_ESCUDO`/
 * `CLIMA_DO_GOLPE`, golpes cujo efeito inteiro vive em combatSystem.ts).
 * GOLPE DE DANO FIXO/DINAMICO ENTRA AQUI, por `DANO_SEM_PODER_BASE`. O
 * comentario anterior afirmava o oposto — "eles tem `power > 0` na pratica,
 * entao `semDano` nunca chega a perguntar sobre eles" — e isso era falso: os 11
 * alcancaveis tem `power: 0` no catalogo, cairam no `semDano` e a ficha
 * estampava "este golpe nao causa dano" em Magnitude, Seismic Toss, Dragon Rage,
 * Counter, Mirror Coat, Psywave, Super Fang, Reversal, Flail, Night Shade e
 * Present. Confirmado na tela (ficha do Dugtrio, golpe Magnitude) antes do fix.
 */
export function golpeTemEfeitoReal(ability: {
  id: string
  status?: unknown
  statChanges?: unknown[]
  hazard?: unknown
  healPercent?: number
  drainPercent?: number
}): boolean {
  // PRIMEIRO de todos: golpe que causa dano tem efeito, obviamente. E o unico
  // caminho que nao da pra deduzir do dado do golpe — `power` e 0 nesses.
  if (DANO_SEM_PODER_BASE.has(ability.id)) return true
  // Implementacao existe (FIXED_DAMAGE_ABILITIES), so nao e selecionavel — quem
  // avisa o jogador disso e AVISO_OHKO_DESLIGADO, nao AVISO_SEM_DANO.
  if (OHKO_DESLIGADO.has(ability.id)) return true
  if (ability.status) return true
  if (ability.statChanges && ability.statChanges.length > 0) return true
  if (ability.hazard) return true
  if (ability.healPercent) return true
  if (ability.drainPercent) return true
  if (CLIMA_DO_GOLPE[ability.id]) return true
  if (GOLPES_DE_ESCUDO.has(ability.id)) return true
  return GOLPES_COM_EFEITO_HARDCODED.has(ability.id)
}

export const MOVE_DESCRIPTIONS: Record<string, string> = {
  scratch: 'Arranha o alvo com garras afiadas.',
  growl: 'Um rosnado manhoso que reduz o Ataque de quem ouve.',
  ember: 'Cospe uma pequena chama que pode queimar o alvo.',
  smokescreen: 'Solta fuligem que atrapalha a pontaria do alvo.',
  rage: 'Um ataque movido a pura fúria.',
  scary_face: 'Uma careta assustadora que derruba muito a Velocidade do alvo.',
  flamethrower: 'Um jato intenso de fogo que pode queimar.',
  slash: 'Um corte com garras ou lâmina, com alta chance de crítico.',
  dragon_rage: 'Uma onda de choque de fúria que causa dano fixo.',
  fire_spin: 'Prende o alvo num redemoinho de fogo por vários turnos.',
  tackle: 'Uma investida com o corpo inteiro.',
  tail_whip: 'Balança a cauda pra baixar a guarda do alvo.',
  bubble: 'Dispara bolhas que podem reduzir a Velocidade.',
  withdraw: 'Recolhe-se no casco e aumenta a própria Defesa.',
  water_gun: 'Esguicha água com força contra o alvo.',
  bite: 'Uma mordida com presas afiadas que pode assustar o alvo.',
  rapid_spin: 'Gira em alta velocidade, se livrando de amarras.',
  protect: 'Bloqueia por completo o ataque do turno.',
  rain_dance: 'Faz chover por cinco turnos, fortalecendo golpes de Água.',
  skull_bash: 'Encolhe a cabeça num turno e ataca com força no seguinte.',
  hydro_pump: 'Um jato de água devastador disparado a alta pressão.',
  leech_seed: 'Planta uma semente que rouba HP do alvo a cada turno. Não pega em alvo do tipo Planta, e a semente se solta no fim da luta.',
  vine_whip: 'Chicoteia o alvo com cipós finos.',
  sleep_powder: 'Um pó sonífero que faz o alvo dormir.',
  razor_leaf: 'Lança folhas cortantes; atinge vários inimigos de uma vez.',
  sweet_scent: 'Um aroma doce que derruba a esquiva do alvo.',
  growth: 'Faz o corpo crescer e aumenta o Ataque Especial.',
  synthesis: 'Recupera HP usando a luz do sol.',
  gust: 'Uma rajada de vento levantada pelas asas.',
  powder_snow: 'Um sopro de neve que pode congelar.',
  mist: 'Uma neblina branca que protege dos cortes de atributo.',
  agility: 'Relaxa o corpo e dobra a própria Velocidade.',
  mind_reader: 'Lê os movimentos do alvo: o próximo golpe não erra.',
  ice_beam: 'Um raio de gelo que pode congelar o alvo.',
  reflect: 'Ergue uma barreira que reduz dano físico por cinco turnos.',
  blizzard: 'Uma nevasca brutal que atinge tudo em volta.',
  peck: 'Uma bicada com o bico ou o chifre.',
  thunder_wave: 'Uma onda elétrica fraca que paralisa sem causar dano.',
  detect: 'Prevê o ataque do turno e o esquiva por completo.',
  drill_peck: 'Gira o corpo e perfura o alvo com o bico.',
  light_screen: 'Uma parede de luz que reduz dano especial por cinco turnos.',
  thunder: 'Um raio devastador que pode paralisar.',
  wing_attack: 'Golpeia com as asas totalmente abertas.',
  endure: 'Aguenta qualquer golpe do turno com pelo menos 1 de HP.',
  safeguard: 'Um campo protetor que evita status por cinco turnos.',
  sky_attack: 'Um mergulho aéreo de dois turnos, brutal e impreciso.',
  leer: 'Um olhar intimidador que baixa a Defesa do alvo.',
  roar: 'Um rugido que expulsa o alvo da batalha.',
  quick_attack: 'Um bote tão rápido que quase sempre sai primeiro.',
  spark: 'Uma investida carregada de eletricidade.',
  crunch: 'Uma mordida esmagadora que pode baixar a Defesa Especial.',
  stomp: 'Um pisão pesado que pode fazer o alvo recuar.',
  swagger: 'Provoca o alvo: ele fica confuso, mas com o Ataque dobrado.',
  fire_blast: 'Uma explosão de fogo em forma de estrela.',
  aurora_beam: 'Um feixe em arco-íris que pode enfraquecer o Ataque.',
  mirror_coat: 'Devolve em dobro o último golpe especial recebido.',
  aeroblast: 'Um tornado disparado com precisão cirúrgica.',
  recover: 'Regenera metade do próprio HP máximo.',
  swift: 'Dispara estrelas que nunca erram o alvo.',
  whirlwind: 'Um vendaval que arranca o alvo da batalha.',
  future_sight: 'Concentra energia psíquica que atinge o alvo dois turnos depois.',
  sacred_fire: 'Uma chama sagrada e intensa, com alta chance de queimar.',
  sunny_day: 'Intensifica o sol por cinco turnos, fortalecendo golpes de Fogo.',
  confusion: 'Um ataque psíquico fraco que pode confundir.',
  heal_bell: 'Um sino curativo que limpa o status de toda a equipe.',
  baton_pass: 'Troca de POKE passando adiante as mudanças de atributo.',
  perish_song: 'Quem ouve desmaia em três turnos, inclusive o usuário.',
  disable: 'Tranca o último golpe usado pelo alvo por alguns turnos.',
  barrier: 'Cria uma parede que dobra a própria Defesa.',
  psych_up: 'Copia as mudanças de atributo do alvo.',
  amnesia: 'Esvazia a mente e dobra a Defesa Especial.',
  pound: 'Bate no alvo com as patas dianteiras ou a cauda.',
  transform: 'Copia inteiramente o POKE adversário.',
  mega_punch: 'Um soco de força bruta.',
  metronome: 'Balança o dedo e usa um golpe aleatório qualquer.',
  defense_curl: 'Encolhe-se em bola e aumenta a Defesa.',
  rock_throw: 'Arremessa uma pedra no alvo.',
  magnitude: 'Um tremor de intensidade variável que atinge a área toda.',
  harden: 'Enrijece o corpo e aumenta a Defesa.',
  rollout: 'Rola contra o alvo; fica mais forte a cada acerto seguido.',
  earthquake: 'Um terremoto que atinge tudo por perto.',
  explosion: 'A explosão mais devastadora que existe, ao custo de metade do HP do usuário.',
  fury_attack: 'Espeta o alvo repetidas vezes com chifre ou bico.',
  pursuit: 'Acerta com força dobrada quem tenta trocar de POKE.',
  mirror_move: 'Copia e devolve o último golpe usado pelo alvo.',
  hyper_fang: 'Uma mordida feroz com as presas frontais.',
  focus_energy: 'Concentra-se pra aumentar a chance de acerto crítico.',
  super_fang: 'Uma mordida que corta o HP atual do alvo pela metade.',
  absorb: 'Drena nutrientes: metade do dano vira HP do usuário.',
  stun_spore: 'Espalha esporos que paralisam o alvo.',
  acid: 'Cospe ácido; pode reduzir a Defesa Especial.',
  moonlight: 'Recupera HP com a luz da lua.',
  petal_dance: 'Ataca envolvendo o alvo numa tempestade de pétalas.',
  wrap: 'Enrola o alvo e aperta por vários turnos.',
  slam: 'Bate com força usando a cauda ou uma vinha.',
  barrage: 'Arremessa esferas em série contra o alvo.',
  hypnosis: 'Sugestão hipnótica que faz o alvo dormir.',
  constrict: 'Ataca com tentáculos e pode reduzir a Velocidade.',
  bind: 'Amarra o alvo com o corpo e o esmaga por vários turnos.',
  mega_drain: 'Drena o HP do alvo: metade do dano causado vira HP do usuário.',
  body_slam: 'Joga o corpo inteiro contra o alvo; pode paralisar.',
  splash: 'Se debate sem sair do lugar. Não faz absolutamente nada.',
  cotton_spore: 'Gruda esporos de algodão e derruba muito a Velocidade.',
  giga_drain: 'Drena com força total: metade do dano causado vira HP do usuário.',
  string_shot: 'Amarra o alvo com seda e reduz a Velocidade.',
  supersonic: 'Ondas sonoras estranhas que confundem o alvo.',
  psybeam: 'Um feixe mental peculiar que pode confundir.',
  poison_sting: 'Uma ferroada que pode envenenar.',
  twineedle: 'Duas ferroadas seguidas; podem envenenar.',
  pin_missile: 'Dispara agulhas afiadas de duas a cinco vezes.',
  leech_life: 'Suga o sangue do alvo e converte em HP próprio.',
  spore: 'Esporos que colocam o alvo pra dormir sem falha.',
  foresight: 'Revela o alvo, permitindo acertar quem seria intangível.',
  false_swipe: 'Um corte medido que sempre deixa o alvo com 1 de HP.',
  swords_dance: 'Uma dança frenética que dobra o próprio Ataque.',
  double_team: 'Cria cópias ilusórias e aumenta a esquiva.',
  seismic_toss: 'Arremessa o alvo com dano igual ao nível do usuário.',
  guillotine: 'Uma tesourada mortal: derruba o alvo de uma vez, mas quase sempre erra.',
  submission: 'Arremessa o alvo junto consigo; o usuário também se machuca.',
  comet_punch: 'Uma sequência de socos, de dois a cinco.',
  double_edge: 'Uma investida imprudente que fere também o usuário.',
  night_shade: 'Uma miragem sinistra que causa dano igual ao nível do usuário.',
  fury_swipes: 'Arranha o alvo de duas a cinco vezes seguidas.',
  spider_web: 'Prende o alvo numa teia: ele não pode fugir.',
  screech: 'Um guincho horrível que derruba muito a Defesa do alvo.',
  take_down: 'Uma investida total; o usuário leva parte do dano.',
  bide: 'Aguenta dois turnos e devolve o dobro do dano recebido.',
  spikes: 'Espalha espinhos que ferem quem entrar em campo.',
  metal_claw: 'Um corte com garras de aço; pode elevar o Ataque.',
  horn_attack: 'Chifra o alvo com um chifre pontudo.',
  counter: 'Devolve em dobro o último golpe físico recebido.',
  reversal: 'Quanto menos HP o usuário tem, mais forte o golpe fica.',
  megahorn: 'Uma chifrada brutal com o chifre inteiro.',
  flail: 'Debate-se sem controle; fica mais forte com o HP baixo.',
  haze: 'Uma bruma negra que zera todas as mudanças de atributo.',
  belly_drum: 'Sacrifica metade do HP pra maximizar o Ataque.',
  lock_on: 'Mira com precisão total: o próximo golpe não erra.',
  hyper_beam: 'Um feixe devastador; o usuário precisa se recarregar depois.',
  twister: 'Levanta um tornado que pode fazer o alvo recuar.',
  confuse_ray: 'Uma luz sinistra que confunde o alvo.',
  clamp: 'Prende o alvo com o casco e aperta por vários turnos.',
  curse: 'Efeito diferente para POKE do tipo Fantasma e para os demais.',
  headbutt: 'Uma cabeçada que pode fazer o alvo recuar.',
  rest: 'Dorme por dois turnos e recupera todo o HP e o status.',
  minimize: 'Encolhe o corpo e aumenta muito a esquiva.',
  waterfall: 'Investe contra o alvo com a força de uma cachoeira.',
  horn_drill: 'Perfura com o chifre em rotação: derruba de uma vez, mas quase sempre erra.',
  spike_cannon: 'Dispara espinhos de duas a cinco vezes.',
  crabhammer: 'Martela o alvo com a pinça; alta chance de crítico.',
  sand_attack: 'Joga areia nos olhos e reduz a precisão do alvo.',
  sing: 'Uma canção suave que faz o alvo dormir.',
  pay_day: 'Arremessa moedas: rende dinheiro extra ao fim da batalha.',
  tri_attack: 'Três esferas simultâneas que podem queimar, congelar ou paralisar.',
  lick: 'Uma lambida com a língua comprida; pode paralisar.',
  dizzy_punch: 'Um soco ritmado que pode deixar o alvo confuso.',
  thrash: 'Ataca sem controle nenhum, com força total.',
  conversion: 'Muda o próprio tipo pro tipo de um dos golpes conhecidos.',
  sharpen: 'Deixa o corpo mais anguloso e aumenta o Ataque.',
  zap_cannon: 'Um canhão elétrico que paralisa, mas erra com facilidade.',
  snore: 'Só funciona dormindo: um ronco que pode fazer o alvo recuar.',
  dream_eater: 'Devora o sonho do alvo adormecido e recupera HP.',
  charm: 'Encanta o alvo e derruba muito o Ataque dele.',
  encore: 'Obriga o alvo a repetir o último golpe por vários turnos.',
  sweet_kiss: 'Um beijo adorável que confunde o alvo.',
  glare: 'Um olhar aterrorizante que paralisa.',
  spite: 'Rouba PP do último golpe usado pelo alvo.',
  sketch: 'Copia permanentemente o golpe usado pelo alvo.',
  milk_drink: 'Bebe leite e recupera metade do HP máximo.',
  sandstorm: 'Uma tempestade de areia que fere quem não é Rocha, Terra ou Aço.',
  mimic: 'Copia o último golpe do alvo até o fim da batalha.',
  low_kick: 'Uma rasteira mais forte contra alvos pesados.',
  rock_slide: 'Derruba pedras grandes sobre o alvo; pode fazê-lo recuar.',
  dig: 'Cava no primeiro turno e ataca por baixo no segundo.',
  fissure: 'Abre uma fenda que derruba o alvo de uma vez; quase sempre erra.',
  bone_club: 'Golpeia com um osso na mão; pode fazer o alvo recuar.',
  bonemerang: 'Arremessa o osso, que acerta na ida e na volta.',
  bone_rush: 'Bate com o osso de duas a cinco vezes.',
  flame_wheel: 'Envolve-se em fogo e investe; pode queimar.',
  smog: 'Uma descarga de gases sujos que pode envenenar.',
  fire_punch: 'Um soco em chamas que pode queimar.',
  thunderbolt: 'Um forte choque elétrico que pode paralisar.',
  double_kick: 'Dois chutes seguidos.',
  mean_look: 'Um olhar sombrio que impede o alvo de fugir.',
  poison_gas: 'Uma nuvem de gás tóxico que envenena.',
  sludge: 'Arremessa lodo tóxico; pode envenenar.',
  acid_armor: 'Liquefaz o corpo e aumenta muito a Defesa.',
  sludge_bomb: 'Bombardeia com lodo; boa chance de envenenar.',
  destiny_bond: 'Se o usuário desmaiar, leva o adversário junto.',
  karate_chop: 'Um golpe de mão com alta chance de crítico.',
  cross_chop: 'Dois antebraços cruzados; altíssima chance de crítico.',
  vital_throw: 'Um arremesso que sai por último, mas nunca erra.',
  meditate: 'Desperta o poder adormecido e aumenta o Ataque.',
  rolling_kick: 'Um chute giratório que pode fazer o alvo recuar.',
  jump_kick: 'Um chute dado em pleno salto, com força alta.',
  mega_kick: 'Um chute com toda a força dos músculos.',
  ice_punch: 'Um soco gelado que pode congelar.',
  mach_punch: 'Um soco em velocidade extrema; quase sempre sai primeiro.',
  lovely_kiss: 'Um beijo assustador que faz o alvo dormir.',
  present: 'Entrega um pacote: pode explodir ou curar o alvo.',
  steel_wing: 'Golpeia com asas de aço; pode elevar a própria Defesa.',
  teleport: 'Foge da batalha selvagem instantaneamente.',
  kinesis: 'Entorta uma colher e distrai o alvo, baixando a precisão dele.',
  hidden_power: 'Tipo e força variam conforme o POKE que usa.',
  psywave: 'Uma onda psíquica de força imprevisível.',
  pain_split: 'Soma o HP dos dois e divide igualmente.',
  beat_up: 'Toda a equipe ataca em sequência.',
  outrage: 'Enfurece-se e ataca com força total.',
  octazooka: 'Dispara tinta no rosto do alvo; pode baixar a precisão.',

  // -------------------------------------------------------------------------
  // Golpes que entraram com a base de dados de Pokemon Ultra Sun (Gen VII)
  // -------------------------------------------------------------------------
  // O catalogo saltou de 223 para 486 golpes: os learnsets da Gen VII trazem
  // tudo que as geracoes III-VII adicionaram. Mesma regra do resto do arquivo —
  // texto escrito aqui a partir do efeito REAL do golpe, nao copiado de nenhuma
  // pagina, e `AVISO_SEM_DANO` continua aparecendo sozinho em todo golpe de
  // poder 0 (que agora se declara `category: 'status'` de verdade).
  //
  // Quinze chaves da lista antiga foram REESCRITAS aqui, nao duplicadas: a
  // grafia mudou na fonte nova (`solarbeam` -> `solar_beam`, `psychic_m` ->
  // `psychic`, `hi_jump_kick` -> `high_jump_kick`, ...).
  fire_fang: 'Uma mordida flamejante que pode queimar ou fazer recuar.',
  flame_burst: 'Uma bola de fogo que estoura e respinga nos vizinhos.',
  inferno: 'Envolve o alvo em labaredas intensas e o queima com certeza.',
  water_pulse: 'Uma pulsação de água que pode deixar o alvo confuso.',
  aqua_tail: 'Golpeia com a cauda como uma onda quebrando.',
  iron_defense: 'Endurece o corpo como aço e dobra a própria Defesa.',
  poison_powder: 'Espalha um pó tóxico que envenena quem respira.',
  worry_seed: 'Planta uma semente que troca a habilidade do alvo por Insônia.',
  seed_bomb: 'Arremessa uma semente de casca dura direto no alvo.',
  ice_shard: 'Lasca de gelo lançada em alta velocidade; quase sempre sai primeiro.',
  ancient_power: 'Ergue uma rocha antiga; pode elevar todos os atributos de uma vez.',
  freeze_dry: 'Congela por desidratação — e super efetivo até contra tipo Água.',
  hail: 'Faz cair granizo por cinco turnos, ferindo quem não for de Gelo.',
  tailwind: 'Levanta um vento de cauda que dobra a Velocidade da equipe.',
  roost: 'Pousa e recupera metade do HP máximo.',
  hurricane: 'Um vendaval violento que pode confundir o alvo.',
  sheer_cold: 'Frio absoluto: derruba o alvo de uma vez só, mas quase sempre erra.',
  thunder_shock: 'Um choque elétrico que pode paralisar.',
  pluck: 'Bicada que consome a fruta que o alvo estiver segurando.',
  charge: 'Acumula eletricidade e reforça o próximo golpe elétrico.',
  discharge: 'Descarrega eletricidade em todos ao redor; pode paralisar.',
  magnetic_flux: 'Reorganiza as polaridades e reforça as duas Defesas do usuário.',
  air_slash: 'Corta o ar com uma lâmina de vento; pode fazer o alvo recuar.',
  heat_wave: 'Sopra ar escaldante em todos os oponentes; pode queimar.',
  solar_beam: 'Absorve luz num turno e dispara um feixe potente no seguinte.',
  burn_up: 'Queima tudo que tem de uma vez, num golpe de dano enorme.',
  extrasensory: 'Uma força estranha e invisível; pode fazer o alvo recuar.',
  thunder_fang: 'Uma mordida eletrificada que pode paralisar ou fazer recuar.',
  calm_mind: 'Concentra-se e eleva o Ataque Especial e a Defesa Especial.',
  eruption: 'Uma erupção devastadora — quanto mais HP o usuário tem, mais forte.',

  // As 8 chaves que entraram com as 19 especies de PH-145. `flower_shield`
  // saiu na mesma leva: era o unico golpe que so a Sunflora aprendia, e ela
  // perdeu o bloco de nivel 1 ao ganhar uma pre-evolucao no catalogo.
  egg_bomb: 'Arremessa um ovo enorme com força no alvo.',
  circle_throw: 'Um arremesso circular que joga o alvo pra longe.',
  icicle_crash: 'Despeja grandes pedaços de gelo; pode fazer o alvo hesitar.',
  spotlight: 'Ilumina o alvo e obriga todo mundo a mirar nele neste turno.',
  triple_kick: 'Até três chutes seguidos, cada um mais forte que o anterior.',
  morning_sun: 'Recupera HP; quanto melhor o tempo, mais cura.',
  gravity: 'Aumenta a gravidade por cinco turnos — ninguém consegue flutuar.',
  meteor_mash: 'Um soco em velocidade de meteoro; pode elevar o Ataque.',
  lava_plume: 'Cospe lava em todos ao redor; pode queimar.',
  bubble_beam: 'Um jato de bolhas que pode reduzir a Velocidade.',
  ice_fang: 'Uma mordida congelante que pode congelar ou fazer recuar.',
  weather_ball: 'Muda de tipo e dobra de força conforme o clima.',
  dragon_rush: 'Uma investida aterrorizante de dragão; pode fazer o alvo recuar.',
  punishment: 'Quanto mais o alvo se fortaleceu, mais forte este golpe fica.',
  natural_gift: 'A força e o tipo saem da fruta que o usuário estiver segurando.',
  brave_bird: 'Um mergulho suicida em alta velocidade; o usuário também se machuca.',
  magical_leaf: 'Folhas guiadas por magia que nunca erram o alvo.',
  heal_block: 'Impede o alvo de se curar por vários turnos.',
  healing_wish: 'O usuário desmaia para curar por completo quem entrar no lugar.',
  leaf_storm: 'Uma tempestade de folhas afiadas; derruba o próprio Ataque Especial.',
  laser_focus: 'Concentração total: o próximo golpe sai crítico com certeza.',
  miracle_eye: 'Permite acertar tipos Sombrios com golpes Psíquicos.',
  psycho_cut: 'Lâminas de energia psíquica, com alta chance de crítico.',
  guard_swap: 'Troca com o alvo as alterações de Defesa e Defesa Especial.',
  power_swap: 'Troca com o alvo as alterações de Ataque e Ataque Especial.',
  psychic: 'Uma força telecinética potente; pode baixar a Defesa Especial.',
  aura_sphere: 'Uma esfera de aura que persegue o alvo e nunca erra.',
  me_first: 'Rouba o golpe que o alvo ia usar e o aplica com mais força.',
  psystrike: 'Ataque psíquico que fere pela Defesa física do alvo.',
  reflect_type: 'Copia o tipo do alvo.',
  nasty_plot: 'Trama algo maldoso e dobra o próprio Ataque Especial.',
  mud_sport: 'Espalha lama e enfraquece golpes elétricos por cinco turnos.',
  rock_polish: 'Polir o corpo reduz o atrito e eleva muito a Velocidade.',
  smack_down: 'Uma pedrada certeira, arremessada com força.',
  bulldoze: 'Pisoteia o solo e atinge todos ao redor, baixando a Velocidade.',
  self_destruct: 'O usuário se autodestroi e causa dano enorme em área, ao custo de metade do próprio HP.',
  stealth_rock: 'Espalha pedras flutuantes que ferem quem entrar em campo.',
  rock_blast: 'Atira de duas a cinco pedras seguidas.',
  stone_edge: 'Pedras afiadas atacam por baixo, com alta chance de crítico.',
  aerial_ace: 'Um voo rasante rápido demais para ser desviado — nunca erra.',
  assurance: 'Dobra de força se o alvo já tiver se machucado neste turno.',
  sucker_punch: 'Um golpe traiçoeiro, dado de surpresa.',
  endeavor: 'Iguala o HP do alvo ao do usuário.',
  petal_blizzard: 'Uma ventania de pétalas violentas que atinge todos ao redor.',
  lucky_chant: 'Um encanto que impede críticos contra a equipe.',
  toxic: 'Envenena o alvo com uma toxina forte.',
  moonblast: 'Invoca o poder da lua; pode baixar o Ataque Especial do alvo.',
  grassy_terrain: 'Cobre o campo de grama: cura a cada turno e reforça golpes de Planta.',
  knock_off: 'Um golpe baixo, dado com o alvo desprevenido.',
  gastro_acid: 'Um ácido que anula a habilidade do alvo.',
  poison_jab: 'Uma estocada com ferrão ou tentáculo; pode envenenar.',
  wring_out: 'Torce o alvo com força — quanto mais HP ele tiver, maior o dano.',
  leaf_tornado: 'Um redemoinho de folhas que pode baixar a precisão do alvo.',
  spit_up: 'Cospe de uma vez tudo que foi acumulado com Stockpile.',
  stockpile: 'Acumula energia e eleva as duas Defesas.',
  swallow: 'Engole o que foi acumulado e recupera HP.',
  leaf_blade: 'Corta com uma folha afiada como espada; alta chance de crítico.',
  uproar: 'Faz um estardalhaço por vários turnos e impede que alguém durma.',
  bullet_seed: 'Metralha o alvo com duas a cinco sementes.',
  bestow: 'Entrega ao alvo o item que o usuário estiver segurando.',
  ingrain: 'Cria raízes que curam a cada turno, mas impedem a troca.',
  tickle: 'Faz cócegas no alvo, baixando o Ataque e a Defesa dele.',
  power_whip: 'Chicoteia violentamente com cipós ou tentáculos.',
  aromatherapy: 'Um aroma suave que cura o status de toda a equipe.',
  fairy_wind: 'Levanta um vento encantado contra o alvo.',
  acrobatics: 'Um ataque ágil, dado em pleno ar.',
  rage_powder: 'Espalha um pó irritante que atrai todos os ataques.',
  u_turn: 'Ataca girando o corpo e recua na mesma investida.',
  bounce: 'Salta bem alto e cai sobre o alvo; pode paralisar.',
  memento: 'Derruba muito o Ataque e o Ataque Especial do alvo.',
  grass_whistle: 'Uma melodia agradável que faz o alvo dormir.',
  bug_bite: 'Morde e come a fruta que o alvo estiver segurando.',
  silver_wind: 'Um vento de poeira prateada; pode elevar todos os atributos.',
  bug_buzz: 'Uma onda sonora que pode baixar a Defesa Especial do alvo.',
  captivate: 'Encanta o alvo do sexo oposto e derruba o Ataque Especial dele.',
  quiver_dance: 'Uma dança leve que eleva Ataque Especial, Defesa Especial e Velocidade.',
  venoshock: 'Um líquido tóxico que dobra de força contra alvo envenenado.',
  toxic_spikes: 'Espalha espinhos que envenenam quem entrar em campo.',
  fell_stinger: 'Uma ferroada afiada e certeira.',
  fury_cutter: 'Fica mais forte a cada vez que acerta em sequência.',
  x_scissor: 'Corta o alvo cruzando as garras como uma tesoura.',
  cross_poison: 'Um corte venenoso em X; pode envenenar e tem alta chance de crítico.',
  signal_beam: 'Um feixe sinistro de luz que pode confundir.',
  zen_headbutt: 'Concentra energia na testa e atinge o alvo; pode fazê-lo recuar.',
  poison_fang: 'Uma mordida com presas tóxicas que pode envenenar gravemente.',
  vacuum_wave: 'Um turbilhão de vácuo lançado com os punhos; quase sempre sai primeiro.',
  razor_wind: 'Prepara-se num turno e corta todos os oponentes no seguinte.',
  night_slash: 'Um corte traiçoeiro na primeira brecha; alta chance de crítico.',
  double_hit: 'Golpeia duas vezes seguidas com a cauda ou membro.',
  feint: 'Atravessa proteções como Protect, mas só acerta quem está se protegendo.',
  vice_grip: 'Aperta o alvo com força entre as garras.',
  revenge: 'Dobra de força se o usuário tiver apanhado neste turno.',
  brick_break: 'Um golpe de mão que quebra barreiras como Reflect e Light Screen.',
  storm_throw: 'Um arremesso que sai crítico sempre.',
  superpower: 'Força bruta que derruba o próprio Ataque e a própria Defesa.',
  infestation: 'Prende o alvo por vários turnos, ferindo-o a cada um.',
  shadow_sneak: 'Estica a sombra e ataca por trás; quase sempre sai primeiro.',
  sticky_web: 'Uma teia no chão que reduz a Velocidade de quem entrar.',
  toxic_thread: 'Fios venenosos que envenenam e reduzem a Velocidade.',
  venom_drench: 'Derruba Ataque, Ataque Especial e Velocidade de alvo envenenado.',
  sonic_boom: 'Uma onda de choque que sempre tira exatamente 20 de HP.',
  payback: 'Um golpe de troco, dado com todo o peso do corpo.',
  gyro_ball: 'Um giro violento — quanto mais LENTO o usuário, mais forte.',
  autotomize: 'Descarta partes do corpo, ficando mais leve e muito mais rápido.',
  heavy_slam: 'Esmaga com o próprio peso: quanto mais pesado que o alvo, maior o dano.',
  magnet_rise: 'Levita por magnetismo e fica imune a golpes de Terra.',
  mirror_shot: 'Um feixe refletido do corpo metálico; pode baixar a precisão.',
  bullet_punch: 'Um soco veloz como bala; quase sempre sai primeiro.',
  iron_head: 'Uma cabeçada com a cabeça de aço; pode fazer o alvo recuar.',
  arm_thrust: 'Empurrões de palma em sequência, de duas a cinco vezes.',
  chip_away: 'Ignora as alterações de atributo do alvo.',
  close_combat: 'Luta sem qualquer guarda, derrubando as próprias Defesas.',
  flash_cannon: 'Concentra luz no corpo e dispara; pode baixar a Defesa Especial.',
  water_sport: 'Molha tudo em volta e enfraquece golpes de Fogo por cinco turnos.',
  soak: 'Encharca o alvo e o transforma em tipo Água.',
  wonder_room: 'Troca a Defesa e a Defesa Especial de todos por cinco turnos.',
  aqua_jet: 'Uma investida em alta velocidade; quase sempre sai primeiro.',
  double_slap: 'Uma série de tapas, de duas a cinco vezes seguidas.',
  mud_shot: 'Lança lama no alvo e reduz a Velocidade dele.',
  wake_up_slap: 'Dobra de força contra alvo dormindo, mas o acorda.',
  mud_bomb: 'Uma bola de lama dura; pode baixar a precisão do alvo.',
  acid_spray: 'Um jato corrosivo que derruba muito a Defesa Especial.',
  brine: 'Dobra de força se o alvo estiver com metade do HP ou menos.',
  hex: 'Dobra de força contra alvo com problema de status.',
  sludge_wave: 'Uma onda de lodo que atinge todos ao redor; pode envenenar.',
  yawn: 'Um bocejo contagioso: o alvo adormece no turno seguinte.',
  slack_off: 'Relaxa e recupera metade do HP máximo.',
  heal_pulse: 'Uma onda curativa que devolve metade do HP máximo.',
  icy_wind: 'Um vento gelado que atinge os oponentes e reduz a Velocidade.',
  aqua_ring: 'Um véu de água que cura um pouco a cada turno.',
  dive: 'Mergulha num turno e emerge atacando no seguinte.',
  icicle_spear: 'Dispara de duas a cinco estacas de gelo.',
  razor_shell: 'Corta com uma concha afiada; pode baixar a Defesa do alvo.',
  whirlpool: 'Prende o alvo num redemoinho por vários turnos.',
  shell_smash: 'Quebra a própria casca: ataque e velocidade sobem, defesas caem.',
  wide_guard: 'Protege a equipe inteira de golpes em área por um turno.',
  dragon_pulse: 'Uma onda de choque emitida da boca aberta.',
  dragon_dance: 'Uma dança mística que eleva o Ataque e a Velocidade.',
  camouflage: 'Muda o próprio tipo conforme o terreno.',
  power_gem: 'Dispara luz como se fossem pedras preciosas.',
  cosmic_power: 'Absorve poder do espaço e eleva as duas Defesas.',
  electro_ball: 'Quanto mais rápido o usuário for que o alvo, mais forte.',
  ion_deluge: 'Uma chuva de partículas que transforma golpes Normais em Elétricos.',
  eerie_impulse: 'Um campo estranho que derruba muito o Ataque Especial do alvo.',
  helping_hand: 'Ajuda um aliado e reforça o golpe dele neste turno.',
  play_rough: 'Brinca bruto com o alvo; pode baixar o Ataque dele.',
  hyper_voice: 'Um berro ensurdecedor que atinge todos os oponentes.',
  muddy_water: 'Uma enxurrada de água barrenta; pode baixar a precisão.',
  refresh: 'Descansa e se livra de veneno, paralisia ou queimadura.',
  earth_power: 'Faz o solo tremer sob o alvo; pode baixar a Defesa Especial.',
  gunk_shot: 'Arremessa lixo imundo no alvo; pode envenenar.',
  feather_dance: 'Cobre o alvo de penas e derruba muito o Ataque dele.',
  drill_run: 'Gira o corpo como uma broca; alta chance de crítico.',
  play_nice: 'Faz amizade com o alvo e o deixa sem vontade de lutar.',
  disarming_voice: 'Um grito encantador que nunca erra os oponentes.',
  round: 'Uma canção cortante.',
  fake_out: 'Só funciona no primeiro turno, mas sai primeiro e faz o alvo recuar.',
  feint_attack: 'Aproxima-se com jeitinho e acerta um golpe que nunca erra.',
  taunt: 'Provoca o alvo, que só consegue usar golpes de ataque.',
  air_cutter: 'Lâminas de vento cortam os oponentes; alta chance de crítico.',
  acupressure: 'Pressiona pontos vitais e eleva muito um atributo ao acaso.',
  work_up: 'Anima-se e eleva o Ataque e o Ataque Especial.',
  giga_impact: 'Uma carga total; o usuário precisa recuperar o fôlego depois.',
  covet: 'Aproxima-se com simpatia e rouba o item do alvo.',
  baby_doll_eyes: 'Um olhar meigo que baixa o Ataque do alvo; sai primeiro.',
  last_resort: 'Só pode ser usado depois de todos os outros golpes; muito forte.',
  trump_card: 'Quanto menos PP restar, mais forte o golpe fica.',
  conversion_2: 'Muda de tipo para resistir ao último golpe recebido.',
  recycle: 'Recupera um item já usado nesta batalha.',
  magic_coat: 'Devolve ao remetente golpes de status como Leech Seed e Toxic.',
  sleep_talk: 'Usa um golpe qualquer enquanto dorme.',
  block: 'Fecha a passagem e impede o alvo de fugir.',
  high_horsepower: 'Atropela o alvo com o corpo inteiro, com força total.',
  follow_me: 'Chama a atenção para si e recebe todos os ataques.',
  coil: 'Enrola-se e eleva Ataque, Defesa e precisão.',
  echoed_voice: 'Fica mais forte a cada turno em que e usado seguidamente.',
  psycho_shift: 'Transfere o próprio problema de status para o alvo.',
  synchronoise: 'Uma onda que só machuca quem compartilha um tipo com o usuário.',
  copycat: 'Imita o último golpe usado na batalha.',
  astonish: 'Um grito repentino que pode fazer o alvo recuar.',
  fling: 'Arremessa o item que o usuário segura; a força depende do item.',
  odor_sleuth: 'Identifica o alvo e permite acertar tipos Fantasma com golpes Normais.',
  mud_slap: 'Joga lama no rosto do alvo e baixa a precisão dele.',
  fake_tears: 'Lágrimas de crocodilo que derrubam muito a Defesa Especial.',
  hammer_arm: 'Um golpe de martelo pesado que derruba a própria Velocidade.',
  role_play: 'Imita o alvo e copia a habilidade dele.',
  imprison: 'Impede o alvo de usar golpes que o usuário também conhece.',
  steamroller: 'Enrola-se e atropela; pode fazer o alvo recuar.',
  rock_tomb: 'Atira pedras que prendem o alvo e baixam a Velocidade dele.',
  dragon_breath: 'Um sopro poderoso que pode paralisar.',
  sand_tomb: 'Enterra o alvo em areia movediça por vários turnos.',
  iron_tail: 'Golpeia com a cauda de aço; pode baixar a Defesa do alvo.',
  metal_sound: 'Um guincho metálico horrível que derruba muito a Defesa Especial.',
  sky_drop: 'Leva o alvo para o alto e o solta no turno seguinte.',
  wood_hammer: 'Arremete com o corpo inteiro; o usuário também se machuca.',
  tearful_look: 'Um olhar choroso que tira a vontade de lutar do alvo.',
  head_smash: 'Uma cabeçada suicida; o usuário sofre um recuo enorme.',
  dark_pulse: 'Uma onda de pensamentos sinistros; pode fazer o alvo recuar.',
  crush_claw: 'Rasga com garras duras; pode baixar a Defesa do alvo.',
  stomping_tantrum: 'Um chilique que castiga o chão e o alvo junto.',
  retaliate: 'Um golpe movido a vingança.',
  sky_uppercut: 'Um gancho ascendente que acerta até quem está no ar.',
  flare_blitz: 'Envolve-se em chamas e arremete; o usuário também se queima.',
  extreme_speed: 'Uma investida em velocidade absurda; sai primeiro quase sempre.',
  flame_charge: 'Ataca envolto em chamas e ganha Velocidade.',
  clear_smog: 'Uma fumaça especial que zera as alterações de atributo do alvo.',
  incinerate: 'Uma chama que atinge todos os oponentes em área.',
  nuzzle: 'Esfrega as bochechas elétricas no alvo e o paralisa.',
  wild_charge: 'Uma carga elétrica total; o usuário também se machuca.',
  magnet_bomb: 'Dispara bombas magnéticas que perseguem o alvo e nunca erram.',
  charge_beam: 'Um feixe elétrico que costuma elevar o próprio Ataque Especial.',
  shock_wave: 'Uma descarga rápida e certeira que nunca erra.',
  thunder_punch: 'Um soco eletrificado que pode paralisar.',
  cotton_guard: 'Envolve-se em algodão e eleva enormemente a própria Defesa.',
  belch: 'Um arroto potente — só funciona depois de comer uma fruta.',
  flatter: 'Bajula o alvo: ele fica confuso, mas com o Ataque Especial em alta.',
  quick_guard: 'Protege a equipe de golpes de prioridade por um turno.',
  final_gambit: 'Causa dano igual ao HP que o usuário ainda tinha, ao custo de metade do próprio HP.',
  low_sweep: 'Uma rasteira nas pernas que reduz a Velocidade do alvo.',
  dual_chop: 'Duas cutiladas seguidas com o corpo.',
  bulk_up: 'Contrai os músculos e eleva o Ataque e a Defesa.',
  dynamic_punch: 'Um soco com toda a força que deixa o alvo confuso, mas erra muito.',
  strength: 'Empurra o alvo com toda a força do corpo.',
  high_jump_kick: 'Uma joelhada em salto alto, das mais fortes que existem.',
  blaze_kick: 'Um chute em chamas com alta chance de crítico; pode queimar.',
  focus_punch: 'Concentra-se o turno inteiro; apanhar antes cancela o golpe.',
  heart_stamp: 'Distrai o alvo com fofura e acerta um golpe pesado; pode fazê-lo recuar.',
  avalanche: 'Dobra de força se o usuário tiver apanhado neste turno.',
  stored_power: 'Fica mais forte a cada aumento de atributo que o usuário tiver.',
  ominous_wind: 'Uma rajada sinistra; pode elevar todos os atributos de uma vez.',
  wish: 'Faz um pedido que cura no turno seguinte quem estiver em campo.',
  telekinesis: 'Levanta o alvo no ar, deixando-o incapaz de desviar.',
  ally_switch: 'Troca de lugar com um aliado num piscar de olhos.',
  trick: 'Troca de item com o alvo sem que ele perceba.',
  psyshock: 'Materializa ondas psíquicas que ferem pela Defesa física do alvo.',
  nightmare: 'Da pesadelos a um alvo adormecido, ferindo-o a cada turno.',
  shadow_ball: 'Arremessa uma bola sombria; pode baixar a Defesa Especial.',
  shadow_punch: 'Um soco vindo das sombras que nunca erra.',
  grudge: 'Ao desmaiar, zera o PP do golpe que derrubou o usuário.',
  foul_play: 'Usa a força do PRÓPRIO alvo contra ele.',
  torment: 'Atormenta o alvo, que não pode repetir o mesmo golpe.',
  quash: 'Empurra o alvo para o fim da fila de ação.',
  hone_claws: 'Afia as garras e eleva o Ataque e a precisão.',
  snatch: 'Rouba o efeito do golpe de cura ou de status do alvo.',
  howl: 'Um uivo que anima o usuário e eleva o Ataque.',
  embargo: 'Impede o alvo de usar o item que carrega.',
  dragon_tail: 'Uma rabanada pesada com a cauda.',
  after_you: 'Cede a vez para que o alvo aja logo em seguida.',
  // --- Os 40 golpes que entraram com a Geracao III (PH-332) -------------
  // Escritos aqui, e nao traduzidos do dado gerado, pelo mesmo motivo do
  // resto da tabela: o `short_effect` da PokeAPI e ingles de
  // desenvolvedor e descreve mecanicas que este motor nao tem (troca de
  // POKE, item equipado, ordem de turno). Onde a mecanica real do jogo
  // difere, o texto diz o que ACONTECE AQUI.
  mist_ball: 'Uma bola de neblina que fere e pode baixar o Ataque Especial do alvo.',
  luster_purge: 'Um clarão psíquico que pode baixar a Defesa Especial do alvo.',
  psycho_boost: 'Um golpe psíquico devastador que esgota o próprio Ataque Especial.',
  guard_split: 'Soma as defesas dos dois e divide igual entre eles.',
  power_split: 'Soma os ataques dos dois e divide igual entre eles.',
  power_trick: 'Troca o próprio Ataque pela própria Defesa.',
  origin_pulse: 'Um jorro de água azul em feixes que atinge com força imensa.',
  water_spout: 'Jorra água com toda a força; enfraquece conforme o HP do usuário cai.',
  precipice_blades: 'Lanças de pedra brotam do chão e rasgam o alvo.',
  doom_desire: 'Concentra luz e a solta como um golpe de aço no turno seguinte.',
  fly: 'Voa alto num turno e desce em picada no seguinte.',
  energy_ball: 'Uma esfera de energia da natureza; pode baixar a Defesa Especial.',
  nature_power: 'Usa o golpe que o terreno da hunt oferece.',
  force_palm: 'Uma palmada de choque que pode paralisar.',
  needle_arm: 'Golpeia com braços espinhosos; pode fazê-lo recuar.',
  spiky_shield: 'Bloqueia o ataque do turno e machuca quem tentou encostar.',
  attract: 'Apaixona o alvo, que as vezes não consegue atacar.',
  phantom_force: 'Desaparece num turno e reaparece atacando no seguinte.',
  flash: 'Um clarão que atrapalha a pontaria do alvo.',
  struggle_bug: 'Um contra-ataque de insetos que baixa o Ataque Especial do alvo.',
  tail_glow: 'Acende a cauda e eleva MUITO o próprio Ataque Especial.',
  draining_kiss: 'Um beijo que suga a energia do alvo e cura o usuário.',
  boomburst: 'Uma explosão de som destrutiva que atinge tudo em volta.',
  assist: 'Puxa um golpe de um companheiro de equipe e usa na hora.',
  teeter_dance: 'Uma dança cambaleante que confunde quem está em campo.',
  thief: 'Ataca e leva o item do alvo junto.',
  shadow_claw: 'Garras de sombra com alta chance de crítico.',
  substitute: 'Gasta HP pra criar um boneco que absorve os golpes.',
  magic_room: 'Fecha uma sala em que os itens carregados param de funcionar.',
  dragon_claw: 'Um talho com garras enormes e afiadas.',
  electric_terrain: 'Eletrifica o chão: ninguém no solo consegue dormir.',
  entrainment: 'Faz o alvo dançar junto e copiar a habilidade do usuário.',
  switcheroo: 'Troca o item com o alvo numa velocidade imperceptível.',
  poison_tail: 'Uma rabanada venenosa com alta chance de crítico; pode envenenar.',
  smelling_salts: 'Dobra de força contra alvo paralisado — e cura a paralisia dele.',
  frost_breath: 'Um sopro congelante que sai SEMPRE crítico.',
  ice_ball: 'Rola como uma bola de gelo, ficando mais forte a cada turno.',
  metal_burst: 'Devolve com juros o último golpe que acertou o usuário.',
  will_o_wisp: 'Fogo-fátuo sinistro que queima o alvo.',
  snarl: 'Um berro que baixa o Ataque Especial de quem ouve.',
}
