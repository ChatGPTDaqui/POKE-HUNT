// Acoes que a UI chama (o  do main.js original).
//
// Tudo aqui toca as stores do navegador. O nucleo de simulacao vive em
// simulation.ts justamente pra poder rodar headless no servidor sem arrastar
// isto junto — ver a nota de topo de la.
import { SPECIES, createPokeInstance } from '@/data/pokes'
import { getItem } from '@/data/items'
import { evolvePokeInstance } from './systems/progressionSystem'
import { resetStats } from './systems/farmRates'
import { isDead, heal, VFX_CURA_DURACAO } from './entity'
import {
  buildHospitalWorld, buildMapWorld, shinyPrefix, syncActivePokeToGameState,
  STARTER_LEVEL, STARTER_IVS, STARTER_RARITY,
} from './simulation'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useWorldStore } from '@/stores/worldStore'
import { useToastStore } from '@/stores/toastStore'
import { celebracaoStore } from '@/stores/celebracaoStoreVanilla'
import { preloadEspecies, preloadHunt } from '@/data/preload'
import { getMap } from '@/data/maps'
import type { Point } from './types'
import { pedirAcao, abrirSessaoDeHunt, fecharSessaoDeHunt } from '@/data/remote/autoridade'
import { servidorAtivo } from '@/data/remote/servidor'

/**
 * Aviso de "seu POKE ja passou do teto desta hunt" (PH-208), ou `null` quando
 * o nivel ainda cabe na faixa (ou a hunt nao tem faixa conhecida).
 *
 * Puro de proposito: o disparo mora em `enterMap`, que roda uma vez por sessao
 * de hunt, mas o gatilho (`level > levelRange[1]`) e testavel sozinho, sem
 * servidor. `levelRange[1]` e o teto nominal da hunt — a janela por sala
 * (`salaSystem.janelaDaSala`) afunda a partir dele, entao passar do teto
 * nominal ja significa que nenhuma sala rende XP cheio.
 */
export function avisoDeTetoDeHunt(pokeLevel: number, mapId: string): string | null {
  const teto = getMap(mapId)?.levelRange[1]
  if (teto == null || pokeLevel <= teto) return null
  return `Seu POKE (Lv ${pokeLevel}) ja passou do teto desta hunt (Lv ${teto}). `
    + 'O XP daqui pra frente rende pouco — troque de hunt ou leve um POKE mais fraco.'
}

export const controller = {
  returnToHospital(hospitalSpot: Point): void {
    const gameState = useGameStateStore.getState()
    void fecharSessaoDeHunt()
    gameState.setCurrentMapId(null)
    const world = buildHospitalWorld(gameState.team[gameState.activeIndex] || null, hospitalSpot, useWorldStore.getState())
    useWorldStore.getState().setWorld(world)
  },

  // Devolve se o jogador REALMENTE entrou. Assincrona de proposito: a sessao
  // precisa ser aceita pelo servidor ANTES de trocar a cena.
  //
  // Antes isto era `void abrirSessaoDeHunt(...)` e a cena trocava sem esperar.
  // O resultado era o pior dos dois mundos: com o servidor recusando (hunt
  // trancada, POKE que nao e da equipe, sessao invalida), o jogador entrava,
  // via o combate rodando na tela e nao ganhava nada — sem nenhum aviso, porque
  // a simulacao local continua desenhando normalmente. Um erro que so aparece
  // como "o jogo parou de dar ouro".
  // `silencioso` desliga os TRES avisos deste caminho (slot vazio, POKE caido,
  // recusa do servidor). Existe pro unico chamador que nao nasce de um clique:
  // a reentrada automatica na hunt no boot (PH-93, features/game/bootDaSessao).
  // Ali o jogador nao pediu nada, cair no Hospital ja e o estado seguro, e um
  // toast de erro sobre acao que ninguem disparou so ensina a ignorar toast.
  async enterMap(mapId: string, opcoes?: { silencioso?: boolean }): Promise<boolean> {
    const avisar = !opcoes?.silencioso
    const gameState = useGameStateStore.getState()
    const activePoke = gameState.team[gameState.activeIndex]
    // Slot ativo vazio. Era um `return false` MUDO, e custou uma sessao inteira
    // de diagnostico: o botao "Entrar" simplesmente nao fazia nada — sem aviso,
    // sem request, sem erro no console —, e a leitura obvia era "o clique nao
    // esta registrando". Acontece quando `activeIndex` aponta pra um slot que
    // deixou de existir (POKE vendido, liberado, ou o time reordenado por outra
    // aba), e o HUD nao denuncia porque ele desenha o POKE do `worldStore`, que
    // ainda tem o antigo em memoria.
    if (!activePoke) {
      if (avisar) {
        useToastStore.getState().pushToast(
          'Nenhum POKE selecionado na equipe. Abra Equipe e coloque um em campo.', 'error', 'world',
        )
      }
      return false
    }
    // POKE caido nao luta, e uma cacada com ele so queima o relogio: a simulacao
    // para no primeiro passo e cada flush credita o intervalo por 0,1 segundo de
    // jogo. O servidor tambem recusa (defesa em profundidade), mas aqui a
    // resposta e imediata e diz o que fazer.
    if (activePoke.hp <= 0) {
      if (avisar) {
        useToastStore.getState().pushToast(
          'Seu POKE esta desmaiado. Cure na Enfermeira antes de cacar.', 'error', 'world',
        )
      }
      return false
    }
    const sessao = await abrirSessaoDeHunt(mapId, activePoke.uid, { avisarErro: avisar })
    if (!sessao.ok) return false
    // Arte de TODA especie do pool na memoria antes de a cena aparecer — senao o
    // primeiro encontro com cada uma pisca sem sprite enquanto o PNG baixa (ver
    // data/preload.ts). Tem teto de tempo proprio, entao rede ruim atrasa a
    // entrada mas nunca a impede. Depois da sessao ja estar aceita de proposito:
    // se o servidor recusar, nao ha por que gastar banda.
    await preloadHunt(mapId, { speciesId: activePoke.speciesId, isShiny: activePoke.isShiny })
    // A sala inicial e a que o servidor decidiu na abertura. Sem passa-la aqui, a
    // simulacao local sorteia a propria e o jogador ve o sub-bioma trocar poucos
    // segundos depois de entrar, quando a do servidor chega no primeiro flush.
    // PH-140: `clima` entra JUNTO da sala. A presenca da chave e o que diz ao
    // motor "ha autoridade, nao derive" — o cliente nao tem a semente da sessao
    // (ver ProgressoDaSessao.clima). Servidor mais antigo nao manda o campo, e
    // ai o cliente volta a derivar, como no jogo local.
    const world = buildMapWorld(
      mapId, activePoke, useWorldStore.getState(),
      sessao.sala ? { sala: sessao.sala, clima: sessao.clima ?? null } : undefined,
      gameState.especialidades,
    )
    // Com sessao aberta no servidor, a sala seguinte tambem e DELE (ver
    // engine/systems/salaSystem.ts#registrarAbate): a simulacao local para de
    // sortear sub-bioma e passa a so contar abate, e a troca chega no flush.
    // Sem servidor (jogo local) o sorteio local continua sendo o unico.
    world.salaSobAutoridade = servidorAtivo()
    useWorldStore.getState().setWorld(world)
    // A FLAG POR ULTIMO, e nao antes de montar a cena (PH-156).
    //
    // `currentMapId` e o que o resto do jogo le como "estou numa cacada" — e a
    // trava que esconde a edicao dos 4 golpes no perfil, entre outras coisas.
    // Ela ficava gravada aqui em cima, logo depois do `preloadHunt`, e o
    // problema e o intervalo: entre a gravacao e o `setWorld` acontecem a
    // montagem do mundo e a leitura do `worldStore`. Qualquer excecao ali
    // deixava a flag ligada com o Hospital na tela — e nada reconciliava isso,
    // entao a trava sobrevivia ate o jogador recarregar a pagina (o boot zera,
    // e e por isso que o sintoma era "so destrava com F5").
    //
    // Gravando depois, o estado inconsistente nao chega a existir: ou a cena
    // subiu e a flag acompanha, ou nenhuma das duas coisas aconteceu.
    //
    // A ordem e segura porque `buildMapWorld` NAO le `currentMapId`, e o
    // observador de `useSaidaAoEncerrarSessao` so acorda com mudanca no
    // `gameStateStore` — quando esta linha roda, o `mapDef` ja esta no lugar.
    gameState.setCurrentMapId(mapId)
    resetStats(gameState) // painel de taxa de farm reinicia do zero a cada hunt nova
    // PH-208: o POKE ativo ja passou do teto de nivel desta hunt. Sem sinal, o
    // jogador fica preso numa hunt facil demais — Zoka/Noctowl (Lv33) rodou 4
    // hunts de Faixa 1 (teto Lv30) por 4h39min e o nivel nunca mudou. Uma vez
    // so por entrada: este caminho roda uma vez por sessao de hunt, nunca por
    // abate ou tick. Silenciado junto com os avisos de recusa na reentrada de
    // boot (`silencioso`), onde o jogador nao pediu nada.
    const avisoTeto = avisar ? avisoDeTetoDeHunt(activePoke.level, mapId) : null
    if (avisoTeto) useToastStore.getState().pushToast(avisoTeto, 'info', 'world')
    return true
  },

  // Primeira tela de um jogo novo (antes da escolha do inicial). Devolve se o
  // nome foi aceito — a tela so avanca nesse caso, senao o jogador seguiria pro
  // inicial achando que registrou um nome que o servidor recusou (ja em uso,
  // fora do formato). O aviso do erro vem do proprio `pedirAcao`.
  async definirNomeDoTreinador(nome: string): Promise<boolean> {
    const gameState = useGameStateStore.getState()
    return pedirAcao(
      { tipo: 'definirNomeDoTreinador', nome },
      () => { gameState.setTrainer({ ...gameState.trainer, name: nome }) },
    )
  },

  chooseStarter(speciesId: string, hospitalSpot: Point): void {
    const gameState = useGameStateStore.getState()
    if (gameState.team.length > 0) return
    void pedirAcao(
      { tipo: 'escolherStarter', speciesId },
      () => {
        const poke = useWorldStore.getState().sortear((rng) => createPokeInstance(rng, speciesId, STARTER_LEVEL, { ivs: STARTER_IVS, rarity: STARTER_RARITY }))
        poke.originalTrainer = gameState.trainer.name // espelha o servidor (ver acoes.ts#escolherStarter)
        gameState.addPokeToTeam(poke)
        gameState.setActiveIndex(0)
      },
    ).then(() => {
      // O mundo e reconstruido DEPOIS, dos dois lados: no caminho do servidor a
      // POKE so existe quando a resposta chega (foi ele quem a criou), e no
      // caminho local ela ja esta na store. Ler de `team[0]` aqui cobre os dois
      // sem duplicar a montagem da cena.
      const poke = useGameStateStore.getState().team[0]
      if (poke) useWorldStore.getState().setWorld(buildHospitalWorld(poke, hospitalSpot, useWorldStore.getState()))
    })
  },

  resetGame(): void {
    const gameState = useGameStateStore.getState()
    // Fecha a sessao de hunt ANTES de apagar. Sem isto ela ficava aberta
    // apontando pro `poke_uid` de um POKE que o reset acabou de destruir, e todo
    // request seguinte (inclusive escolher o novo inicial) morria no flush
    // obrigatorio com "o POKE desta sessao nao esta mais na equipe" — o botao
    // "Iniciar novo jogo" apagava o progresso e deixava a conta travada na tela
    // de escolha do inicial. O servidor tambem aprendeu a se curar disso (ver
    // aplicarFlush), mas fechar aqui e o que para o timer de flush de 30s no
    // cliente.
    void fecharSessaoDeHunt()
      .then(() => pedirAcao({ tipo: 'reiniciarJogo' }, () => {
        // Espelha o servidor (acoes.ts#reiniciarJogo): o nick sobrevive ao
        // reset. La isso e obrigatorio (o nick e UNICO no banco e voltar pro
        // 'Treinador' padrao colide); aqui e so pra os dois caminhos deixarem a
        // conta no mesmo estado.
        const nome = gameState.trainer.name
        gameState.resetToDefaults()
        useGameStateStore.getState().setTrainer({ ...useGameStateStore.getState().trainer, name: nome })
      }))
      .then(() => {
        // Reconstroi a cena so DEPOIS: no caminho do servidor o estado zerado so
        // chega com a resposta, e montar o mundo antes deixaria o POKE antigo em
        // campo com a conta ja apagada.
        useWorldStore.getState().setWorld(buildHospitalWorld(null, { x: 0, y: 0 }))
      })
  },

  /**
   * Liga/desliga um golpe da rotacao automatica (duplo clique no slot).
   *
   * BUG REAL CORRIGIDO — e o listener de duplo clique nunca esteve quebrado.
   * A tela chamava `useGameStateStore.toggleAbilityDisabled` DIRETO, e sob
   * autoridade do servidor (Fase D) isso tem dois efeitos, os dois invisiveis:
   *
   *  1. O estado local muda, o slot mostra "OFF", e o proximo flush (ate 30s
   *     depois) sobrescreve o estado inteiro com o do servidor — o golpe volta
   *     a aparecer ligado sozinho.
   *  2. Quem escolhe o golpe em combate e o SERVIDOR, e ele nunca soube do
   *     desligamento. Mesmo dentro dos 30s de ilusao, o POKE continuava usando
   *     o golpe.
   *
   * O manipulador `alternarHabilidade` ja existia no servidor desde a Fase D;
   * so faltava a tela chamar por ele.
   *
   * A escrita no `worldStore` e separada porque o POKE em campo e uma COPIA
   * (ver a nota de HP/EXP em CLAUDE.md): sem isto, o desligamento so valeria
   * apos a proxima troca de cena.
   */
  toggleAbility(pokeUid: string, abilityId: string): void {
    const gameState = useGameStateStore.getState()
    void pedirAcao(
      { tipo: 'alternarHabilidade', pokeUid, abilityId },
      () => gameState.toggleAbilityDisabled(pokeUid, abilityId),
    ).then((ok) => {
      if (!ok) return
      const atualizado = useGameStateStore.getState().team.find((p) => p.uid === pokeUid)
      if (!atualizado) return
      useWorldStore.getState().update((draft) => {
        if (draft.player && draft.player.poke.uid === pokeUid) {
          draft.player.poke = { ...draft.player.poke, disabledAbilities: atualizado.disabledAbilities }
        }
      })
    })
  },

  /**
   * Troca os no maximo 4 golpes que o POKE leva pra luta.
   *
   * Quem recusa a troca dentro de uma hunt e o SERVIDOR
   * (RPC `definir_golpes_ativos`) — a tela so esconde o botao. Por isso o
   * `fallback` local nao roda nada quando ha hunt aberta: escrever no estado
   * local uma troca que o servidor vai rejeitar deixaria os dois lados
   * discordando ate o proximo carregamento.
   *
   * A escrita no `worldStore` acompanha `toggleAbility`: o POKE em campo e uma
   * copia, e sem isto a troca so valeria na proxima cena.
   */
  setActiveAbilities(pokeUid: string, abilityIds: string[]): void {
    const gameState = useGameStateStore.getState()
    void pedirAcao(
      { tipo: 'definirGolpesAtivos', pokeUid, abilityIds },
      () => gameState.setActiveAbilities(pokeUid, abilityIds),
    ).then((ok) => {
      if (!ok) return
      const atualizado = useGameStateStore.getState().team.find((p) => p.uid === pokeUid)
      if (!atualizado) return
      useWorldStore.getState().update((draft) => {
        if (draft.player && draft.player.poke.uid === pokeUid) {
          draft.player.poke = { ...draft.player.poke, activeAbilities: atualizado.activeAbilities }
        }
      })
    })
  },

  healTeam(): void {
    const gameState = useGameStateStore.getState()
    void pedirAcao({ tipo: 'curarEquipe' }, () => gameState.healTeamFully())
    const world = useWorldStore.getState()
    if (world.player) {
      useWorldStore.getState().update((draft) => {
        if (!draft.player) return
        // A faisca de cura e marcada a mao aqui porque este caminho NAO passa
        // por `heal()` — ele troca o `poke` inteiro pra reidratar o objeto, e
        // nao soma HP. Sem esta linha a enfermeira seria a unica fonte de cura
        // sem retorno visual.
        if (draft.player.poke.hp < draft.player.poke.stats.hp) draft.player.vfxCuraHp = VFX_CURA_DURACAO
        // `status: null` limpa paralisia/veneno/etc residual (PH-45) — mesma
        // classe do bug de fainted/state logo abaixo: `gameStateStore.healTeamFully()`
        // ja zerava `status` no store persistido, mas so isso nao chegava aqui no
        // world draft ativo, que e o que `combatSystem.ts` le de verdade
        // (`entity.poke.status`). POKE saia do Hospital com HP cheio e ainda
        // paralisado/envenenado.
        draft.player.poke = { ...draft.player.poke, hp: draft.player.poke.stats.hp, status: null }
        // Repor o HP nao bastava: `fainted`/`state` continuavam em desmaiado.
        // Bug real reproduzido ao vivo — curar na enfermeira mostrava HP 14/14 e
        // "Desmaiado!" ao mesmo tempo, e o POKE seguia sem lutar ao entrar numa
        // hunt (MovementSystem/CombatSystem olham `fainted`, nao o HP). O caminho
        // do Revive (useItem, abaixo) sempre limpou os dois; a cura do Hospital
        // era a unica que esquecia.
        draft.player.fainted = false
        draft.player.state = 'wander'
        draft.player.targetId = null
        draft.player.cooldowns = {}
      })
    }
    useToastStore.getState().pushToast('Equipe curada!', 'success', 'world')
  },

  // Traz a POKE recem-colocada em campo pro topo da lista visivel do time.
  setActiveTeamIndex(index: number): void {
    const gameState = useGameStateStore.getState()
    // PRESO (PH-72): Wrap/Bind/Fire Spin e companhia travam a troca de POKE
    // enquanto duram. O guard fica aqui, e nao so no botao, porque a tela de
    // Equipe nao e o unico caminho possivel pra esta acao.
    //
    // LIMITE CONHECIDO, ACEITO: e um bloqueio de CLIENTE. `definirAtivo` e RPC e
    // o estado volatil de combate vive so no worldStore efemero — o servidor nao
    // tem como validar sem receber estado de combate a cada troca, o que sai
    // caro demais pelo que resolve. Cliente modificado troca de POKE preso.
    const jogador = useWorldStore.getState().player
    if (jogador && (jogador.presoAte ?? 0) > 0 && !isDead(jogador)) {
      useToastStore.getState().pushToast(
        `${SPECIES[jogador.poke.speciesId].name} esta preso e nao pode sair de campo agora.`,
        'error', 'combat',
      )
      return
    }
    // A escrita no worldStore precisa esperar `pedirAcao`: sob autoridade do
    // servidor o `fallback` NAO roda, entao ler `team[0]` de forma sincrona logo
    // apos o `void pedirAcao` pegava o POKE ativo VELHO (a resposta com o time
    // reordenado ainda nao tinha chegado) e o colocava em campo — o HUD e o
    // sprite ficavam no POKE errado ate a proxima troca de cena. Mesmo padrao de
    // `chooseStarter`: reconstruir/atualizar so no `.then`.
    void pedirAcao({ tipo: 'definirAtivo', indice: index }, () => gameState.moveTeamIndexToFront(index)).then(async () => {
      const newActivePoke = useGameStateStore.getState().team[0]
      // Arte da especie nova em cache ANTES de trocar o POKE em campo: sem isto
      // o sprite trocaria pra "nada desenhado" por alguns frames enquanto o PNG
      // da especie nova baixa.
      if (newActivePoke) {
        await preloadEspecies([{ speciesId: newActivePoke.speciesId, isShiny: newActivePoke.isShiny }])
      }
      useWorldStore.getState().update((draft) => {
        if (draft.player && newActivePoke) {
          draft.player.poke = newActivePoke
          draft.player.cooldowns = {}
          draft.player.flashTimer = 0
          draft.player.fainted = isDead(draft.player)
          draft.player.state = draft.player.fainted ? 'dead' : 'wander'
          draft.player.targetId = null
        }
      })
    })
  },

  // Reordena a fila de RESERVAS (trilho da HUD, PH-75).
  //
  // Nao troca quem esta em campo — isso e `setActiveTeamIndex`, e a RPC recusa
  // qualquer ordem que mude o slot 0. Por isso aqui nao ha nada de preload de
  // arte nem de worldStore: o POKE desenhado nao muda.
  reorderTeam(de: number, para: number): void {
    const gameState = useGameStateStore.getState()
    if (de === para) return
    const n = gameState.team.length
    if (de < 1 || de >= n || para < 1 || para >= n) return

    // A ordem RESULTANTE e calculada aqui, antes do fallback rodar: sob
    // autoridade do servidor o fallback NAO roda, entao ler a equipe depois do
    // `pedirAcao` mandaria a ordem velha.
    const ordem = gameState.team.map((p) => p.uid)
    const [movido] = ordem.splice(de, 1)
    ordem.splice(para, 0, movido)

    void pedirAcao(
      { tipo: 'reordenarEquipe', ordem },
      () => gameState.reordenarReservas(de, para),
    )
  },

  removeFromTeam(pokeUid: string): void {
    const gameState = useGameStateStore.getState()
    const idx = gameState.team.findIndex((p) => p.uid === pokeUid)
    if (idx === -1) return
    if (gameState.team.length <= 1) {
      useToastStore.getState().pushToast('Voce precisa manter ao menos 1 POKE na equipe.', 'error', 'world')
      return
    }
    const wasActive = idx === gameState.activeIndex
    // PRESO (PH-72): tirar da equipe o POKE preso e a MESMA fuga que trocar de
    // POKE — quem sai de campo por aqui tambem escapa do golpe. Sem este guard o
    // bloqueio de `setActiveTeamIndex` acima seria decorativo.
    const jogadorEmCampo = useWorldStore.getState().player
    if (wasActive && jogadorEmCampo && (jogadorEmCampo.presoAte ?? 0) > 0 && !isDead(jogadorEmCampo)) {
      useToastStore.getState().pushToast(
        `${SPECIES[jogadorEmCampo.poke.speciesId].name} esta preso e nao pode sair de campo agora.`,
        'error', 'combat',
      )
      return
    }
    const removed = gameState.team[idx]
    // Mesmo motivo de `setActiveTeamIndex`: sob servidor o time reajustado so
    // chega na resposta, entao a troca do POKE em campo tem que ir pro `.then`.
    void pedirAcao({ tipo: 'tirarDaEquipe', pokeUid }, () => { gameState.moveTeamToBag(pokeUid) }).then(async () => {
      if (!wasActive) return
      const newActivePoke = useGameStateStore.getState().team[useGameStateStore.getState().activeIndex]
      if (newActivePoke) {
        await preloadEspecies([{ speciesId: newActivePoke.speciesId, isShiny: newActivePoke.isShiny }])
      }
      useWorldStore.getState().update((draft) => {
        if (draft.player && newActivePoke) {
          draft.player.poke = newActivePoke
          draft.player.cooldowns = {}
          draft.player.flashTimer = 0
          draft.player.fainted = isDead(draft.player)
          draft.player.state = draft.player.fainted ? 'dead' : 'wander'
          draft.player.targetId = null
        }
      })
    })
    useToastStore.getState().pushToast(
      `${shinyPrefix(removed.isShiny)}${SPECIES[removed.speciesId].name} foi retirado da equipe.`,
      'success', 'world',
    )
  },

  useItem(itemId: string): void {
    const gameState = useGameStateStore.getState()
    const item = getItem(itemId)
    const world = useWorldStore.getState()
    if (!item || !world.player) return

    if (item.kind === 'potion' && item.healAmount != null) {
      if (world.player.fainted) {
        useToastStore.getState().pushToast('POKE desmaiado! Use um Revive ou volte ao Hospital.', 'error', 'world')
      } else if (gameState.hasItem(itemId, 1)) {
        void pedirAcao({ tipo: 'usarItem', itemId }, () => { gameState.removeItem(itemId, 1) })
        const healAmount = item.healAmount
        useWorldStore.getState().update((draft) => {
          if (draft.player) heal(draft.player, healAmount)
        })
        syncActivePokeToGameState(useWorldStore.getState(), gameState)
        useToastStore.getState().pushToast(`Usou ${item.name}.`, 'success', 'world')
      }
    } else if (item.kind === 'revive' && item.reviveHpPercent != null) {
      if (!world.player.fainted) {
        useToastStore.getState().pushToast('O POKE ja esta consciente.', 'error', 'world')
      } else if (gameState.hasItem(itemId, 1)) {
        void pedirAcao({ tipo: 'usarItem', itemId }, () => { gameState.removeItem(itemId, 1) })
        const revivePercent = item.reviveHpPercent
        useWorldStore.getState().update((draft) => {
          if (draft.player) {
            draft.player.poke.hp = Math.round(draft.player.poke.stats.hp * revivePercent)
            draft.player.fainted = false
            draft.player.state = 'wander'
          }
        })
        syncActivePokeToGameState(useWorldStore.getState(), gameState)
        useToastStore.getState().pushToast('POKE reanimado!', 'success', 'world')
      }
    }
  },

  async evolvePoke(pokeUid: string, alvo?: string): Promise<void> {
    const gameState = useGameStateStore.getState()
    const poke = [...gameState.team, ...gameState.bagPokes].find((p) => p.uid === pokeUid)
    if (!poke) return
    const previousName = SPECIES[poke.speciesId].name
    const result = evolvePokeInstance(poke, gameState, alvo)
    if (!result) return
    if ('blocked' in result) {
      const { itemId, count } = result.required
      const have = gameState.items[itemId] || 0
      const item = getItem(itemId)
      useToastStore.getState().pushToast(
        `${previousName} precisa de ${count}x ${item?.name ?? itemId} para evoluir (tem ${have}).`,
        'error', 'world',
      )
      return
    }
    // Debita as Stones e aplica a evolucao SO dentro do fallback — que so
    // roda no modo dev sem servidor (pedirAcao chama isto direto). Sob
    // autoridade do servidor, `aplicarEstadoDoServidor` (dentro de
    // pedirAcao) e quem debita e aplica, via a resposta confirmada; se a
    // request falhar, este fallback nunca roda e nenhuma Stone e removida
    // localmente (PH-12 — antes disso acontecia incondicionalmente ali em
    // cima, mesmo se `pedirAcao` fosse falhar depois).
    //
    // `await` aqui (em vez de `void`) e o que faz o round-trip inteiro contar
    // pra guarda de reentrancia de quem chama (useAcaoPendente.run so libera
    // depois que a Promise retornada resolve) — sem isso a janela de duplo
    // clique durava um microtask (PH-13).
    const ok = await pedirAcao({ tipo: 'evoluirPoke', pokeUid, alvo }, () => {
      if (result.stoneReq) gameState.removeItem(result.stoneReq.itemId, result.stoneReq.count)
      gameState.updatePokeInstance(pokeUid, () => result.updatedPoke)
    })
    if (!ok) return
    // Se a POKE evoluida esta em campo agora, o world tambem precisa
    // refletir a nova especie/stats imediatamente. A arte da forma evoluida e
    // carregada ANTES da troca; `updateAnimations` compara a URL do spritesheet
    // (nao o nome da animacao), entao o proximo tick ja desenha a especie nova.
    const world = useWorldStore.getState()
    if (world.player && world.player.poke.uid === pokeUid) {
      void preloadEspecies([{ speciesId: result.updatedPoke.speciesId, isShiny: result.updatedPoke.isShiny }])
        .then(() => {
          useWorldStore.getState().update((draft) => {
            if (draft.player && draft.player.poke.uid === pokeUid) draft.player.poke = result.updatedPoke
          })
        })
    }
    useToastStore.getState().pushToast(
      `${shinyPrefix(poke.isShiny)}${previousName} evoluiu para ${result.species.name}!`,
      'levelup', 'world',
    )
    // O OUTRO ponto que disparava o splash no vanilla (js/main.js:658) e que se
    // perdeu na migracao pra React — ver PH-192. `poke.speciesId` e a especie
    // ANTES da troca: `result.updatedPoke` ja e a nova, e o cartao mostra o par.
    celebracaoStore.getState().celebrar({
      tipo: 'evolucao',
      deId: poke.speciesId,
      paraId: result.updatedPoke.speciesId,
      deNome: previousName,
      paraNome: result.species.name,
      isShiny: Boolean(poke.isShiny),
    })
  },

  toast(message: string, type: Parameters<ReturnType<typeof useToastStore.getState>['pushToast']>[1], channel: Parameters<ReturnType<typeof useToastStore.getState>['pushToast']>[2]): void {
    useToastStore.getState().pushToast(message, type, channel)
  },

  resetPerfStats(): void {
    resetStats(useGameStateStore.getState())
  },
}
