// Camada de dados da Wiki do site. TUDO aqui vem por import do código do jogo
// (src/data, src/core), o mesmo que o motor e a Wiki dentro do jogo leem:
// rebalancear o jogo muda o site no próximo build, sem texto digitado a mão.
//
// Regra de dependência: só módulos de dados puros. O Cloudflare Pages instala
// apenas as dependências de site/, então nada importado daqui pode puxar pacote
// npm (React, zustand...). O clima saiu do HUD para src/data/clima.ts por isso.
import { TYPE_CHART, getEffectiveness } from '@/data/generated/typeChart.generated'
import { TYPE_COLORS } from '@/data/typeColors'
import { RARITIES, RARITY_ORDER } from '@/data/rarity'
import type { ElementType, StatusCondition } from '@/data/generated/types'
import {
  STATUS_NAO_VOLATEIS, STATUS_VOLATEIS, TURNOS_DE_IMUNIDADE_APOS_CURA,
  regraDoStatus, nomeDoStatus, poderDoAutoDano,
} from '@/data/statusEffects'
import { TURNO_SEGUNDOS, getAbility } from '@/data/abilities'
import { formatarPrazoEmTurnos, TEXTO_DE_RITMO_CONTINUO } from '@/data/textoDeEstagioEPrazo'
import { ITEMS, getItem, type GeneratedItem } from '@/data/items'
import { STATUS_RULES } from '@/data/generated/status.generated'
import { createFormulaEngine } from '@/core/formulaEngine'
import { FORMULAS } from '@/data/generated/formulas.generated'
import { MAX_ACTIVE_ABILITIES } from '@/data/activeAbilities'
import { TYPED_AOE_LEVEL } from '@/data/typedAoeMoves'
import { LEGENDARY_SPECIES_IDS } from '@/data/legendaries'
import {
  BIOMAS, ABATES_POR_SALA, ABATES_COMUNS_POR_SALA, ESTAGIOS_PARA_O_LANCE,
  CHANCE_DE_SALA_ESPECIAL, CHANCE_DA_PEDRA_TEMATICA,
} from '@/data/biomas'
import {
  ESTAGIOS_POR_BIOMA, NIVEIS_POR_ESTAGIO, TETO_DO_MODO_NORMAL,
  SALAS_POR_ESTAGIO, SALAS_POR_BIOMA, niveisDoEstagio,
} from '@/data/estagios'
import { BOSS_LEVEL, LEVEL_OFFSET } from '@/data/nightmareMaps'
import { ATLAS_DOS_BIOMAS, estagiosPorEspecie, estagiosDoLugar } from '@/data/atlasDosBiomas'
import { SPECIES, SPECIAL_EVOLUTION_LEVEL, SPECIAL_EVOLUTION_STONE_COUNT } from '@/data/pokes'
import {
  ESPECIALIDADE_TYPES, ESPECIALIDADE_NIVEL_MAX, ESPECIALIDADE_BONUS_POR_NIVEL, custosDoTipo,
} from '@/data/especialidades'
import { ABATES_PARA_CHOCAR, CONTRATOS_POR_DIA, IV_MINIMO_DO_OVO, RARIDADE_AO_CHOCAR, RARIDADES_DO_OVO } from '@/data/ovos'
import { MAX_TEAM_SIZE } from '@/stores/gameStateDefaults'
import { APARENCIA } from '@/data/clima'

export const pct = (x: number) => `${Math.round(x * 100)}%`
export const fmt = new Intl.NumberFormat('pt-BR')
export const golpe = (id: string) => getAbility(id)?.name ?? id
export const turnos = (q: number) => `${q} turno${q === 1 ? '' : 's'} (${q * TURNO_SEGUNDOS}s)`

// ---------------- tipos ----------------
export const TIPOS = Object.keys(TYPE_COLORS) as ElementType[]
export const corDoTipo = (t: ElementType) => TYPE_COLORS[t]
export const tabelaDeTipos = TIPOS.map((atk) => ({ atk, linha: TIPOS.map((def) => TYPE_CHART[atk][def]) }))
export const resumoDosTipos = Object.fromEntries(
  TIPOS.map((t) => {
    const ataque = { forte: [] as ElementType[], fraco: [] as ElementType[], nulo: [] as ElementType[] }
    const defesa = { fraqueza: [] as ElementType[], resiste: [] as ElementType[], imune: [] as ElementType[] }
    for (const o of TIPOS) {
      const a = TYPE_CHART[t][o]
      if (a === 2) ataque.forte.push(o); else if (a === 0.5) ataque.fraco.push(o); else if (a === 0) ataque.nulo.push(o)
      const d = getEffectiveness(o, t, null)
      if (d === 2) defesa.fraqueza.push(o); else if (d === 0.5) defesa.resiste.push(o); else if (d === 0) defesa.imune.push(o)
    }
    return [t, { ataque, defesa }]
  }),
)

// ---------------- raridade ----------------
export const RARIDADES = RARITY_ORDER.map((k) => RARITIES[k])
export const TOTAL_LENDARIOS = LEGENDARY_SPECIES_IDS.length

// ---------------- status ----------------
function curasDe(tipo: StatusCondition): string[] {
  return Object.values(ITEMS)
    .filter((item): item is GeneratedItem =>
      'kind' in item && item.kind === 'status_heal' && Array.isArray(item.healsStatus) && item.healsStatus.includes(tipo))
    .sort((a, b) => a.buyPrice - b.buyPrice)
    .map((i) => i.name)
}

export const STATUS = [...STATUS_NAO_VOLATEIS, ...STATUS_VOLATEIS].map((tipo) => {
  const r = regraDoStatus(tipo)!
  const linhas: string[] = []
  if (r.bloqueiaAcao) linhas.push('Impede agir em <b>todo</b> turno enquanto durar.')
  else if (r.chanceDePerderOTurno) linhas.push(`<b>${pct(r.chanceDePerderOTurno)}</b> de chance de perder o turno a cada ação.`)
  if (r.danoPorTurnoFracaoDoMaximo) linhas.push(`Tira <b>${pct(r.danoPorTurnoFracaoDoMaximo)}</b> do HP máximo ${TEXTO_DE_RITMO_CONTINUO}.`)
  if (r.multiplicadorDeVelocidade && r.multiplicadorDeVelocidade !== 1) linhas.push(`Velocidade ×${r.multiplicadorDeVelocidade}.`)
  if (r.multiplicadorDeDanoFisico && r.multiplicadorDeDanoFisico !== 1) linhas.push(`Dano de golpes <b>físicos</b> ×${r.multiplicadorDeDanoFisico}.`)
  if (r.duracaoEmTurnos) {
    const [a, b] = r.duracaoEmTurnos
    linhas.push(`Passa sozinho em ${a} a ${b} turnos (${formatarPrazoEmTurnos(a)} a ${formatarPrazoEmTurnos(b)}).`)
  } else if (r.chanceDeDescongelarPorTurno) {
    linhas.push(`<b>${pct(r.chanceDeDescongelarPorTurno)}</b> de chance de sair sozinho a cada turno.`)
  } else {
    linhas.push('Não passa sozinho: só com item ou no Hospital.')
  }
  if (r.descongelaComTipo) linhas.push(`Golpe de dano do tipo ${r.descongelaComTipo} tira o status na hora.`)
  if (r.chanceDeSeAtacar) linhas.push(`<b>${pct(r.chanceDeSeAtacar)}</b> de chance de se atacar (poder ${poderDoAutoDano(tipo)}, sem tipo).`)
  return {
    tipo, nome: nomeDoStatus(tipo), volatil: STATUS_VOLATEIS.includes(tipo as never),
    linhas, imunes: r.imunidadesPorTipo as ElementType[], curas: curasDe(tipo),
  }
})
export const STATUS_EXTRA = {
  turnosDeImunidade: TURNOS_DE_IMUNIDADE_APOS_CURA,
  golpesDePo: STATUS_RULES.golpesDePo.golpes.map(golpe),
}

// ---------------- combate ----------------
const motor = createFormulaEngine(FORMULAS)
export const COMBATE = {
  turnoSegundos: TURNO_SEGUNDOS,
  stab: motor.eval('STAB_MULTIPLIER'),
  critChance: motor.eval('CRIT_CHANCE'),
  critMult: motor.eval('CRIT_MULTIPLIER'),
  velocidadeRef: motor.evalOrDefault('ATTACK_SPEED_REFERENCE', 100),
  golpesAtivos: MAX_ACTIVE_ABILITIES,
  nivelAoe: TYPED_AOE_LEVEL,
}

// ---------------- clima ----------------
export const CLIMAS = Object.entries(APARENCIA).map(([tipo, a]) => ({ tipo, nome: a.nome, efeitos: a.efeitos }))
const NOME_CLIMA: Record<string, string> = { limpo: 'Céu limpo', ...Object.fromEntries(CLIMAS.map((c) => [c.tipo, c.nome])) }
export const COR_CLIMA: Record<string, string> = {
  limpo: '#e9c46a', chuva: '#5b8fc7', sol: '#f0a63a', granizo: '#8fd0e0', neve: '#c9ddf0', areia: '#c9a060', nevoa: '#9aa6b0',
}
export const nomeDoClima = (t: string) => NOME_CLIMA[t] ?? t

// ---------------- mundo ----------------
export const MUNDO = {
  biomas: BIOMAS.length,
  estagios: ESTAGIOS_POR_BIOMA,
  niveisPorEstagio: NIVEIS_POR_ESTAGIO,
  teto: TETO_DO_MODO_NORMAL,
  abatesPorSala: ABATES_POR_SALA,
  abatesComuns: ABATES_COMUNS_POR_SALA,
  salasPorBioma: SALAS_POR_BIOMA,
  abatesPorBioma: SALAS_POR_BIOMA * ABATES_POR_SALA,
  estagiosParaLance: ESTAGIOS_PARA_O_LANCE,
  chanceSalaEspecial: CHANCE_DE_SALA_ESPECIAL,
  chancePedraTematica: CHANCE_DA_PEDRA_TEMATICA,
  totalSubBiomas: BIOMAS.reduce((a, b) => a + b.subBiomas.length, 0),
  totalEspeciais: BIOMAS.reduce((a, b) => a + (b.especiais ?? []).length, 0),
  pesadeloOffset: LEVEL_OFFSET,
  nivelBoss: BOSS_LEVEL,
  equipe: MAX_TEAM_SIZE,
  primeiro: niveisDoEstagio(1),
  ultimo: niveisDoEstagio(ESTAGIOS_POR_BIOMA),
}
export const ESTAGIOS = SALAS_POR_ESTAGIO.map((salas, i) => {
  const [de, ate] = niveisDoEstagio(i + 1)
  return { n: i + 1, de, ate, salas }
})

// Arte do seletor de biomas (site/public/art/biomas), pela chave do bioma.
const ARTE_DO_BIOMA = new Set(['campo_aberto', 'mata', 'marinho', 'aguas_interiores', 'aridos', 'subterraneo', 'gelido', 'igneo', 'urbano', 'industrial', 'sombrio', 'sagrado'])
export const CORES_SUB = ['#5aa9e6', '#f2a541', '#7bc96f', '#e06c9f', '#b388eb', '#e5d352']

const nomeEspecie = (id: string) => SPECIES[id]?.name ?? id
const nomeItem = (id: string) => getItem(id)?.name ?? id

export const BIOMAS_DA_WIKI = ATLAS_DOS_BIOMAS.map((f) => ({
  chave: f.bioma.chave,
  nome: f.bioma.nome,
  tipo: f.bioma.tipo as ElementType,
  arte: ARTE_DO_BIOMA.has(f.bioma.chave) ? `/art/biomas/${f.bioma.chave}.webp` : null,
  composicao: f.composicao,
  subBiomas: f.subBiomas.map((s, i) => {
    const [de] = niveisDoEstagio(s.estagios[0] ?? 1)
    const [, ate] = niveisDoEstagio(s.estagios[s.estagios.length - 1] ?? 1)
    return {
      chave: s.sub.chave, nome: s.sub.nome, cor: CORES_SUB[i % CORES_SUB.length],
      estagios: s.estagios, de, ate, pico: s.pico, fatiaNoPico: s.fatiaNoPico,
      climas: s.climas, itens: s.itens.map(nomeItem),
      destaques: s.destaques.filter((id) => SPECIES[id]).map((id) => ({ id, nome: nomeEspecie(id) })),
    }
  }),
  especiais: f.especiais.map((e) => ({
    chave: e.sala.chave, nome: e.sala.nome, estagioMinimo: e.sala.estagioMinimo,
    pedra: (e.sala.pedra ?? null) as ElementType | null,
    shiny: e.sala.shiny ? { nome: nomeEspecie(e.sala.shiny.especie), mult: e.sala.shiny.multiplicador } : null,
    climas: e.climas, itens: e.itens.map(nomeItem),
    especies: e.especies.filter((id) => SPECIES[id]).map((id) => ({ id, nome: nomeEspecie(id), exclusiva: e.exclusivas.includes(id) })),
  })),
}))

// ---------------- progresso ----------------
export const PROGRESSO = {
  bonusPorNivel: Math.round(ESPECIALIDADE_BONUS_POR_NIVEL * 100),
  bonusMax: Math.round(ESPECIALIDADE_BONUS_POR_NIVEL * ESPECIALIDADE_NIVEL_MAX * 100),
  nivelMax: ESPECIALIDADE_NIVEL_MAX,
  tiposEspecialidade: ESPECIALIDADE_TYPES as ElementType[],
  evolucaoEspecialNivel: SPECIAL_EVOLUTION_LEVEL,
  evolucaoEspecialPedras: SPECIAL_EVOLUTION_STONE_COUNT,
  especiesQueEvoluem: Object.values(SPECIES).filter((s) => (s.evolutionOptions?.length ?? 0) > 0).length,
  contratosPorDia: CONTRATOS_POR_DIA,
  ivMinimoOvo: IV_MINIMO_DO_OVO,
  ovos: RARIDADES_DO_OVO.map((r) => ({
    nome: RARITIES[r].label, cor: RARITIES[r].color, abates: ABATES_PARA_CHOCAR[r],
    lendario: RARIDADE_AO_CHOCAR[r].legendary, mitico: RARIDADE_AO_CHOCAR[r].mythic,
  })),
}
export const CUSTOS_ESPECIALIDADE = Object.fromEntries(
  (ESPECIALIDADE_TYPES as ElementType[]).map((t) => {
    const c = custosDoTipo(t)
    return [t, { niveis: c.map((x) => ({ pedras: x.stoneQtd, ouro: x.gold })), pedras: c.reduce((a, x) => a + x.stoneQtd, 0), ouro: c.reduce((a, x) => a + x.gold, 0) }]
  }),
)

// ---------------- pokédex ----------------
const LENDARIOS = new Set<string>(LEGENDARY_SPECIES_IDS)
const ondeVive = new Map<string, Map<string, { bioma: string; lugares: Set<string>; de: number; ate: number }>>()
for (const b of BIOMAS) {
  const lugares = [...b.subBiomas.map((s) => ({ chave: s.chave, nome: s.nome })), ...(b.especiais ?? []).map((e) => ({ chave: e.chave, nome: e.nome }))]
  for (const l of lugares) {
    for (const [sp, estagios] of estagiosPorEspecie(b, l.chave, estagiosDoLugar(b, l.chave))) {
      const porBioma = ondeVive.get(sp) ?? new Map()
      const reg = porBioma.get(b.chave) ?? { bioma: b.nome, lugares: new Set<string>(), de: 99, ate: 0 }
      reg.lugares.add(l.nome)
      reg.de = Math.min(reg.de, ...estagios)
      reg.ate = Math.max(reg.ate, ...estagios)
      porBioma.set(b.chave, reg)
      ondeVive.set(sp, porBioma)
    }
  }
}

// De quem cada espécie evolui: explica quem não nasce em lugar nenhum.
const evoluiDe = new Map<string, string>()
for (const s of Object.values(SPECIES)) for (const o of s.evolutionOptions ?? []) if (!evoluiDe.has(o.to)) evoluiDe.set(o.to, s.name)

export const POKEDEX = Object.values(SPECIES)
  .map((s) => {
    const base = s.base as unknown as Record<string, number>
    const total = Object.values(base).reduce((a, x) => a + x, 0)
    return {
      id: s.id,
      nome: s.name,
      tipos: [s.type, s.type2].filter(Boolean) as ElementType[],
      total,
      captura: s.catchRate,
      lendario: LENDARIOS.has(s.id),
      evolui: (s.evolutionOptions ?? []).map((o) => nomeEspecie(o.to)),
      de: evoluiDe.get(s.id) ?? null,
      onde: [...(ondeVive.get(s.id)?.values() ?? [])].map((r) => ({ bioma: r.bioma, lugares: [...r.lugares], de: r.de, ate: r.ate })),
    }
  })
  .sort((a, b) => a.nome.localeCompare(b.nome))

export const TOTAL_ESPECIES = POKEDEX.length
