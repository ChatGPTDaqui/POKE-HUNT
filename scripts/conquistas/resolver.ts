// Resolve o catalogo autoral de conquistas (src/data/conquistas.ts) na forma
// que o jogo e o banco leem: grupos de especies viram listas, `alvo: 'todas'`
// vira numero, e cada linha ganha pontos e ordem.
//
// Funcao pura, usada por DOIS lados que precisam concordar:
//   * scripts/conquistas/gerar.ts escreve o resultado no generated.ts e na
//     migration;
//   * scripts/conquistas/catalogo.test.ts roda de novo e compara com os dois
//     arquivos — catalogo editado sem regerar reprova.
//
// Le scripts/usum/catalog.json SO pelo numero de Pokedex (pra saber a regiao).
// Isso nao pode ir pro bundle do jogo, e por isso mora aqui e nao em src/.
import catalogo from '../usum/catalog.json'
import {
  CONQUISTAS, PONTOS_POR_NIVEL,
  type ConquistaDaTela, type ConquistaResolvida, type Especies, type FiltroDePoke, type GrupoDeEspecies,
  type RegraAutoral, type RegraResolvida,
} from '../../src/data/conquistas'
import { SPECIES } from '../../src/data/pokes'
import { LEGENDARY_SPECIES_IDS } from '../../src/data/legendaries'
import { traitsDaEspecie } from '../../src/data/traits'


const DEX: Record<string, number> = Object.fromEntries(
  (catalogo as { especies: { chave: string; dex: number }[] }).especies.map((e) => [e.chave, e.dex]),
)

const LENDARIOS = new Set(LEGENDARY_SPECIES_IDS)

// Especies rosa da Pokedex (cor oficial "pink" dos jogos), Gen I-III. A lista
// e filtrada pelo que o jogo tem — Chansey, Blissey e Mr. Mime nao estao.
const ROSA = [
  'clefairy', 'clefable', 'cleffa', 'jigglypuff', 'wigglytuff', 'igglybuff', 'slowpoke',
  'slowbro', 'slowking', 'porygon', 'lickitung', 'snubbull', 'granbull', 'corsola',
  'miltank', 'skitty', 'delcatty', 'luvdisc', 'hoppip', 'whismur', 'smoochum', 'chansey',
  'blissey', 'mr_mime',
]

/** Especies do jogo (catalogo do cliente), sem lendarias. */
function jogaveis(): string[] {
  return Object.keys(SPECIES).filter((id) => !LENDARIOS.has(id))
}

function porDex(min: number, max: number): string[] {
  return jogaveis().filter((id) => {
    const dex = DEX[id]
    if (dex == null) throw new Error(`especie ${id} sem numero de Pokedex em scripts/usum/catalog.json`)
    return dex >= min && dex <= max
  })
}

export function resolverGrupo(grupo: GrupoDeEspecies): string[] {
  const lista = (() => {
    switch (grupo) {
      case '@kanto': return porDex(1, 151)
      case '@johto': return porDex(152, 251)
      case '@hoenn': return porDex(252, 386)
      case '@nacional': return jogaveis()
      case '@rosa': return ROSA.filter((id) => SPECIES[id] != null)
    }
  })()
  return [...lista].sort()
}

function resolverEspecies(especies: Especies): string[] {
  return typeof especies === 'string' ? resolverGrupo(especies) : [...especies]
}

function resolverFiltro(f: FiltroDePoke): Record<string, unknown> {
  const { especies, ...resto } = f
  return especies === undefined ? { ...resto } : { especies: resolverEspecies(especies), ...resto }
}

export function resolverRegra(regra: RegraAutoral): RegraResolvida {
  switch (regra.t) {
    case 'abates':
      return regra.especies === undefined ? { ...regra } : { ...regra, especies: resolverEspecies(regra.especies) }
    case 'posse':
      return { t: 'posse', f: resolverFiltro(regra.f), qtd: regra.qtd ?? 1 }
    case 'time':
      return { t: 'time', f: resolverFiltro(regra.f), qtd: regra.qtd }
    case 'conjunto':
      return { t: 'conjunto', especies: [...regra.especies], time: regra.time ?? false }
    case 'colecao': {
      if (regra.de === 'naturezas' || regra.de === 'tipos') return { ...regra }
      // O TS nao estreita a uniao por `de` (as duas variantes tem `t: 'colecao'`).
      const r = regra as Extract<RegraAutoral, { de: 'registradas' | 'possuidas' }>
      const especies = r.especies === undefined ? undefined : resolverEspecies(r.especies)
      const alvo = r.alvo === 'todas' ? (especies ?? jogaveis()).length : r.alvo
      const saida: RegraResolvida = { t: 'colecao', de: r.de }
      if (especies) saida.especies = especies
      if (r.f) saida.f = resolverFiltro(r.f)
      saida.alvo = alvo
      return saida
    }
    default:
      return { ...regra }
  }
}

export function resolverCatalogo(): ConquistaResolvida[] {
  return CONQUISTAS.map((c, i) => ({
    id: c.id,
    nome: c.nome,
    descricao: c.descricao,
    categoria: c.categoria,
    nivel: c.nivel,
    pontos: PONTOS_POR_NIVEL[c.nivel],
    secreta: c.secreta ?? false,
    ordem: i + 1,
    ref: c.ref ?? null,
    regra: resolverRegra(c.regra),
  }))
}

/**
 * A habilidade OCULTA de cada especie, quando ela e de fato rara: especie cuja
 * unica opcao e a oculta (nenhuma normal) fica de fora, porque ali ela sai
 * sempre (`traits.ts#sortearTrait`).
 */
export function tracosOcultos(): [string, string][] {
  const linhas: [string, string][] = []
  for (const id of Object.keys(SPECIES).sort()) {
    const t = traitsDaEspecie(id)
    if (t?.oculta && t.normais.length > 0 && !t.normais.includes(t.oculta)) linhas.push([id, t.oculta])
  }
  return linhas
}

function sqlTexto(v: string): string {
  return `'${v.replaceAll("'", "''")}'`
}

/** Corpo da migration do catalogo (sem cabecalho de data). */
export function sqlDoCatalogo(): string {
  const catalogo = resolverCatalogo()
  const ocultos = tracosOcultos()
  const partes: string[] = []
  for (const schema of ['public', 'dev']) {
    const valores = catalogo.map((c) => `  (${[
      sqlTexto(c.id), sqlTexto(c.categoria), sqlTexto(c.nivel), String(c.pontos),
      String(c.secreta), String(c.ordem), `${sqlTexto(JSON.stringify(c.regra))}::jsonb`,
    ].join(', ')})`)
    partes.push(
      `insert into ${schema}.conquista_catalogo (id, categoria, nivel, pontos, secreta, ordem, regra) values\n`
      + `${valores.join(',\n')}\n`
      + 'on conflict (id) do update set\n'
      + '  categoria = excluded.categoria, nivel = excluded.nivel, pontos = excluded.pontos,\n'
      + '  secreta = excluded.secreta, ordem = excluded.ordem, regra = excluded.regra;\n',
      `delete from ${schema}.conquista_catalogo where id not in (${catalogo.map((c) => sqlTexto(c.id)).join(', ')});\n`,
      `insert into ${schema}.especie_traco_oculto (species_id, trait) values\n`
      + `${ocultos.map(([s, t]) => `  (${sqlTexto(s)}, ${sqlTexto(t)})`).join(',\n')}\n`
      + 'on conflict (species_id) do update set trait = excluded.trait;\n',
      `delete from ${schema}.especie_traco_oculto where species_id not in (${ocultos.map(([s]) => sqlTexto(s)).join(', ')});\n`,
    )
  }
  return partes.join('\n')
}

/** O mesmo numero que `conquista_alvo` no SQL (fundacao de conquistas). */
export function alvoDaRegra(regra: RegraResolvida): number {
  switch (regra.t) {
    case 'platina': return 0
    case 'conjunto': return (regra.especies as unknown[]).length
    case 'abates_tipos': return (regra.tipos as unknown[]).length
    case 'contadores_todos': return (regra.chaves as unknown[]).length
    default: return Number(regra.alvo ?? regra.qtd ?? 1)
  }
}

/** Contador de tempo: as chaves `*_seg` (hunt_seg, ativo_seg:..., clima_seg:...). */
function ehDeTempo(regra: RegraResolvida): boolean {
  const chaves = [regra.chave, ...((regra.chaves as unknown[] | undefined) ?? [])].filter((k): k is string => typeof k === 'string')
  // `contadores_todos` mede QUANTAS chaves passaram do alvo — o numero da tela
  // e uma contagem, nao tempo, mesmo com chaves de tempo.
  return regra.t !== 'contadores_todos' && chaves.length > 0 && chaves.every((k) => /_seg(:|$)/.test(k))
}

export function catalogoDaTela(): ConquistaDaTela[] {
  return resolverCatalogo().map(({ regra, ...resto }) => ({
    ...resto, alvo: alvoDaRegra(regra), unidade: ehDeTempo(regra) ? 'tempo' : null,
  }))
}

/** Conteudo de src/data/generated/conquistas.generated.ts. */
export function tsDoCatalogo(): string {
  const linhas = catalogoDaTela().map((c) => `  ${JSON.stringify(c)},`)
  return [
    '// AUTO-GENERATED por `npm run conquistas:gerar` a partir de src/data/conquistas.ts.',
    '// Nao edite a mao: scripts/conquistas/catalogo.test.ts reprova se divergir do autoral.',
    "import type { ConquistaDaTela } from '../conquistas'",
    '',
    'export const CATALOGO_DE_CONQUISTAS: ConquistaDaTela[] = [',
    ...linhas,
    ']',
    '',
  ].join('\n')
}
