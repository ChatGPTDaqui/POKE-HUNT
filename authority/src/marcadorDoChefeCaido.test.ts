// PH-472 — o que o flush GRAVA em `sala_protetor`, nos tres estados.
//
// A linha tem tres significados, e os tres precisam existir separados:
//
//     vivo (hpAtual > 0)   a janela seguinte recria fiel, sem re-sortear
//     caido (hpAtual = 0)  a janela seguinte NAO recria, e a sala destrava
//     null                 a sala nao pede protetor, ou trocou
//
// Antes o segundo e o terceiro eram o MESMO valor: `p_protetor: null`, que faz a
// RPC DELETAR a linha. E a ausencia da linha le igual a "nunca nasceu nesta
// sala" — `buildMapWorld` sorteava um protetor novo com HP cheio, e o jogador
// que matou o chefe no fim de uma janela o encontrava inteiro na seguinte.
//
// A solucao nao pede coluna nova: `sala_protetor.hp_atual` e `integer not null`
// sem CHECK, entao 0 e armazenavel. Mesma semantica de tres valores que a
// PH-307 deu ao `sequence_hp`.
import { describe, expect, it } from 'vitest'
import type { ProtetorPendente, SalaAtiva } from '#engine'

import { payloadDoProtetorOuDoCaido } from './progresso.js'

const CHEFE: ProtetorPendente = {
  uid: '11111111-1111-1111-1111-111111111111',
  speciesId: 'onix',
  encounterId: 'mata_e1_onix',
  level: 12,
  ivs: { hp: 20, atkFis: 20, atkEsp: 20, def: 20, defEsp: 20, speed: 20 },
  rarity: 'comum',
  isShiny: false,
  hpAtual: 340,
}

/** `volcano` pertence ao bioma igneo, entao `protetorDaSala` responde de verdade. */
const SALA: SalaAtiva = { indice: 0, chave: 'volcano', abates: 30, ciclos: 0 }
const MAPA = { id: 'mata_e1' }

describe('o payload de sala_protetor', () => {
  it('chefe VIVO grava o HP dele', () => {
    const p = payloadDoProtetorOuDoCaido(
      { protetorPendente: CHEFE, protetorCaido: null, sala: SALA, mapDef: MAPA },
      'guardian',
    )
    expect(p).not.toBeNull()
    expect(p!.hpAtual).toBe(340)
    expect(p!.tipo).toBe('guardian')
    expect(p!.uid).toBe(CHEFE.uid)
  })

  it('chefe CAIDO grava hpAtual 0, com a identidade dele', () => {
    // O caso que o bug nao tinha: era `null` aqui, e a RPC deletava a linha.
    const p = payloadDoProtetorOuDoCaido(
      { protetorPendente: null, protetorCaido: CHEFE, sala: SALA, mapDef: MAPA },
      null,
    )
    expect(p, 'o caido nao gerou linha nenhuma').not.toBeNull()
    expect(p!.hpAtual).toBe(0)
    expect(p!.uid).toBe(CHEFE.uid)
    expect(p!.speciesId).toBe('onix')
  })

  it('o TIPO do caido e re-derivado da sala, e nao perdido', () => {
    // A coluna e `not null` com `check (tipo in ('guardian','lord'))`, e
    // `ProtetorPendente` nunca carregou o proprio tipo. Sem a re-derivacao a
    // RPC recusaria a linha — o marcador seria perdido por erro de banco, que e
    // pior que o bug original porque quebra o flush inteiro.
    const naUltima: SalaAtiva = { ...SALA, indice: 2 }
    const p = payloadDoProtetorOuDoCaido(
      { protetorPendente: null, protetorCaido: CHEFE, sala: naUltima, mapDef: MAPA },
      null,
    )
    // `mata_e1` tem 3 salas, entao o indice 2 e a ultima e pede o Lord.
    expect(p!.tipo).toBe('lord')
  })

  it('sem chefe nenhum grava `null` — a RPC deleta a linha, e agora isso quer dizer UMA coisa', () => {
    expect(payloadDoProtetorOuDoCaido(
      { protetorPendente: null, protetorCaido: null, sala: SALA, mapDef: MAPA },
      null,
    )).toBeNull()
  })

  it('chefe VIVO tem precedencia sobre o caido', () => {
    // Estado que o motor nao produz (`resolverProtetorDaSala` zera o pendente
    // ao guardar o caido), mas a precedencia tem que ser explicita: gravar o
    // caido com um chefe vivo em campo destravaria a sala no meio da luta.
    const p = payloadDoProtetorOuDoCaido(
      { protetorPendente: CHEFE, protetorCaido: { ...CHEFE, uid: 'outro' }, sala: SALA, mapDef: MAPA },
      'guardian',
    )
    expect(p!.hpAtual).toBe(340)
    expect(p!.uid).toBe(CHEFE.uid)
  })

  it('sala sem bioma nao gera linha — a coluna `tipo` recusaria', () => {
    // Sub-bioma que nao pertence a bioma nenhum: `protetorDaSala` devolve
    // `null` e nao ha tipo pra gravar. Nao acontece (um chefe so cai numa sala
    // que o pedia), e por isso mesmo nao pode virar linha perdida em silencio.
    const p = payloadDoProtetorOuDoCaido(
      {
        protetorPendente: null,
        protetorCaido: CHEFE,
        sala: { ...SALA, chave: 'chave-que-nao-existe' },
        mapDef: MAPA,
      },
      null,
    )
    expect(p).toBeNull()
  })
})
