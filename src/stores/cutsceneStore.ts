// A cutscene de entrada em area (PH-471) — a declaracao do estado.
//
// POR QUE UM STORE, E NAO ESTADO LOCAL NA TELA DE HUNT. O `useAcaoPendente` do
// `HuntMenu` ja sabe que uma entrada esta em voo (chave `map:<id>`), e por um
// instante pareceu bastar. Nao basta por duas razoes:
//
//   1. A CUTSCENE COBRE A TELA INTEIRA, e o painel de hunt e um filho da camada
//      de janelas. Uma cutscene renderizada dentro dele ficaria ABAIXO do
//      proprio painel — e o painel fecha no fim da entrada, o que arrancaria a
//      cutscene junto no exato momento em que ela deveria estar terminando.
//   2. ENTRAR NUMA HUNT NAO ACONTECE SO PELO CLIQUE. O boot reentra na hunt
//      gravada (PH-93) e a vitoria do Lance devolve o jogador ao campo; as duas
//      passam por `controller.enterMap` e nenhuma passa pelo `HuntMenu`. Com o
//      gatilho no controller, todo caminho de entrada ganha a tela de
//      carregamento sem precisar lembrar dela.
//
// STORE DE REACT (e nao `zustand/vanilla` como `splashDeSalaVanilla`): quem
// empurra aqui e `engine/controller.ts`, que e codigo de CLIENTE — ele chama
// `abrirSessaoDeHunt` e mexe em `useGameStateStore`. O motor que vai pro bundle
// da Edge nao passa por aqui.
import { create } from 'zustand'

export interface CenaDeCutscene {
  /**
   * Identidade propria, mesmo motivo de `SplashDeSala#id`: sem `key` nova o
   * React reusa o node e a animacao de zoom nao reinicia — a segunda entrada
   * apareceria com a arte ja no fim do movimento.
   */
  id: number
  /** URL RELATIVA da arte (mesma convencao do resto: `assets/...`). */
  arte: string | null
  /** Cor de piso, pra a cena nao ser um retangulo preto enquanto a arte carrega. */
  corDeFundo: string
  titulo: string
  subtitulo: string | null
}

export interface CutsceneState {
  cena: CenaDeCutscene | null
  /** Abre (ou substitui) a cutscene. Devolve o id, pra quem abriu poder fechar a DELE. */
  abrir: (cena: Omit<CenaDeCutscene, 'id'>) => number
  /**
   * Fecha, POR ID.
   *
   * Nao um `fechar()` seco: uma entrada recusada pelo servidor pode terminar
   * DEPOIS de o jogador ja ter clicado em outra hunt, e um fechamento cego
   * apagaria a cutscene que acabou de abrir. Mesmo raciocinio do
   * `encerrar(id)` de `splashDeSalaVanilla`.
   */
  fechar: (id: number) => void
}

let proximoId = 1

export const useCutsceneStore = create<CutsceneState>()((set) => ({
  cena: null,

  abrir: (cena) => {
    const id = proximoId++
    set({ cena: { ...cena, id } })
    return id
  },

  fechar: (id) => set((estado) => (estado.cena?.id === id ? { cena: null } : estado)),
}))
