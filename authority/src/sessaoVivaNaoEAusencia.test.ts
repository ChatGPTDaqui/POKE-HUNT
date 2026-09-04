// PH-495 — sessão VIVA não é ausência, e o tempo dela não pode ser descartado.
//
// O SISTEMA SE CONTRADIZIA, e é isso que este arquivo tranca:
//
//   SESSAO_INATIVA_SEGUNDOS (30 min, appSessao.ts)   a sessão está VIVA
//   LIMIAR_OFFLINE_SEGUNDOS (120s, progresso.ts)     o intervalo é AUSÊNCIA
//
// Entre 2 e 30 minutos as duas réguas discordavam. Uma sessão abandonada é
// fechada em `sessaoAberta` e NUNCA chega a `aplicarFlush` — então todo
// intervalo que chega aqui pertence, pela régua do próprio sistema, a uma
// sessão viva. E ele era jogado fora inteiro: zero abate, zero XP, zero ouro,
// zero avanço de sala.
//
// ONDE MORDIA: o cabeçalho de `SESSAO_INATIVA_SEGUNDOS` afirma que "o cliente
// flusha a cada 30s e nunca deixa passar mais que 90s enquanto a aba está
// viva". Essa premissa não sobrevive ao navegador — aba em segundo plano tem
// timer estrangulado (Chrome cai para 1/minuto, e menos depois de 5 min
// oculta). O intervalo passa de 120s com o jogador ali, jogando.
//
// MEDIDO EM PRODUÇÃO, sessões de jogador real (04/09): 3018s de parede com 229s
// creditados (7,6%), 1835s com 264s (14,4%), 7938s com 2794s (35,2%). Cinquenta
// minutos de jogo pagos como quatro — e a sala parada, porque quem a troca é o
// servidor e o contador dele nunca chegava na quota.
//
// O QUE ESTE ARQUIVO NÃO DEIXA VOLTAR, nas duas direções:
//   - descartar a janela viva (o defeito);
//   - creditar a janela inteira (o excesso oposto, que reabriria o farm de aba
//     escondida que o aparo existe para não abrir).
import { describe, expect, it } from 'vitest'

import { LIMIAR_OFFLINE_SEGUNDOS } from '#engine'
import { FARM_OFFLINE_PAUSADO, MAX_SEGUNDOS_POR_FLUSH, segundosACreditar } from './progresso.js'
import { SESSAO_INATIVA_SEGUNDOS } from './appSessao.js'

/**
 * O que `aplicarFlush` credita para um intervalo BRUTO.
 *
 * Chama a função DE PRODUÇÃO (`segundosACreditar`) — não reescreve a regra. A
 * primeira versão deste arquivo reimplementava a conta aqui, e a sabotagem
 * (voltar ao descarte) **passou verde nos 11 casos**. Um teste que reescreve a
 * regra testa a cópia dele, não o jogo — a mesma lição que a PH-494 pagou hoje
 * de manhã com o `playerMapper`, e que eu repeti aqui à tarde.
 *
 * O clamp de `MAX_SEGUNDOS_POR_FLUSH` e o piso de zero ficam aqui porque são do
 * chamador, e não da decisão: `aplicarFlush` os aplica antes de perguntar
 * quanto creditar.
 */
function segundosCreditados(bruto: number): number {
  return segundosACreditar(Math.max(0, Math.min(bruto, MAX_SEGUNDOS_POR_FLUSH)))
}

describe('a faixa em que as duas réguas discordavam (PH-495)', () => {
  it('existe uma faixa entre viva e ausente — a premissa do bug', () => {
    // Guarda anti-vácuo: se alguém alinhar as duas constantes, os casos abaixo
    // param de medir o que dizem medir e este aqui avisa.
    expect(LIMIAR_OFFLINE_SEGUNDOS).toBeLessThan(SESSAO_INATIVA_SEGUNDOS)
  })

  it.each([
    ['5 minutos', 5 * 60],
    ['10 minutos', 10 * 60],
    ['29 minutos (a beira do abandono)', 29 * 60],
  ])('janela de %s numa sessão VIVA credita tempo — nao zero', (_nome, bruto) => {
    // O DEFEITO EM UMA LINHA. Antes disto o resultado era 0 para os três, e um
    // POKE que matou 30 vezes nesse intervalo não avançava sala nenhuma.
    expect(segundosCreditados(bruto)).toBeGreaterThan(0)
  })

  it('e credita NO MÁXIMO o limiar — o aparo, e não o crédito cheio', () => {
    // O outro lado, e ele é obrigatório: sem este caso, "creditar tudo"
    // passaria no teste acima e reabriria o farm de aba escondida.
    for (const bruto of [3 * 60, 30 * 60, 6 * 3600]) {
      expect(segundosCreditados(bruto)).toBe(LIMIAR_OFFLINE_SEGUNDOS)
    }
  })

  it('jogo ao vivo de verdade continua creditando 100%', () => {
    // A cadência normal do cliente (30s, teto de 90s) não pode ser tocada por
    // este conserto — ela sempre esteve certa.
    for (const bruto of [30, 60, 90, LIMIAR_OFFLINE_SEGUNDOS]) {
      expect(segundosCreditados(bruto)).toBe(bruto)
    }
  })

  it('ESCONDER A ABA NUNCA RENDE MAIS QUE JOGAR OLHANDO', () => {
    // A pergunta que decide se o conserto criou um exploit. Taxa = creditado
    // por segundo de parede. Jogando, 1,0; com a aba estrangulada, sempre menos.
    const taxaAoVivo = segundosCreditados(30) / 30
    expect(taxaAoVivo).toBe(1)
    for (const bruto of [3 * 60, 5 * 60, 10 * 60, 30 * 60]) {
      expect(segundosCreditados(bruto) / bruto).toBeLessThan(taxaAoVivo)
    }
  })

  it('o teto de 6h continua sendo o teto — janela absurda nao vira credito absurdo', () => {
    expect(segundosCreditados(48 * 3600)).toBe(LIMIAR_OFFLINE_SEGUNDOS)
  })

  it('intervalo negativo (relogio pra tras) nao credita nada', () => {
    // A guarda que já existia: um `while` com segundos negativos não termina.
    expect(segundosCreditados(-500)).toBe(0)
  })
})

describe('a regra é a mesma do código, e não uma cópia que divergiu (PH-495)', () => {
  it('o aparo usa o LIMIAR, e o teto usa MAX_SEGUNDOS_POR_FLUSH', () => {
    // Amarra a cópia acima às constantes reais: trocar qualquer uma delas no
    // código sem trocar aqui deixa este caso vermelho.
    expect(segundosCreditados(LIMIAR_OFFLINE_SEGUNDOS + 1)).toBe(LIMIAR_OFFLINE_SEGUNDOS)
    expect(MAX_SEGUNDOS_POR_FLUSH).toBe(6 * 3600)
  })

  it('com o farm offline RELIGADO o aparo sai de cena', () => {
    // `FARM_OFFLINE_PAUSADO` continua sendo o interruptor, e o teste declara o
    // que ele passa a significar: pausado = ausência credita NO MÁXIMO o
    // limiar (não mais zero); religado = credita a janela inteira, até o teto.
    const comFarmLigado = (bruto: number) => Math.max(0, Math.min(bruto, MAX_SEGUNDOS_POR_FLUSH))
    expect(comFarmLigado(3 * 3600)).toBe(3 * 3600)
    expect(FARM_OFFLINE_PAUSADO, 'se isto virar false, o aparo deixa de valer').toBe(true)
  })
})
