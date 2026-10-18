// Rota do Treinador (18/10/2026): o jogo inteiro em três fases — início, meio e
// fim — na aba Objetivos da janela Missões. Pedido do dono: o jogador precisa
// ver o que tem para alcançar em todo o jogo, não só o próximo passo.
//
// Só LÊ o save: não concede nada e não trava nada. Os alvos saem das constantes
// do jogo (biomas, estágio do Lance, nível máximo da Especialidade), então mudar
// a regra muda a rota sozinha.
import { BIOMAS, ESTAGIOS_PARA_O_LANCE } from './biomas'
import { ESTAGIOS_POR_BIOMA } from './estagios'
import { ESPECIALIDADE_NIVEL_MAX } from './especialidades'
import { MARCOS_BESTIARIO } from './jornada'
import { maiorEstagioLimpo, type ProgressoPorBioma } from './progressoDeBioma'
import { PRIMEIROS_PASSOS } from './primeirosPassos'

export type FaseDaRota = 'inicio' | 'meio' | 'fim'

export interface MarcoDaRota {
  id: string
  titulo: string
  atual: number
  alvo: number
  /** O que cumprir este marco abre ou dá. */
  libera: string
  /** `false` enquanto a fonte do número não carregou (barra sem valor). */
  medido?: boolean
}

export interface Fase {
  fase: FaseDaRota
  titulo: string
  resumo: string
  marcos: MarcoDaRota[]
}

export interface EntradaDaRota {
  passosCumpridos: number
  nivelDoTreinador: number
  progresso: ProgressoPorBioma
  lanceVencido: boolean
  /** Maior nível (dano ou defesa) entre todas as Especialidades. */
  maiorEspecialidade: number
  conquistas: { carregadas: boolean; total: number; ouro: number }
  /** Maior número de abates de uma única espécie (Bestiário). */
  maiorPesquisa: number
}

export const NIVEL_DO_TREINADOR_DO_PVP = 10
export const BIOMAS_DO_TREINAMENTO = 3
export const CONQUISTAS_DA_GS_BALL = 100
export const ESPECIALIDADE_DO_MEIO = 5


export function concluido(m: MarcoDaRota): boolean {
  return m.medido !== false && m.atual >= m.alvo
}

export function rotaDoTreinador(e: EntradaDaRota): Fase[] {
  const contar = (estagio: number, pesadelo = false) =>
    BIOMAS.filter((b) => maiorEstagioLimpo(e.progresso, b.chave, pesadelo) >= estagio).length
  const pesquisaMax = MARCOS_BESTIARIO[MARCOS_BESTIARIO.length - 1]
  const c = e.conquistas
  return [
    {
      fase: 'inicio', titulo: 'Início', resumo: 'Aprenda o básico, monte sua equipe e conheça os biomas.',
      marcos: [
        { id: 'primeiros_passos', titulo: 'Primeiros Passos', atual: e.passosCumpridos, alvo: PRIMEIROS_PASSOS.length, libera: 'Abre os menus com cadeado, um a um.' },
        { id: 'treinador_pvp', titulo: `Treinador Lv ${NIVEL_DO_TREINADOR_DO_PVP}`, atual: e.nivelDoTreinador, alvo: NIVEL_DO_TREINADOR_DO_PVP, libera: 'Libera o PvP e o Ranking.' },
        { id: 'tres_biomas', titulo: `1º Lord em ${BIOMAS_DO_TREINAMENTO} biomas`, atual: contar(1), alvo: BIOMAS_DO_TREINAMENTO, libera: 'Libera a hunt de Treinamento (Lv 60).' },
      ],
    },
    {
      fase: 'meio', titulo: 'Meio', resumo: 'Avance os estágios dos biomas e desafie o Campeão.',
      marcos: [
        { id: 'rumo_ao_lance', titulo: `Estágio ${ESTAGIOS_PARA_O_LANCE} nos ${BIOMAS.length} biomas`, atual: contar(ESTAGIOS_PARA_O_LANCE), alvo: BIOMAS.length, libera: 'Libera o desafio do Campeão Lance.' },
        { id: 'lance', titulo: 'Vencer o Lance', atual: Number(e.lanceVencido), alvo: 1, libera: 'Libera o Modo Pesadelo.' },
        { id: 'especialidade_meio', titulo: `Uma Especialidade no nível ${ESPECIALIDADE_DO_MEIO}`, atual: e.maiorEspecialidade, alvo: ESPECIALIDADE_DO_MEIO, libera: 'Mais dano ou defesa para um tipo da sua equipe.' },
        { id: 'conquista_ouro', titulo: 'Uma conquista Ouro', atual: c.ouro, alvo: 1, libera: 'Libera um título para o seu perfil.', medido: c.carregadas },
      ],
    },
    {
      fase: 'fim', titulo: 'Fim', resumo: 'Domine o Mundo, o Pesadelo e complete suas coleções.',
      marcos: [
        { id: 'mundo', titulo: `Estágio ${ESTAGIOS_POR_BIOMA} nos ${BIOMAS.length} biomas`, atual: contar(ESTAGIOS_POR_BIOMA), alvo: BIOMAS.length, libera: 'O Mundo completo, até o nível 100.' },
        { id: 'pesadelo', titulo: `Pesadelo: estágio ${ESTAGIOS_POR_BIOMA} nos ${BIOMAS.length} biomas`, atual: contar(ESTAGIOS_POR_BIOMA, true), alvo: BIOMAS.length, libera: 'Domínio do Modo Pesadelo.' },
        { id: 'especialidade_max', titulo: `Uma Especialidade no nível ${ESPECIALIDADE_NIVEL_MAX}`, atual: e.maiorEspecialidade, alvo: ESPECIALIDADE_NIVEL_MAX, libera: 'O máximo de bônus de um tipo.' },
        { id: 'gs_ball', titulo: `${CONQUISTAS_DA_GS_BALL} conquistas`, atual: c.total, alvo: CONQUISTAS_DA_GS_BALL, libera: 'A conquista "A GS Ball".', medido: c.carregadas },
        { id: 'bestiario', titulo: 'Bestiário completo de uma espécie', atual: e.maiorPesquisa, alvo: pesquisaMax, libera: 'A pesquisa máxima de uma espécie no Bestiário.' },
      ],
    },
  ]
}

/** A fase em que o jogador está: a primeira com marco pendente (ou a última). */
export function faseAtual(fases: Fase[]): FaseDaRota {
  return (fases.find((f) => f.marcos.some((m) => !concluido(m))) ?? fases[fases.length - 1]).fase
}
