// PH-93: quem da F5 dentro de uma hunt tem que voltar NA HUNT, nao no Hospital.
//
// O mapa nunca se perdia — `players.current_map_id` e gravado em todo flush e o
// assentamento devolve `estado.currentMapId = resumo.stoppedEarly ? null :
// sessao.map_id`. Quem jogava fora era o cliente, que montava
// `buildHospitalWorld` incondicionalmente.
//
// Duas coisas aqui nao dao erro nenhum quando quebram, e e por isso que tem
// teste:
//
//  1. Reentrar quando NAO devia (POKE caido, slot vazio) nao lanca: a caçada
//     roda com um cadaver em campo e cada flush credita 0,1 segundo de jogo.
//     O sintoma e "o jogo parou de dar ouro", tres telas longe da causa.
//  2. Assentar a sessao DUAS vezes tambem nao lanca: o segundo `/sessao/fechar`
//     responde `fechada: false` e o consumidor que perder a corrida conclui que
//     nao havia hunt nenhuma. Intermitente por desenho.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { deveRetomarHunt } from './utils'

describe('deveRetomarHunt', () => {
  const vivo = { mapId: 'forest', stoppedEarly: false, hpDoPokeAtivo: 30 }

  it('retoma quando ha mapa, a cacada nao parou sozinha e o POKE esta vivo', () => {
    expect(deveRetomarHunt(vivo)).toBe(true)
  })

  it('nao retoma sem mapa — o jogador nao estava cacando', () => {
    expect(deveRetomarHunt({ ...vivo, mapId: null })).toBe(false)
  })

  it('nao retoma quando a cacada terminou com o POKE no chao', () => {
    // O servidor ja zera o mapa nesse caminho, mas as duas pontas vem de
    // requests diferentes: a coluna de um, a flag de outro. Reentrar aqui
    // queimaria relogio sem creditar nada e sem avisar ninguem.
    expect(deveRetomarHunt({ ...vivo, stoppedEarly: true })).toBe(false)
  })

  it('nao retoma com o slot ativo vazio', () => {
    // POKE vendido, liberado, ou equipe reordenada por outra aba. `enterMap`
    // tambem barra, mas o boot nao pode virar enxurrada de toast.
    expect(deveRetomarHunt({ ...vivo, hpDoPokeAtivo: null })).toBe(false)
  })

  it('nao retoma com o POKE desmaiado', () => {
    expect(deveRetomarHunt({ ...vivo, hpDoPokeAtivo: 0 })).toBe(false)
  })

  it('HP negativo conta como desmaiado', () => {
    // `takeDamage` nao clampa em 0 em todo caminho, e `hp <= 0` e o teste que o
    // resto do motor usa (`isDead`). Um `> 0` invertido aqui passaria pelo
    // teste do zero e falharia so no dano de recuo.
    expect(deveRetomarHunt({ ...vivo, hpDoPokeAtivo: -5 })).toBe(false)
  })
})

// --- assentamento uma vez ----------------------------------------------------

const assentarSessaoPendente = vi.fn()
const servidorAtivo = vi.fn(() => true)
const enterMap = vi.fn()

vi.mock('@/data/remote/autoridade', () => ({
  assentarSessaoPendente: (...args: unknown[]) => assentarSessaoPendente(...args),
}))
vi.mock('@/data/remote/servidor', () => ({
  servidorAtivo: () => servidorAtivo(),
}))
vi.mock('@/engine/controller', () => ({
  controller: { enterMap: (...args: unknown[]) => enterMap(...args) },
}))

describe('assentarUmaVez', () => {
  beforeEach(() => {
    vi.resetModules()
    assentarSessaoPendente.mockReset()
    servidorAtivo.mockReset().mockReturnValue(true)
    enterMap.mockReset()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('dois consumidores compartilham UM request', async () => {
    assentarSessaoPendente.mockResolvedValue({ stoppedEarly: false, kills: 7 })
    const { assentarUmaVez } = await import('./bootDaSessao')

    const [a, b] = await Promise.all([assentarUmaVez(), assentarUmaVez()])

    expect(assentarSessaoPendente).toHaveBeenCalledTimes(1)
    // O ponto nao e so economizar o request: os DOIS precisam receber o mesmo
    // resumo. Se o segundo tivesse chamado de novo, receberia `null` (a sessao
    // ja foi fechada) e o farm offline ou a reentrada sumiria.
    expect(a).toBe(b)
    expect(a).toMatchObject({ kills: 7 })
  })

  it('reiniciar solta a promessa — a conta seguinte nao herda o resumo da anterior', async () => {
    assentarSessaoPendente
      .mockResolvedValueOnce({ stoppedEarly: false, kills: 1 })
      .mockResolvedValueOnce({ stoppedEarly: false, kills: 2 })
    const { assentarUmaVez, reiniciarBootDaSessao } = await import('./bootDaSessao')

    expect(await assentarUmaVez()).toMatchObject({ kills: 1 })
    reiniciarBootDaSessao()
    expect(await assentarUmaVez()).toMatchObject({ kills: 2 })
    expect(assentarSessaoPendente).toHaveBeenCalledTimes(2)
  })
})

// --- reentrada ---------------------------------------------------------------

async function comEstado(estado: {
  currentMapId: string | null
  hp?: number
  semPoke?: boolean
}) {
  const { useGameStateStore } = await import('@/stores/gameStateStore')
  const poke = estado.semPoke ? [] : [{ uid: 'p1', hp: estado.hp ?? 30 } as never]
  useGameStateStore.setState({ currentMapId: estado.currentMapId, team: poke, activeIndex: 0 })
  return useGameStateStore
}

describe('retomarHuntSeHavia', () => {
  beforeEach(() => {
    vi.resetModules()
    assentarSessaoPendente.mockReset().mockResolvedValue({ stoppedEarly: false, kills: 0 })
    servidorAtivo.mockReset().mockReturnValue(true)
    enterMap.mockReset().mockResolvedValue(true)
  })

  it('reentra na hunt que o servidor tinha, em silencio', async () => {
    await comEstado({ currentMapId: 'forest' })
    const { retomarHuntSeHavia } = await import('./bootDaSessao')

    expect(await retomarHuntSeHavia()).toBe(true)
    // `silencioso` e obrigatorio: esta entrada nao nasceu de um clique, e a
    // recusa do servidor viraria um toast de erro sobre acao que o jogador nao
    // disparou.
    //
    // `retomando` (PH-266) e a outra metade da mesma condicao, e por isso entra
    // no mesmo `expect`: e ela que faz o servidor herdar a sala em que a hunt
    // parou. Perde-la nao quebraria nada visivelmente — so devolveria o jogador
    // pra sala 1 a cada F5, que e o bug que a issue veio consertar.
    expect(enterMap).toHaveBeenCalledWith('forest', { silencioso: true, retomando: true })
  })

  it('sem mapa no estado, nao espera o assentamento pra liberar o jogo', async () => {
    // Quem nao estava cacando nao pode pagar um round-trip no boot. O
    // assentamento e disparado (o modal de farm offline depende dele) mas nao
    // esperado.
    let resolver: (v: unknown) => void = () => {}
    assentarSessaoPendente.mockReturnValue(new Promise((r) => { resolver = r }))
    await comEstado({ currentMapId: null })
    const { retomarHuntSeHavia } = await import('./bootDaSessao')

    expect(await retomarHuntSeHavia()).toBe(false)
    expect(assentarSessaoPendente).toHaveBeenCalledTimes(1)
    expect(enterMap).not.toHaveBeenCalled()
    resolver(null)
  })

  it('cacada encerrada com o POKE no chao: zera o mapa em vez de reentrar', async () => {
    assentarSessaoPendente.mockResolvedValue({ stoppedEarly: true, kills: 0 })
    const store = await comEstado({ currentMapId: 'forest' })
    const { retomarHuntSeHavia } = await import('./bootDaSessao')

    expect(await retomarHuntSeHavia()).toBe(false)
    expect(enterMap).not.toHaveBeenCalled()
    // Zerar nao e cosmetico: com o Hospital na tela e `currentMapId`
    // preenchido, o resto do jogo acha que o jogador esta cacando (ver o gate
    // `emHunt` em PokeStatDetail).
    expect(store.getState().currentMapId).toBeNull()
  })

  it('recusa do servidor cai no Hospital sem deixar o mapa preso no estado', async () => {
    enterMap.mockResolvedValue(false)
    const store = await comEstado({ currentMapId: 'forest' })
    const { retomarHuntSeHavia } = await import('./bootDaSessao')

    expect(await retomarHuntSeHavia()).toBe(false)
    expect(store.getState().currentMapId).toBeNull()
  })

  it('jogo sem servidor de autoridade nao tenta nada', async () => {
    servidorAtivo.mockReturnValue(false)
    await comEstado({ currentMapId: 'forest' })
    const { retomarHuntSeHavia } = await import('./bootDaSessao')

    expect(await retomarHuntSeHavia()).toBe(false)
    expect(assentarSessaoPendente).not.toHaveBeenCalled()
    expect(enterMap).not.toHaveBeenCalled()
  })
})
