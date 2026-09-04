// GLOSSARIO — o texto da explicacao flutuante que aparece quando o jogador
// passa o mouse (PC) ou toca o dedo (celular) numa palavra do jogo.
//
// NAO E A WIKI, e nao duplica ela. A Wiki (features/wiki/WikiMenu.tsx) responde
// "como funciona o sistema" em varias telas de JSX; este arquivo responde "o que
// essa palavra quer dizer" em uma a tres frases, do tamanho de uma bolha. Bolha
// com uma pagina de texto dentro nao e lida — o limite curto e a feature.
//
// NUMERO NENHUM ESCRITO A MAO onde existe fonte: NATURE_BONUS, IV_MAX,
// CHANCE_DE_TRAIT_OCULTA, RARITIES e STATUS_RULES entram por import, e o prazo
// em segundos vem de `textoDeEstagioEPrazo` (que deriva de TURNO_SEGUNDOS) — este
// arquivo nao multiplica turno por segundo na mao desde a PH-422. Eles entram por
// import. Mesmo motivo da Wiki ler formula ao vivo: numero copiado envelhece no
// primeiro ajuste de balanceamento e passa a mentir sem quebrar nada.
//
// Verbete ESTATICO (o conceito) fica em GLOSSARIO. Verbete que depende do POKE
// na tela (a natureza DELE, o status DELE) e funcao — ela compoe o conceito com
// os numeros daquele individuo.
import { NATURE_BONUS, NATURE_PENALTY, naturezaDe, type NatureKey } from './natures'
import { IV_MAX, type Caracteristica } from './characteristics'
import { CHANCE_DE_TRAIT_OCULTA, nomeDaTrait } from './traits'
import { descricaoDaTrait, motivoSemEfeito } from './traitInfo'
import { RARITIES, type RarityKey } from './rarity'
import { STAT_LABEL } from './statLabels'
import { formatarPrazoEmTurnos, TEXTO_DE_RITMO_CONTINUO } from './textoDeEstagioEPrazo'
// Os dois numeros do verbete de sala saem daqui, e nao escritos a mao: sao a
// MESMA fonte que o motor usa pra decidir quando a sala vira. Ajustar o ritmo da
// hunt sem tocar no texto e o modo de falha que a regra 3 do cabecalho descreve.
import { ABATES_POR_SALA } from './biomas'
import { SALAS_POR_ESTAGIO } from './estagios'
import {
  SEGUNDOS_DE_IMUNIDADE_APOS_CURA,
  ehVolatil,
  nomeDoStatus,
  regraDoStatus,
  type StatusAtivo,
  type StatusCondition,
} from './statusEffects'
import { typeAdvantages, typeMatchups } from './typeMatchups'
import type { ElementType } from './generated/types'
import type { Species, StatKey } from './pokes'

export interface Verbete {
  /** Cabecalho em negrito da bolha. */
  titulo: string
  /** Um paragrafo por item. Frase curta: a bolha tem ~21em de largura. */
  corpo: string[]
  /** Aba da Wiki que trata do assunto a fundo, quando existe uma. */
  wiki?: string
}

const PCT_NATUREZA = Math.round((NATURE_BONUS - 1) * 100)

// Porcentagem sem casa decimal inutil: 0.05 vira "5%", 0.227 vira "22.7%".
function pct(fracao: number): string {
  const n = fracao * 100
  return `${Number.isInteger(n) ? n : Number(n.toFixed(1))}%`
}

function lista(tipos: ElementType[]): string {
  return tipos.join(', ')
}

// ---------------------------------------------------------------------------
// Verbetes estaticos — o conceito, igual pra qualquer POKE
// ---------------------------------------------------------------------------

export const GLOSSARIO = {
  natureza: {
    titulo: 'Natureza',
    corpo: [
      `Todo POKE nasce com 1 de 25 naturezas. Ela sobe um atributo em ${PCT_NATUREZA}% e desce outro em ${PCT_NATUREZA}% — cinco delas sobem e descem o mesmo, e por isso não mudam nada ("neutra").`,
      'HP nunca é afetado por natureza, em nenhuma das 25.',
      'Não muda nunca: é sorteada no nascimento e vale pro resto da vida daquele POKE.',
    ],
    wiki: 'Pokedex',
  },

  habilidade: {
    titulo: 'Habilidade',
    corpo: [
      'Efeito passivo, sempre ligado — não gasta ação e não precisa ser usado. Cada espécie tem uma lista possível, e o POKE sorteia UMA no nascimento.',
      `Toda espécie tem também uma habilidade OCULTA, com ${pct(CHANCE_DE_TRAIT_OCULTA)} de chance no nascimento.`,
      'Dois POKE da mesma espécie podem ter habilidades diferentes.',
    ],
    wiki: 'Habilidades',
  },

  caracteristica: {
    titulo: 'Característica',
    corpo: [
      'A frase é uma PISTA: aponta qual atributo tem o IV mais alto deste POKE.',
      'Sai só dos IVs — nada é sorteado por cima. Dois POKE com os mesmos IVs têm sempre a mesma frase.',
    ],
    wiki: 'Pokedex',
  },

  iv: {
    titulo: 'IV (valor individual)',
    corpo: [
      `Bônus fixo de nascimento em cada atributo, de 0 a ${IV_MAX}. Quanto mais alto, mais forte o POKE fica em todo nível.`,
      `${IV_MAX} é o teto — um IV nesse valor aparece em verde na ficha.`,
      'Não sobe com nível nem com item: o que nasceu é o que fica.',
    ],
    wiki: 'Pokedex',
  },

  raridade: {
    titulo: 'Raridade',
    corpo: [
      'Sorteio por indivíduo e independente da espécie: qualquer POKE de qualquer espécie pode sair Mythic.',
      'Multiplica os atributos e — muito mais — o preço de venda. É a cor da moldura na ficha.',
    ],
  },

  pp: {
    titulo: 'PP',
    corpo: [
      'Aqui o PP não é gasto: ele define a RECARGA do golpe. Golpe de PP baixo é golpe forte, e por isso demora mais pra voltar.',
      'Nenhum golpe fica indisponível por falta de PP neste jogo.',
    ],
    wiki: 'Combate',
  },

  recarga: {
    titulo: 'Recarga',
    corpo: [
      'Tempo até o golpe poder ser usado de novo. Sai do PP do golpe e da Velocidade do POKE — POKE mais rápido recarrega mais rápido.',
      // PH-493: A SEGUNDA FRASE E METADE DO CONSERTO. A ficha mostrava a recarga
      // nominal do catalogo, sem a Velocidade e sem este piso, e o jogador via
      // "1.4s" num golpe que saia de 3 em 3 segundos. O numero passou a ser o
      // real; esta linha explica por que ele nunca desce mais que isso.
      `Nenhum golpe sai antes de ${TEXTO_DE_RITMO_CONTINUO.replace('a cada ', '')} — esse é o turno do jogo, e ele vale para todos. Por isso um golpe muito rápido mostra sempre esse mesmo tempo.`,
    ],
    wiki: 'Combate',
  },

  precisao: {
    titulo: 'Precisão',
    corpo: [
      'Chance de o golpe acertar. Errar não gasta nada além da recarga — o golpe simplesmente não causa dano.',
      'Só golpe de dano mostra este número.',
    ],
    wiki: 'Combate',
  },

  danoBase: {
    titulo: 'Dano base',
    corpo: [
      'A força crua do golpe, antes de todo o resto: atributo de ataque, defesa do alvo, tipo, STAB e crítico.',
      'Golpe de Status tem dano base 0 — ele existe pelo efeito, não pelo dano.',
    ],
    wiki: 'Combate',
  },

  categoriaDoGolpe: {
    titulo: 'Categoria',
    corpo: [
      'Físico usa seu Atk Fís contra a Def do alvo. Especial usa Atk Esp contra Def Esp. Status não causa dano.',
      'Os golpes de área do Nível 50 têm categoria dinâmica: acompanham o maior atributo de ataque do POKE.',
    ],
    wiki: 'Combate',
  },

  area: {
    titulo: 'Golpe de área',
    corpo: [
      'Acerta todos os inimigos dentro do raio, não só o alvo. O dano não é dividido entre eles.',
    ],
    wiki: 'Combate',
  },

  stab: {
    titulo: 'STAB',
    corpo: [
      'Bônus quando o tipo do golpe é igual a um dos tipos do POKE que usa. Golpe de Fogo num POKE de Fogo bate mais forte.',
    ],
    wiki: 'Combate',
  },

  estagioDeAtributo: {
    titulo: 'Alteração de atributo',
    corpo: [
      'Golpes como Dança das Espadas mexem um atributo em degraus, de -6 a +6, só durante a luta.',
      'Zera ao sair da hunt ou ao trocar de POKE — diferente de status, que fica.',
    ],
    wiki: 'Status',
  },

  // --- Mundo e economia (PH-165) --------------------------------------------
  // O glossario nasceu junto da ficha do POKE, entao ele era quase todo
  // vocabulario de COMBATE — e o inventario da PH-165 contou 11 das 19 areas do
  // jogo em ZERO verbete. Estes tres sao os que a HUD permanente pede: o que o
  // jogador ve na tela o tempo todo sem ter pedido.
  sala: {
    titulo: 'Sala',
    corpo: [
      `Cada estágio tem de ${SALAS_POR_ESTAGIO[0]} a ${SALAS_POR_ESTAGIO[SALAS_POR_ESTAGIO.length - 1]} salas — mais salas nos estágios mais fundos —, e cada uma pede ${ABATES_POR_SALA} abates pra limpar.`,
      'A cada sala o cenário muda e os selvagens sobem de nível — a hunt afunda conforme você limpa.',
      `Limpar a última fecha o estágio: você enfrenta o Lord dele e o estágio seguinte abre.`,
    ],
    wiki: 'Hunts',
  },

  protetorDaSala: {
    titulo: 'Guardião e Lorde',
    corpo: [
      'Sala com Guardião ou Lorde não avança só com os abates: enquanto ele estiver vivo, ela fica parada mesmo com a barra cheia.',
      'O Lorde é o último, e derrotar ele é o que libera o próximo bioma no menu de hunts.',
    ],
    wiki: 'Hunts',
  },

  carteira: {
    titulo: 'Ouro e diamante',
    corpo: [
      'Ouro sai de abate, de item vendido e do Mercado. É com ele que se compra na Loja e se paga o Hospital.',
      'Diamante é a moeda rara: ele não cai de abate.',
    ],
    wiki: 'Economia',
  },
} satisfies Record<string, Verbete>

export type VerbeteId = keyof typeof GLOSSARIO

export function verbete(id: VerbeteId): Verbete {
  return GLOSSARIO[id]
}

// ---------------------------------------------------------------------------
// Verbetes do INDIVIDUO — conceito + os numeros deste POKE
// ---------------------------------------------------------------------------

/**
 * ESTA natureza — "o que Hardy faz", nao "o que e natureza".
 *
 * A divisao e o pedido explicito do usuario e ela vale a pena: quem toca o
 * ROTULO ("Natureza") esta perguntando o que aquele campo significa, e quem toca
 * o VALOR ("Hardy") ja sabe e quer o efeito daquele sorteio. Emendar as duas
 * respostas numa bolha so fazia o jogador ler o conceito de novo toda vez.
 */
export function verbeteDaNatureza(nature: NatureKey | null | undefined): Verbete {
  const def = naturezaDe({ nature })
  // Sem natureza o valor na tela e "—": cai no conceito, que e a unica coisa
  // honesta a dizer ali.
  if (!def) return GLOSSARIO.natureza
  const corpo = def.sobe && def.desce
    ? [`Sobe ${STAT_LABEL[def.sobe]} (x${NATURE_BONUS}) e desce ${STAT_LABEL[def.desce]} (x${NATURE_PENALTY}).`]
    : ['Sobe e desce o mesmo atributo, então não altera nada — é uma das cinco naturezas neutras.']
  return { titulo: def.nome, corpo }
}

/**
 * ESTA habilidade — "o que Pressure faz". O conceito ("habilidade e efeito
 * passivo sorteado por individuo") fica no rotulo, em GLOSSARIO.habilidade.
 *
 * O aviso de habilidade inerte entra AQUI e nao e opcional: mostrar a descricao
 * real de uma habilidade que o motor ignora seria a bolha mentindo.
 */
export function verbeteDaTrait(traitId: string | null | undefined, oculta = false): Verbete {
  if (!traitId) return GLOSSARIO.habilidade
  const semEfeito = motivoSemEfeito(traitId)
  const corpo = [descricaoDaTrait(traitId)]
  if (semEfeito) corpo.push(`Sem efeito neste jogo: ${semEfeito}`)
  if (oculta) corpo.push(`É a habilidade oculta da espécie — ${pct(CHANCE_DE_TRAIT_OCULTA)} de chance no nascimento.`)
  return { titulo: nomeDaTrait(traitId) ?? GLOSSARIO.habilidade.titulo, corpo }
}

/** ESTA frase — o titulo e a propria frase, o corpo e o que ela denuncia. */
export function verbeteDaCaracteristica(c: Caracteristica | null | undefined): Verbete {
  if (!c) return GLOSSARIO.caracteristica
  return {
    titulo: c.texto,
    corpo: [`Aponta ${STAT_LABEL[c.stat]} como o IV mais alto deste POKE (${c.iv}).`],
  }
}

// O que cada status FAZ sai da regra gerada (STATUS_RULES), nao de texto a mao:
// dano por turno e multiplicador sao dado de balanceamento e mudam sem avisar.
// So a frase que amarra os numeros e escrita aqui.
export function verbeteDoStatus(status: StatusAtivo | StatusCondition): Verbete {
  const tipo = typeof status === 'string' ? status : status.tipo
  const turnos = typeof status === 'string' ? undefined : status.turnosRestantes
  const regra = regraDoStatus(tipo)

  // Os efeitos mecanicos vao TODOS num paragrafo so. Um por linha estourava o
  // teto de 4 paragrafos na queimadura (dano + dano fisico + imunidade + prazo +
  // volatilidade = 5) e a bolha virava lista.
  const efeitos: string[] = []
  if (regra?.danoPorTurnoFracaoDoMaximo) {
    efeitos.push(`Perde 1/${Math.round(1 / regra.danoPorTurnoFracaoDoMaximo)} do HP máximo ${TEXTO_DE_RITMO_CONTINUO}.`)
  }
  if (regra?.multiplicadorDeDanoFisico != null && regra.multiplicadorDeDanoFisico !== 1) {
    efeitos.push(`Dano físico x${regra.multiplicadorDeDanoFisico}.`)
  }
  if (regra?.multiplicadorDeVelocidade != null && regra.multiplicadorDeVelocidade !== 1) {
    efeitos.push(`Velocidade x${regra.multiplicadorDeVelocidade}.`)
  }
  if (regra?.bloqueiaAcao) efeitos.push('Não age até acordar ou descongelar.')
  else if (regra?.chanceDePerderOTurno) efeitos.push(`${pct(regra.chanceDePerderOTurno)} de chance de perder a ação.`)
  if (regra?.chanceDeSeAtacar) {
    efeitos.push(`${pct(regra.chanceDeSeAtacar)} de chance de se atacar em vez do alvo.`)
  }

  const corpo: string[] = []
  if (efeitos.length) corpo.push(efeitos.join(' '))
  if (regra?.imunidadesPorTipo.length) corpo.push(`Não pega em POKE de tipo ${lista(regra.imunidadesPorTipo)}.`)

  // PH-422: uma conversao so, e ela mora em `textoDeEstagioEPrazo`. Aqui estava
  // a segunda multiplicacao por TURNO_SEGUNDOS do projeto.
  if (turnos != null) corpo.push(`Faltam ${formatarPrazoEmTurnos(turnos)}.`)
  else if (regra && regra.duracaoEmTurnos == null) corpo.push('Não passa sozinho: só item de cura ou o Hospital.')

  corpo.push(
    ehVolatil(tipo)
      ? 'Sai sozinho ao deixar a hunt ou trocar de POKE, e convive com um status não-volátil.'
      : `Sobrevive entre combates. Curar dá ${SEGUNDOS_DE_IMUNIDADE_APOS_CURA}s de imunidade a novo status.`,
  )

  return { titulo: nomeDoStatus(tipo), corpo, wiki: 'Status' }
}

/** O que este atributo faz numa luta. Sem numero: quem quer numero le a ficha. */
const PAPEL_DO_STAT: Record<StatKey, string> = {
  hp: 'Quanto de dano o POKE aguenta antes de desmaiar.',
  atkFis: 'Multiplica o dano dos golpes de categoria Físico.',
  atkEsp: 'Multiplica o dano dos golpes de categoria Especial.',
  def: 'Reduz o dano dos golpes Físicos que ele recebe.',
  defEsp: 'Reduz o dano dos golpes Especiais que ele recebe.',
  speed: 'Encurta a recarga de todos os golpes — ataca mais vezes no mesmo tempo.',
}

export function verbeteDoStat(stat: StatKey): Verbete {
  return { titulo: STAT_LABEL[stat], corpo: [PAPEL_DO_STAT[stat]], wiki: 'Combate' }
}

export function verbeteDaRaridade(key: RarityKey): Verbete {
  const def = RARITIES[key]
  return {
    titulo: def.label,
    corpo: [
      `Atributos x${def.statMultiplier} e preço de venda x${def.sellMultiplier}.`,
      `Sai em ${pct(def.weight / 100)} das capturas.`,
      GLOSSARIO.raridade.corpo[0],
    ],
  }
}

/**
 * Um tipo elemental sozinho, lado OFENSIVO — e o que o chip de tipo de um GOLPE
 * responde. Sem defensivo aqui: a defesa depende dos dois tipos da especie, e a
 * secao de fraquezas da ficha ja faz essa conta certa.
 */
export function verbeteDoTipoDoGolpe(tipo: ElementType): Verbete {
  const comoEspecie = { type: tipo, type2: null } as Species
  const { advantage2x } = typeAdvantages(comoEspecie)
  const corpo = advantage2x.length
    ? [`Golpe de ${tipo} bate 2x em ${lista(advantage2x)}.`]
    : [`Golpe de ${tipo} não tem vantagem de 2x contra nenhum tipo.`]
  const { immune } = typeMatchups(comoEspecie)
  if (immune.length) corpo.push(`Não afeta ${lista(immune)}.`)
  corpo.push(GLOSSARIO.stab.corpo[0])
  return { titulo: tipo, corpo, wiki: 'Tipos' }
}

/**
 * Os tipos DESTA ESPECIE, lado defensivo — o chip na ficha de um POKE. Combina
 * os dois tipos pela mesma funcao que o combate usa, entao o 4x aparece.
 */
export function verbeteDosTiposDaEspecie(species: Species): Verbete {
  const m = typeMatchups(species)
  // Dois paragrafos: o que MACHUCA e o que NAO machuca. Uma linha por faixa dava
  // cinco paragrafos numa especie de dois tipos (Moltres) e a bolha virava tabela.
  const fraco: string[] = []
  if (m.weak4x.length) fraco.push(`4x de ${lista(m.weak4x)}`)
  if (m.weak2x.length) fraco.push(`2x de ${lista(m.weak2x)}`)
  const aguenta: string[] = []
  if (m.resist4x.length) aguenta.push(`resiste 4x a ${lista(m.resist4x)}`)
  if (m.resist2x.length) aguenta.push(`resiste a ${lista(m.resist2x)}`)
  if (m.immune.length) aguenta.push(`é imune a ${lista(m.immune)}`)

  const corpo: string[] = []
  if (fraco.length) corpo.push(`Toma ${fraco.join(' e ')}.`)
  if (aguenta.length) corpo.push(`Em troca, ${aguenta.join(', ')}.`)
  if (!corpo.length) corpo.push('Sem fraqueza nem resistência a tipo nenhum.')
  const tipos = [species.type, species.type2].filter(Boolean).join(' / ')
  return { titulo: tipos, corpo, wiki: 'Tipos' }
}
