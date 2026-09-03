// Contagem regressiva entre salas de uma hunt (ver
// engine/systems/salaSystem.ts#registrarAbate/aplicarTransicaoDeSala): a
// quota de abates da sala atual fechou, a proxima ja foi sorteada por baixo
// (world.salaPendente — o "carregamento" adiantado), e o jogo fica congelado
// ate zerar.
//
// ELA VIROU A CUTSCENE DE AREA (PH-471), e o motivo e que a informacao que
// faltava aqui era justamente a principal. A versao anterior mostrava
//
//     "Entrando em nova área..."   +   3-2-1
//
// dentro de um `CampoOverlay` — e NAO dizia qual area, defeito que a nota de
// `stores/splashDeSalaVanilla.ts` ja registrava por escrito. O jogador ficava
// tres segundos parado olhando um numero.
//
// E ELA VOLTOU PRA FAIXA DO `CampoOverlay` NA PH-482, sem perder o que ganhou
// aqui: a cutscene inteira passou a viver no retangulo do campo (pedido do dono
// — "sem sobressair sobre outros menus"), entao esta tela agora tem a moldura da
// versao antiga E a informacao da versao nova.
//
// O TEMPO NAO MUDOU. `SALA_TRANSITION_COUNTDOWN` continua em 3s e continua
// congelando movimento e combate — a cutscene OCUPA esses segundos com a arte e
// o nome do lugar que esta entrando, em vez de acrescentar espera.
//
// O SPLASH DE CHEGADA (PH-395) CONTINUA, e nao e repeticao: ele roda DEPOIS,
// sobre o jogo ja rodando, e diz `Sala N/M` e a faixa de nivel — o dado de
// progresso. Este aqui e a apresentacao do lugar, com o jogo parado.
import { backgroundParaSala } from '@/data/maps'
import { nomeDaSala } from '@/engine/systems/salaSystem'
import { useWorldStore } from '@/stores/worldStore'
import { CutsceneDeArea } from './CutsceneDeArea'

export function SalaCountdownModal() {
  const remaining = useWorldStore((s) => s.salaCountdownRemaining)
  const pendente = useWorldStore((s) => s.salaPendente)
  const mapDef = useWorldStore((s) => s.mapDef)
  if (remaining == null || remaining <= 0) return null

  // `salaPendente` ausente com a contagem armada e estado que o motor nao
  // produz (`armarTransicaoDeSala` escreve os dois no mesmo passo), mas a
  // cutscene nao pode depender disso: sem a sala nao ha arte nem nome, e cair
  // num texto genérico e melhor que renderizar uma cena vazia.
  const fundo = pendente && mapDef ? backgroundParaSala(mapDef, pendente) : mapDef?.bg
  // `indice === 0` na sala que ENTRA significa que o ciclo reiniciou — ou seja,
  // a ultima sala do estagio foi limpa. Mesmo criterio de `fechouEstagio` em
  // `armarTransicaoDeSala` e do texto do `SplashDeSala`.
  const fechouEstagio = pendente?.indice === 0

  return (
    <CutsceneDeArea
      arte={fundo?.image ?? null}
      corDeFundo={fundo?.primary ?? '#0b0b12'}
      titulo={nomeDaSala(pendente ?? null) ?? 'Nova área'}
      subtitulo={fechouEstagio ? 'Estágio concluído' : 'Nova área'}
      rodape={
        <div
          className="font-mono text-[3.2em] leading-none font-black text-sky-300"
          style={{ textShadow: '0 .08em .25em rgba(0,0,0,.9)' }}
        >
          {Math.ceil(remaining)}
        </div>
      }
    />
  )
}
