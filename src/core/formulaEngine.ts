// Safe recursive-descent parser/evaluator for the tiny formula language
// documented in the spreadsheet's "Leia-me" tab: operators + - * / % ^ (),
// functions floor/ceil/round/abs/sqrt/min/max/random, and named variables
// supplied at eval time. No `eval()` — formulas are user-authored data from
// the spreadsheet, so this only ever executes this restricted grammar.

import type { FormulasData } from '@/data/generated/types'
import { nextFloat, type Rng } from './rng'

export type FormulaContext = Record<string, number>

const FUNCS: Record<string, (...args: number[]) => number> = {
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  abs: Math.abs,
  sqrt: Math.sqrt,
  min: (a, b) => Math.min(a, b),
  max: (a, b) => Math.max(a, b),
  // Funcoes por partes. Os grupos de experiencia Erratic e Fluctuating da Gen7
  // sao funcoes POR PARTES (4 e 3 faixas de nivel) — sem isto elas nao teriam
  // como ser escritas como dado, e as duas curvas teriam que virar codigo,
  // quebrando a regra de "formula e dado" que o resto da tabela segue.
  //
  // `if` avalia os DOIS ramos antes de escolher (a linguagem so tem aritmetica
  // pura, entao avaliar o ramo nao usado nao tem efeito colateral); qualquer
  // expressao aqui precisa ser definida em todo o dominio, nao so no ramo dela.
  if: (cond, quandoVerdadeiro, quandoFalso) => (cond ? quandoVerdadeiro : quandoFalso),
  lt: (a, b) => (a < b ? 1 : 0),
  lte: (a, b) => (a <= b ? 1 : 0),
  gt: (a, b) => (a > b ? 1 : 0),
  gte: (a, b) => (a >= b ? 1 : 0),
  eq: (a, b) => (a === b ? 1 : 0),
  // Substituida em tempo de avaliacao quando um Rng e passado (ver evalNode).
  // Sem Rng isto ESTOURA em vez de cair num `Math.random()`: uma formula da
  // planilha que sorteia e, por definicao, parte da simulacao, e um fallback
  // silencioso aqui abriria um caminho invisivel de volta pro nao-reproduzivel
  // — exatamente o que a Fase C existe pra fechar.
  random: () => {
    throw new Error('random() exige um Rng: passe world.rng em formulaEngine.eval(chave, contexto, rng)')
  },
}

type Token = { type: 'number'; value: number } | { type: 'ident'; value: string } | { type: 'op'; value: string }

function tokenize(expr: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < expr.length) {
    const c = expr[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++
      tokens.push({ type: 'number', value: parseFloat(expr.slice(i, j)) })
      i = j
      continue
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i
      while (j < expr.length && /[a-zA-Z0-9_]/.test(expr[j])) j++
      tokens.push({ type: 'ident', value: expr.slice(i, j) })
      i = j
      continue
    }
    if ('+-*/%^(),'.includes(c)) {
      tokens.push({ type: 'op', value: c })
      i++
      continue
    }
    throw new Error(`Formula: caractere inesperado "${c}" em "${expr}"`)
  }
  return tokens
}

type AstNode =
  | { type: 'number'; value: number }
  | { type: 'neg'; value: AstNode }
  | { type: 'var'; name: string }
  | { type: 'call'; name: string; args: AstNode[] }
  | { type: 'binary'; op: string; left: AstNode; right: AstNode }

// expr := term (('+'|'-') term)*
// term := unary (('*'|'/'|'%') unary)*
// unary := '-' unary | power
// power := primary ('^' unary)?          (right-associative)
// primary := number | ident '(' args ')' | ident | '(' expr ')'
function parse(tokens: Token[]): AstNode {
  let pos = 0
  const peek = () => tokens[pos]
  const next = () => tokens[pos++]

  function parseExpr(): AstNode {
    let node = parseTerm()
    while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = next().value as string
      node = { type: 'binary', op, left: node, right: parseTerm() }
    }
    return node
  }

  function parseTerm(): AstNode {
    let node = parseUnary()
    while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
      const op = next().value as string
      node = { type: 'binary', op, left: node, right: parseUnary() }
    }
    return node
  }

  function parseUnary(): AstNode {
    if (peek() && peek().type === 'op' && peek().value === '-') {
      next()
      return { type: 'neg', value: parseUnary() }
    }
    return parsePower()
  }

  function parsePower(): AstNode {
    const base = parsePrimary()
    if (peek() && peek().type === 'op' && peek().value === '^') {
      next()
      return { type: 'binary', op: '^', left: base, right: parseUnary() }
    }
    return base
  }

  function parsePrimary(): AstNode {
    const tok = peek()
    if (!tok) throw new Error('Formula: fim inesperado da expressao')

    if (tok.type === 'number') {
      next()
      return { type: 'number', value: tok.value }
    }

    if (tok.type === 'op' && tok.value === '(') {
      next()
      const node = parseExpr()
      if (!peek() || peek().value !== ')') throw new Error('Formula: parenteses desbalanceados')
      next()
      return node
    }

    if (tok.type === 'ident') {
      next()
      if (peek() && peek().type === 'op' && peek().value === '(') {
        next()
        const args: AstNode[] = []
        if (peek() && peek().value !== ')') {
          args.push(parseExpr())
          while (peek() && peek().value === ',') {
            next()
            args.push(parseExpr())
          }
        }
        if (!peek() || peek().value !== ')') throw new Error('Formula: parenteses desbalanceados na funcao')
        next()
        return { type: 'call', name: tok.value, args }
      }
      return { type: 'var', name: tok.value }
    }

    throw new Error(`Formula: token inesperado ${JSON.stringify(tok)}`)
  }

  const result = parseExpr()
  if (pos < tokens.length) throw new Error('Formula: sobrou texto apos a expressao')
  return result
}

function evalNode(node: AstNode, context: FormulaContext, rng?: Rng): number {
  switch (node.type) {
    case 'number':
      return node.value
    case 'neg':
      return -evalNode(node.value, context, rng)
    case 'var':
      if (!(node.name in context)) throw new Error(`Formula: variavel desconhecida "${node.name}"`)
      return context[node.name]
    case 'call': {
      const fn = node.name === 'random' && rng ? () => nextFloat(rng) : FUNCS[node.name]
      if (!fn) throw new Error(`Formula: funcao desconhecida "${node.name}"`)
      return fn(...node.args.map((a) => evalNode(a, context, rng)))
    }
    case 'binary': {
      const l = evalNode(node.left, context, rng)
      const r = evalNode(node.right, context, rng)
      switch (node.op) {
        case '+': return l + r
        case '-': return l - r
        case '*': return l * r
        case '/': return l / r
        case '%': return l % r
        case '^': return Math.pow(l, r)
        default: throw new Error(`Formula: operador desconhecido "${node.op}"`)
      }
    }
    default:
      throw new Error('Formula: no de AST desconhecido')
  }
}

const astCache = new Map<string, AstNode>()

function getAst(expr: string): AstNode {
  let ast = astCache.get(expr)
  if (!ast) {
    ast = parse(tokenize(expr))
    astCache.set(expr, ast)
  }
  return ast
}

// Evaluates a raw expression string directly (no formula-table lookup).
export function evalExpression(expr: string, context: FormulaContext = {}, rng?: Rng): number {
  return evalNode(getAst(expr), context, rng)
}

export interface FormulaEngine {
  // `rng`: passe SEMPRE que a formula for avaliada dentro da simulacao. Hoje so
  // DAMAGE_VARIATION usa random(), mas a planilha pode ganhar outras — sem o
  // rng, elas cairiam num Math.random() invisivel e furariam o determinismo.
  eval(key: string, context?: FormulaContext, rng?: Rng): number
  // Same as eval(), but returns `fallback` instead of throwing when the
  // spreadsheet doesn't (yet) have this key — lets new economy knobs ship
  // in code before the user has pasted the matching row into the "Formulas"
  // sheet and re-run the sync (see CLAUDE.md's balancing-formulas section).
  evalOrDefault(key: string, fallback: number, context?: FormulaContext, rng?: Rng): number
}

// `formulas` is the { KEY: { expr, vars } } map from data/generated/formulas.generated.ts.
export function createFormulaEngine(formulas: FormulasData): FormulaEngine {
  return {
    eval(key, context = {}, rng) {
      const entry = formulas[key]
      if (!entry) throw new Error(`Formula desconhecida: "${key}"`)
      return evalExpression(entry.expr, context, rng)
    },
    evalOrDefault(key, fallback, context = {}, rng) {
      if (!(key in formulas)) return fallback
      return evalExpression(formulas[key].expr, context, rng)
    },
  }
}
