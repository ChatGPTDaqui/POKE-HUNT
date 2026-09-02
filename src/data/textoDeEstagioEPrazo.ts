// O texto de ESTAGIO DE ATRIBUTO e de PRAZO que o jogador le (PH-421, PH-422).
//
// POR QUE UM MODULO SO, E POR QUE ELE E OBRIGATORIO
// -----------------------------------------------------------------------------
// As duas issues tem o mesmo criterio de aceite na raiz: UMA funcao de
// formatacao, e nenhuma segunda conversao espalhada. O motivo nao e estetico.
//
// ESTAGIO: `-1` parece "menos um ponto de Ataque" e na verdade e 0,67x — o
// atributo cai um terco. E pior que impreciso: o jogador que le "-1" acha que
// perdeu quase nada e mantem uma luta que ja esta perdida.
//
// E existem DUAS formulas, nao uma. Ataque, Defesa e Velocidade usam base 2
// (`(2+n)/2` subindo, `2/(2-n)` descendo); Precisao e Evasao usam base 3
// (`(3+n)/3` e `3/(3-n)`). Um mapa unico de estagio->porcentagem sai ERRADO
// nesses dois: +1 de Precisao e 1,33x, nao 1,5x. Dai a funcao receber o
// ATRIBUTO, e nao so o numero — quem chamar com o stat errado erra o texto, e
// quem tentar decorar a tabela erra dois dos sete.
//
// PRAZO: turno e segundo sao formas diferentes de dizer a mesma coisa neste
// motor (1 turno = TURNO_SEGUNDOS), porque o relogio de turno e tempo puro
// (`proximoTurnoDeStatus -= dt`), e nao "por acao". Entao a conversao e literal,
// sem ressalva, e ninguem esta sendo enganado pela troca. O que o jogador nao
// tem e intuicao de quanto vale um turno — 5 turnos nao diz nada, 15s diz.
//
// O NUMERO NUNCA E ESCRITO A MAO. Todo prazo sai de `TURNO_SEGUNDOS`: se o turno
// mudar de 3s (ja mudou de 2 pra 3 na PH-376), o texto acompanha sozinho. Um `3`
// digitado aqui viraria mentira silenciosa no dia da proxima mudanca.
import { TURNO_SEGUNDOS } from './abilities'
import {
  multiplicadorDeEstagio, multiplicadorDeAccuracyOuEvasion, type StatDeEstagio,
} from './statusEffects'

/**
 * Os dois atributos que usam a formula de base 3.
 *
 * Lista explicita, e nao `stat === 'accuracy' || stat === 'evasion'` espalhado:
 * e a unica coisa que separa as duas familias, e ela merece um nome.
 */
const STATS_DE_BASE_3: ReadonlySet<StatDeEstagio> = new Set(['accuracy', 'evasion'])

/** O multiplicador real do atributo, pela formula CERTA para ele. */
export function multiplicadorDoStat(stat: StatDeEstagio, estagio: number): number {
  return STATS_DE_BASE_3.has(stat)
    ? multiplicadorDeAccuracyOuEvasion(estagio)
    : multiplicadorDeEstagio(estagio)
}

/**
 * `2x`, `0,67x`, `1,33x` — sempre com virgula decimal, e sem decimal quando o
 * valor e inteiro.
 *
 * Inteiro sem `,00` porque `2x` e o caso mais comum (Danca das Espadas) e
 * `2,00x` parece precisao que o numero nao tem. Duas casas de teto nos outros
 * porque uma so colapsaria 0,67 e 0,71 (−1 e −5 de Ataque) no mesmo texto.
 *
 * O ZERO A DIREITA CAI: `1,5x`, e nao `1,50x`. Sao numeros de HUD, lidos de
 * relance no meio da luta, e a casa que nao informa nada so ocupa espaco.
 */
export function formatarMultiplicador(mult: number): string {
  const arredondado = Math.round(mult * 100) / 100
  const texto = Number.isInteger(arredondado)
    ? String(arredondado)
    : arredondado.toFixed(2).replace(/0$/, '').replace('.', ',')
  return `${texto}x`
}

/** `+100%`, `−33%`. Menos com sinal tipografico, que e o que a tela usa. */
export function formatarVariacao(mult: number): string {
  const pct = Math.round((mult - 1) * 100)
  return pct >= 0 ? `+${pct}%` : `−${Math.abs(pct)}%`
}

/**
 * O texto completo de um estagio: `2x (+100%)`.
 *
 * Multiplicador na FRENTE e porcentagem entre parenteses, e a ordem foi
 * escolhida: "+100% de Ataque" vai ser lido como "+100% de dano", e nao e — a
 * formula de dano tem defesa, tipo e critico depois. `2x de Ataque` nao promete
 * isso, e a porcentagem entre parenteses fica como leitura secundaria.
 *
 * Estagio ZERO devolve `1x (+0%)` em vez de string vazia: quem chama decide se
 * mostra, e devolver vazio faria a tela concatenar texto quebrado.
 */
export function formatarEstagio(stat: StatDeEstagio, estagio: number): string {
  const mult = multiplicadorDoStat(stat, estagio)
  return `${formatarMultiplicador(mult)} (${formatarVariacao(mult)})`
}

/**
 * Prazo em segundos a partir de uma contagem de TURNOS: `15s`.
 *
 * O contador anda em degraus de TURNO_SEGUNDOS (9s, 6s, 3s), porque
 * `turnosRestantes` so decrementa quando o relogio de turno fecha. Contagem lisa
 * exigiria expor o residuo de `proximoTurnoDeStatus` ao HUD, e isso acopla o HUD
 * ao passo da simulacao por um ganho que ninguem pediu. O degrau ja e melhor que
 * hoje: hoje o numero na tela nao diz de quanto e o passo.
 */
export function formatarPrazoEmTurnos(turnos: number): string {
  return `${Math.max(0, Math.round(turnos * TURNO_SEGUNDOS))}s`
}

/** Prazo que ja esta em segundos (o estagio da PH-418 conta assim): `18s`. */
export function formatarPrazoEmSegundos(segundos: number): string {
  return `${Math.max(0, Math.round(segundos))}s`
}

/**
 * A frase de dano contínuo — veneno, queimadura, granizo, areia.
 *
 * E OUTRA FRASE, e nao a de duracao: "Tira 1/16 do HP por turno" fala de RITMO,
 * e "Faltam 9s" fala de PRAZO. Trocar as duas por um formatador so produziria
 * "Tira 1/16 do HP a cada 9s", que e falso.
 */
export const TEXTO_DE_RITMO_CONTINUO = `a cada ${TURNO_SEGUNDOS}s`
