// PH-147 — a resolução de `<CopyOf>` não pode parar de seguir a cadeia.
//
// Este é o único comportamento do módulo que já errou de verdade, duas vezes,
// nas primeiras versões dos dois scripts de conferência: contar nome de arquivo
// em vez de seguir a cadeia listou espécies como "sem a animação" quando elas
// têm. O sintoma não é erro — é um número plausível num relatório.
//
// Mora em `scripts/lib/` e não em `src/`: o módulo lê disco (`node:fs`), e
// `src/` não tem os types de node. O `test.exclude` do vite.config.ts não corta
// `scripts/`, e o ambiente padrão do Vitest já é `node`.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { lerAnimData, resolverAnim } from './animdata.mjs'

// Um `AnimData.xml` de mentira, com os quatro casos que importam:
//
//   Walk    nó completo, com PNG    -> resolve nele mesmo
//   Idle    só CopyOf, sem PNG      -> resolve em Walk (o caso do Silcoon)
//   Faint   CopyOf em cadeia dupla  -> resolve em Walk, dois saltos
//   Shoot   nó completo, SEM PNG    -> null (a espécie não tem)
//   Perdida CopyOf pra quem não há  -> null
//   CicloA  CopyOf circular         -> null, sem travar
const XML = `<AnimData>
  <Anims>
    <Anim>
      <Name>Walk</Name>
      <FrameWidth>32</FrameWidth>
      <FrameHeight>40</FrameHeight>
      <Durations><Duration>6</Duration><Duration>8</Duration></Durations>
    </Anim>
    <Anim>
      <Name>Idle</Name>
      <CopyOf>Walk</CopyOf>
    </Anim>
    <Anim>
      <Name>Hurt</Name>
      <CopyOf>Idle</CopyOf>
    </Anim>
    <Anim>
      <Name>Shoot</Name>
      <FrameWidth>48</FrameWidth>
      <FrameHeight>48</FrameHeight>
      <Durations><Duration>4</Duration></Durations>
    </Anim>
    <Anim>
      <Name>Perdida</Name>
      <CopyOf>NaoExiste</CopyOf>
    </Anim>
    <Anim>
      <Name>CicloA</Name>
      <CopyOf>CicloB</CopyOf>
    </Anim>
    <Anim>
      <Name>CicloB</Name>
      <CopyOf>CicloA</CopyOf>
    </Anim>
  </Anims>
</AnimData>`

let pasta = ''
let mapa = {}

beforeAll(() => {
  pasta = mkdtempSync(join(tmpdir(), 'animdata-'))
  mkdirSync(pasta, { recursive: true })
  writeFileSync(join(pasta, 'AnimData.xml'), XML)
  // SÓ o PNG de Walk. É isso que faz `Idle` e `Hurt` só existirem por CopyOf, e
  // `Shoot` — que tem nó completo — não existir de verdade.
  writeFileSync(join(pasta, 'Walk-Anim.png'), '')
  mapa = lerAnimData(join(pasta, 'AnimData.xml'))
})

afterAll(() => {
  if (pasta) rmSync(pasta, { recursive: true, force: true })
})

describe('lerAnimData', () => {
  it('lê os sete nós', () => {
    expect(Object.keys(mapa).sort())
      .toEqual(['CicloA', 'CicloB', 'Hurt', 'Idle', 'Perdida', 'Shoot', 'Walk'])
  })

  it('lê geometria e durações do nó completo', () => {
    expect(mapa.Walk).toEqual({
      copyOf: null, frameWidth: 32, frameHeight: 40, duracoes: [6, 8],
    })
  })

  it('nó que só aponta para outro não tem geometria própria', () => {
    // `frameWidth` nulo é o que separa "nó de verdade" de "nó que só existe
    // para apontar", e é por isso que `resolverAnim` o exige.
    expect(mapa.Idle.copyOf).toBe('Walk')
    expect(mapa.Idle.frameWidth).toBeNull()
  })
})

describe('resolverAnim segue a cadeia de CopyOf', () => {
  it('nó com PNG próprio resolve nele mesmo', () => {
    expect(resolverAnim('Walk', mapa, pasta)?.nome).toBe('Walk')
  })

  it('nó sem PNG resolve no CopyOf — o caso do Silcoon', () => {
    // O caso concreto: Silcoon não tem `Idle-Anim.png` e TEM a animação Idle.
    // Se isto quebrar, os dois scripts de conferência voltam a listar espécies
    // como "sem a animação" quando elas têm, e o levantamento de PH-122 volta a
    // errar a contagem.
    const r = resolverAnim('Idle', mapa, pasta)
    expect(r?.nome).toBe('Walk')
    expect(r?.arquivo).toBe(join(pasta, 'Walk-Anim.png'))
    // A geometria devolvida é a do nó RESOLVIDO, não a do pedido — quem importa
    // grava esses números em `battleSpriteAnims.ts`, e os do nó vazio seriam
    // `null`.
    expect(r?.no.frameWidth).toBe(32)
    expect(r?.no.duracoes).toEqual([6, 8])
  })

  it('segue mais de um salto', () => {
    // `Hurt -> Idle -> Walk`. Uma implementação que olhasse só um nível pararia
    // em `Idle`, que não tem PNG, e devolveria null — parecendo "não tem arte".
    expect(resolverAnim('Hurt', mapa, pasta)?.nome).toBe('Walk')
  })

  it('nó completo SEM png em disco devolve null', () => {
    // Ter o nó declarado não é ter a arte. É o caso de `Faint` na maioria das
    // espécies.
    expect(resolverAnim('Shoot', mapa, pasta)).toBeNull()
  })

  it('cadeia que termina em nada devolve null', () => {
    expect(resolverAnim('Perdida', mapa, pasta)).toBeNull()
  })

  it('CopyOf circular devolve null em vez de travar', () => {
    // Nenhum arquivo real tem ciclo. O `Set` de vistos existe porque um ciclo
    // travaria o processo inteiro num laço sem fim, e o custo de evitar é nada.
    expect(resolverAnim('CicloA', mapa, pasta)).toBeNull()
  })

  it('nome que não existe no mapa devolve null', () => {
    expect(resolverAnim('Inventada', mapa, pasta)).toBeNull()
  })
})
