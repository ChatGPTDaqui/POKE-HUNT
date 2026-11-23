import vm from 'node:vm'
import type { Plugin } from 'vite'

// Tabelas geradas (`src/data/generated/*.generated.ts`) no build de producao.
// Auditoria de 23/11/2026, prioridade 4.
//
// 1. Viram `JSON.parse('...')`. O V8 le uma string JSON bem mais rapido do que
//    compila o mesmo objeto escrito como literal de JS: medido em Node, 66 ms ->
//    37 ms nas 20 tabelas (num celular medio, 4 a 5 vezes isso). O acesso
//    continua sincrono e o valor e o mesmo, entao nenhum codigo muda.
// 2. Saem num chunk proprio (`dados`, ver vite.config.ts). Esses arquivos mudam
//    pouco e o codigo muda varias vezes por dia: separados, o navegador mantem
//    em cache os ~1,3 MB de dados entre um deploy e outro.
//
// So converte modulo que for dado puro: depois de tirar os tipos, ele precisa
// ter apenas `export const X = <literal>` e cada valor precisa sobreviver
// identico a um JSON.stringify/parse (sem undefined, NaN, Map, referencia
// compartilhada...). Qualquer outra coisa fica como esta. Teste e dev nao
// passam por aqui (`apply: 'build'`).
const GERADO = /[\\/]src[\\/]data[\\/]generated[\\/][^\\/]+\.generated\.ts$/

export function converterDadoPuro(codigo: string): string | null {
  const exportados: string[] = []
  const corpo = codigo.replace(/^export const (\w+)\s*=/gm, (_m, nome: string) => {
    exportados.push(nome)
    return `__e.${nome} =`
  })
  if (exportados.length === 0) return null
  // Outro import/export, ou declaracao de topo (const auxiliar, funcao): pode
  // haver referencia compartilhada ou logica. Nao e dado puro.
  if (/^\s*(import|export|const|let|var|function|class)\b/m.test(corpo)) return null
  const __e: Record<string, unknown> = {}
  try {
    vm.runInNewContext(corpo, { __e }, { timeout: 5000 })
  } catch {
    return null
  }
  const linhas: string[] = []
  for (const nome of exportados) {
    const valor = __e[nome]
    if (valor === undefined || typeof valor !== 'object' || valor === null) return null
    const json = JSON.stringify(valor)
    // Pega undefined, NaN, -0, Infinity, Map/Set e buracos em array.
    if (!igualAoJson(valor, json)) return null
    linhas.push(`export const ${nome} = /* @__PURE__ */ JSON.parse(${JSON.stringify(json)});`)
  }
  return linhas.join('\n') + '\n'
}

// Igualdade estrita entre o valor original e o que JSON.parse(json) devolveria,
// sem depender do prototipo do realm do vm.
function igualAoJson(valor: unknown, json: string): boolean {
  const volta = JSON.parse(json) as unknown
  const igual = (a: unknown, b: unknown): boolean => {
    if (a === b) return !(typeof a === 'number' && Object.is(a, -0))
    if (typeof a === 'number' && typeof b === 'number') return false
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
    const protoA = Object.getPrototypeOf(a)
    const ehArray = Array.isArray(a)
    if (ehArray !== Array.isArray(b)) return false
    if (!ehArray && protoA !== null && protoA.constructor?.name !== 'Object') return false
    if (ehArray) {
      const aa = a as unknown[]
      const bb = b as unknown[]
      if (aa.length !== bb.length) return false
      for (let i = 0; i < aa.length; i++) if (!(i in aa) || !igual(aa[i], bb[i])) return false
      return true
    }
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    if (ka.length !== kb.length) return false
    return ka.every((k) => igual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  }
  return igual(valor, volta)
}

export function dadosGeradosComoJson(): Plugin {
  const convertidos: string[] = []
  return {
    name: 'dados-gerados-como-json',
    apply: 'build',
    transform(codigo, id) {
      if (!GERADO.test(id.split('?')[0])) return null
      const novo = converterDadoPuro(codigo)
      if (!novo) return null
      convertidos.push(id.split(/[\\/]/).pop()!)
      return { code: novo, map: null }
    },
    buildEnd() {
      if (convertidos.length > 0) this.info(`${convertidos.length} tabelas geradas viraram JSON.parse`)
    },
  }
}

export const ehDadoGerado = (id: string): boolean => GERADO.test(id)
