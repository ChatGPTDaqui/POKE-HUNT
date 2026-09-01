// PH-221: sob autoridade, a resposta do servidor (`aplicarEstadoDoServidor`) so
// mexe no `gameStateStore`. O HUD (`StatusRail#usePokeAtivo`) le
// `worldStore.player.poke` durante a hunt, e o unico sync
// (`syncActivePokeToGameState`, 5s) so vai `world -> gameState`. Sem
// `reconciliarPokeAtivoNoWorld`, evolucao / golpe novo / recalculo de stat /
// correcao de nivel do POKE ativo so apareciam no HUD depois do F5.
import { beforeEach, describe, expect, it } from 'vitest'
import { createRng } from '@/core/rng'
import { createPokeInstance } from '@/data/pokes'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { defaultGameStateData } from '@/stores/gameStateDefaults'
import { aplicarEstadoDoServidor } from './autoridade'
import type { RespostaFlush } from './servidor'

const rng = createRng(11)

/** Poke ativo no worldStore. So `player.poke` importa pra esta reconciliacao. */
function porEmCampo(poke: ReturnType<typeof createPokeInstance>): void {
  useWorldStore.setState({ player: { poke } } as never)
}

function pokeAtivoNoHud() {
  return useWorldStore.getState().player?.poke
}

/** Resposta parcial do flush com um time. `expPerdidaPorMorte` opcional pra
 *  exercitar a Edge antiga que nao manda o campo. */
function resposta(team: unknown[], expPerdidaPorMorte?: number): { estado: GameStateDataLike; resumo: RespostaFlush['resumo'] } {
  return {
    estado: { ...defaultGameStateData(), team } as GameStateDataLike,
    resumo: { kills: 0, gold: 0, xp: 0, expPerdidaPorMorte } as unknown as RespostaFlush['resumo'],
  }
}
type GameStateDataLike = ReturnType<typeof defaultGameStateData>

beforeEach(() => {
  useGameStateStore.setState({ ...defaultGameStateData() })
  useWorldStore.setState({ player: null } as never)
})

describe('reconciliarPokeAtivoNoWorld (PH-221)', () => {
  it('evolucao: a especie do POKE em campo segue o servidor sem F5', () => {
    const emCampo = { ...createPokeInstance(rng, 'charmander', 30), uid: 'p1' }
    porEmCampo(emCampo)
    const evoluido = { ...createPokeInstance(rng, 'charizard', 30), uid: 'p1' }

    aplicarEstadoDoServidor(resposta([evoluido]).estado, true, resposta([evoluido]).resumo)

    expect(pokeAtivoNoHud()!.speciesId).toBe('charizard')
    expect(pokeAtivoNoHud()!.stats).toEqual(evoluido.stats)
  })

  it('nivel/exp do servidor MAIOR: o HUD sobe', () => {
    const emCampo = { ...createPokeInstance(rng, 'pikachu', 20), uid: 'p1', exp: 1000 }
    porEmCampo(emCampo)
    const doServ = { ...createPokeInstance(rng, 'pikachu', 24), uid: 'p1', exp: 5000 }

    aplicarEstadoDoServidor(resposta([doServ]).estado, true, resposta([doServ]).resumo)

    expect(pokeAtivoNoHud()!.level).toBe(24)
    expect(pokeAtivoNoHud()!.exp).toBe(5000)
  })

  it('nivel/exp do servidor MENOR: o HUD NAO regride (descompasso de janela / pessimista)', () => {
    const emCampo = { ...createPokeInstance(rng, 'pikachu', 24), uid: 'p1', exp: 5000 }
    porEmCampo(emCampo)
    const doServ = { ...createPokeInstance(rng, 'pikachu', 22), uid: 'p1', exp: 3000 }

    aplicarEstadoDoServidor(resposta([doServ]).estado, true, resposta([doServ]).resumo)

    expect(pokeAtivoNoHud()!.level).toBe(24)
    expect(pokeAtivoNoHud()!.exp).toBe(5000)
  })

  it('exp nao-finita do servidor e ignorada (nunca grava NaN no HUD)', () => {
    const emCampo = { ...createPokeInstance(rng, 'pikachu', 24), uid: 'p1', exp: 5000 }
    porEmCampo(emCampo)
    const doServ = { ...createPokeInstance(rng, 'pikachu', 24), uid: 'p1', exp: NaN }

    aplicarEstadoDoServidor(resposta([doServ]).estado, true, resposta([doServ]).resumo)

    expect(pokeAtivoNoHud()!.exp).toBe(5000)
    expect(Number.isNaN(pokeAtivoNoHud()!.exp)).toBe(false)
  })

  it('hp fica no world (vida ao vivo), so reclampa pro novo teto', () => {
    const emCampo = { ...createPokeInstance(rng, 'charmander', 30), uid: 'p1' }
    emCampo.hp = 5 // machucado no combate
    porEmCampo(emCampo)
    const evoluido = { ...createPokeInstance(rng, 'charizard', 30), uid: 'p1' }

    aplicarEstadoDoServidor(resposta([evoluido]).estado, true, resposta([evoluido]).resumo)

    expect(pokeAtivoNoHud()!.hp).toBe(5) // nao curou sozinho na evolucao
  })

  it('sem hunt aberta (world.player null): no-op, sem estourar', () => {
    const doServ = { ...createPokeInstance(rng, 'pikachu', 24), uid: 'p1' }
    expect(() => aplicarEstadoDoServidor(resposta([doServ]).estado, true, resposta([doServ]).resumo)).not.toThrow()
    expect(pokeAtivoNoHud()).toBeUndefined()
  })

  // ESTE CASO TROCOU DE LADO NA PH-396, e nao foi apagado.
  //
  // Ele travava "POKE em campo que nao esta no time do servidor: NAO MEXE" — o
  // `return` mudo do `!doServ`. Era leitura defensiva razoavel (nao derrubar o
  // POKE por causa de uma resposta estranha), e ela abria um buraco real: POKE
  // vendido, liberado ou mandado pra mochila noutra aba ficava em campo,
  // desenhado e lutando, ate um F5.
  //
  // Achado em 01/09 no dev: a tela mostrava um Scizor Lv 80 em campo enquanto o
  // banco tinha esse POKE na MOCHILA, sem alteracao desde 24/08. O sinal e
  // confiavel — `estadoParcial` afeta so `bagPokes`, `team` vem sempre completo —
  // e nao ha caminho legitimo que ponha em campo quem saiu da equipe.
  //
  // O detalhe da cobertura fica em `pokeFantasmaEmCampo.test.ts`; aqui fica so a
  // inversao, pra quem ler este arquivo nao concluir que a regra antiga vale.
  it('POKE em campo que saiu da equipe do servidor E SUBSTITUIDO (PH-396)', () => {
    const emCampo = { ...createPokeInstance(rng, 'pikachu', 24), uid: 'p1', exp: 5000 }
    porEmCampo(emCampo)
    const outro = { ...createPokeInstance(rng, 'eevee', 10), uid: 'p2' }

    aplicarEstadoDoServidor(resposta([outro]).estado, true, resposta([outro]).resumo)

    expect(pokeAtivoNoHud()!.uid).toBe('p2')
    expect(pokeAtivoNoHud()!.speciesId).toBe('eevee')
  })
})

describe('reconciliarExpAntesDeAplicar — resumo sem expPerdidaPorMorte (Edge antiga)', () => {
  it('queda espuria com orcamento ausente trava no local, nao grava NaN', () => {
    const emCampo = { ...createPokeInstance(rng, 'pikachu', 24), uid: 'p1', exp: 5000 }
    porEmCampo(emCampo)
    useGameStateStore.setState({ team: [{ ...emCampo }] })
    const doServ = { ...createPokeInstance(rng, 'pikachu', 22), uid: 'p1', exp: 3000 }

    // resumo SEM expPerdidaPorMorte (campo undefined)
    aplicarEstadoDoServidor(resposta([doServ]).estado, true, resposta([doServ]).resumo)

    const noGameState = useGameStateStore.getState().team.find((p) => p.uid === 'p1')!
    expect(Number.isNaN(noGameState.exp)).toBe(false)
    expect(noGameState.exp).toBe(5000) // travado no local (orcamento tratado como 0)
  })
})
