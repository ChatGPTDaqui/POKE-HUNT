// PH-101: os dois numeros que o jogador le antes de comprometer ouro num
// leilao, e o texto que diz se ainda da tempo.
//
// Nenhum dos dois DECIDE nada — quem decide e `dar_lance` dentro da transacao.
// Mas os dois governam o que o jogador acredita, e divergir do servidor aqui
// produz o pior tipo de erro de interface: o clique e recusado por um motivo
// que a tela acabou de dizer que nao existia.
import { describe, expect, it } from 'vitest'

import { formatarRestante, proximoLanceMinimo } from './tempoDeLeilao'

describe('proximoLanceMinimo espelha a regra de dar_lance (PH-101)', () => {
  it('sem lance ainda, o minimo e o piso do leilao', () => {
    expect(proximoLanceMinimo(null, 1000, 100)).toBe(1000)
  })

  it('com lance, e o maior mais o incremento', () => {
    expect(proximoLanceMinimo(1000, 1000, 100)).toBe(1100)
    expect(proximoLanceMinimo(2500, 1000, 250)).toBe(2750)
  })

  it('o piso NAO se soma depois do primeiro lance', () => {
    // O erro facil aqui e `max(lanceMinimo, melhorOferta + incremento)`, que
    // parece mais seguro e da o mesmo numero na maioria dos casos. Ele erra
    // exatamente quando o primeiro lance ja veio muito acima do piso: com piso
    // 1000, lance de 50.000 e incremento 100, o minimo e 50.100 — nao 1000, e
    // nao "o maior dos dois" (que daria 50.100 tambem, mas por coincidencia).
    // O caso que separa e piso ALTO: piso 100.000 com lance de 1.000 e
    // impossivel, porque o servidor nunca teria aceitado aquele lance.
    expect(proximoLanceMinimo(50000, 1000, 100)).toBe(50100)
  })

  it('anuncio de servidor antigo (sem as colunas) nao trava o campo', () => {
    // Errar pra PERMITIR e ser recusado com frase e melhor que errar pra
    // bloquear e o jogador nao ter como dar lance nenhum.
    expect(proximoLanceMinimo(null, null, null)).toBe(1)
    expect(proximoLanceMinimo(500, null, null)).toBe(501)
  })

  it('incremento ausente com lance existente ainda exige superar', () => {
    // O que NAO pode acontecer e devolver o proprio valor do lance atual: o
    // servidor exige `>= maior + incremento`, entao um minimo igual ao maior
    // seria sempre recusado.
    expect(proximoLanceMinimo(500, 100, null)).toBeGreaterThan(500)
  })
})

describe('formatarRestante (PH-101)', () => {
  it('tempo esgotado nao mostra numero negativo', () => {
    // Existe uma janela de ate ~60s em que `expira_em` passou e o cron ainda
    // nao varreu. Mostrar "-42s" faria parecer defeito; "encerrando..." e o que
    // esta de fato acontecendo.
    expect(formatarRestante(0)).toBe('encerrando...')
    expect(formatarRestante(-42)).toBe('encerrando...')
  })

  it('horas escondem os segundos, minutos nao', () => {
    // Num leilao de 24h o segundo nao informa nada e pisca sem parar. Perto do
    // fim ele e a unica coisa que importa.
    expect(formatarRestante(3600 * 5 + 61)).toBe('5h 01min')
    expect(formatarRestante(125)).toBe('2min 05s')
    expect(formatarRestante(9)).toBe('9s')
  })

  it('a virada de minuto nao mostra "0min"', () => {
    expect(formatarRestante(59)).toBe('59s')
    expect(formatarRestante(60)).toBe('1min 00s')
  })
})
