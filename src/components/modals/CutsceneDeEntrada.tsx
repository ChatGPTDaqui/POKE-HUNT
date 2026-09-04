// A cutscene que roda enquanto uma hunt CARREGA (PH-471).
//
// Quem abre e fecha e `engine/controller.ts#enterMap`, e nao esta tela: entrar
// numa hunt acontece por tres caminhos (o clique no botao, a reentrada do boot
// e a volta do Campeao Lance) e so o controller esta em todos os tres. Ver a
// nota de `stores/cutsceneStore.ts`.
//
// ELA SAI QUANDO A HUNT ESTA PRONTA DE VERDADE, e nao num timer: `enterMap` so
// resolve depois de `abrirSessaoDeHunt` (round-trip a Edge) e `preloadHunt` (a
// arte de fundo e o pool inteiro). Um timer fixo teria os dois modos de falha:
// curto demais mostra o jogo montando, longo demais faz esperar depois de
// pronto.
//
// OS 15s DEIXARAM DE FECHAR A CENA (PH-489), E ISSO CORRIGE A PH-484
// -----------------------------------------------------------------------------
// O pedido do dono foi "o efeito do zoom in devera ter uma duracao maxima de 15
// segundos", e a frase comporta duas leituras. A PH-484 escolheu a estrita — a
// TELA some aos 15s — sem perguntar. Em Slow 3G isso deu o que se viu em QA: a
// tela de carregamento sumindo com a entrada ainda em voo, e o jogador de volta
// no painel de hunt com o jogo montando por baixo.
//
// A leitura frouxa (o teto vale pra ANIMACAO) sempre foi a mais fiel: o zoom ja
// dura 4,5s e nunca passou de 15. Agora vale ela — passados os 15s a cena FICA e
// o rodape troca o "Carregando" por um botao de sair.
//
// O QUE TORNOU ISSO SEGURO foi a PH-482, da mesma leva: a cutscene deixou de ser
// tela cheia e passou a viver na faixa do campo. Uma cena presa nao tranca mais
// o jogo — trilho, doca e menus continuam clicaveis por fora dela. O fechamento
// automatico da PH-484 existia para o mundo anterior, em que ela cobria tudo.
//
// O BOTAO NAO CANCELA A ENTRADA, e isso e limite de escopo declarado. Nao existe
// cancelamento em `enterMap` (o round-trip a Edge ja foi aceito, a sessao ja
// abriu no servidor), e inventar um e outra issue bem maior. Ele decide quando o
// jogador PARA DE OLHAR, nao o que o servidor faz: `enterMap` segue, e o
// `finally` dele fecha a cena de novo por id — fechar por id ja e idempotente.
//
// EFEITO COLATERAL QUE JA EXISTIA E CONTINUA: fechada a cena (pelo botao ou pelo
// `finally`), a entrada pode terminar depois e montar a hunt com o jogador
// noutro menu. Era assim com o fechamento automatico tambem. Registrado pra nao
// ser redescoberto como novidade.
import { useEffect, useState } from 'react'
import { CircleNotch, SignOut } from '@phosphor-icons/react'

import { TETO_DE_CARREGAMENTO_MS } from '@/data/tetoDeCarregamento'
import { useCutsceneStore } from '@/stores/cutsceneStore'
import { CutsceneDeArea } from './CutsceneDeArea'

export function CutsceneDeEntrada() {
  const cena = useCutsceneStore((s) => s.cena)
  const id = cena?.id ?? null
  const [demorou, setDemorou] = useState(false)

  // O efeito fica ANTES do `return null`, que e regra de hook e tambem o que faz
  // o relogio reiniciar por CENA: a dependencia e o `id`, entao entrar noutra
  // hunt no meio da espera ganha os 15s dela, e nao o que sobrou da anterior.
  //
  // O `setDemorou(false)` na entrada do efeito e o que impede a cena SEGUINTE de
  // nascer ja com o botao: sem ele, uma entrada demorada deixaria o estado
  // ligado e a proxima hunt abriria oferecendo saida antes de esperar nada.
  useEffect(() => {
    setDemorou(false)
    if (id == null) return
    const timer = setTimeout(() => setDemorou(true), TETO_DE_CARREGAMENTO_MS)
    return () => clearTimeout(timer)
  }, [id])

  if (!cena) return null
  return (
    <CutsceneDeArea
      // `key` pelo id: sem ela o React reusa o node entre duas entradas
      // seguidas e a animacao de zoom nao reinicia (mesmo motivo do `id` em
      // `SplashDeSala`).
      key={cena.id}
      arte={cena.arte}
      corDeFundo={cena.corDeFundo}
      titulo={cena.titulo}
      subtitulo={cena.subtitulo}
      rodape={demorou
        ? <BotaoDeSair aoSair={() => useCutsceneStore.getState().fechar(cena.id)} />
        : (
            <div className="flex items-center gap-[.5em] text-[.85em] font-semibold tracking-[.14em] text-n300 uppercase">
              <CircleNotch className="animate-spin" aria-hidden />
              Carregando
            </div>
          )}
    />
  )
}

/**
 * A saida que aparece quando a espera passa dos 15s.
 *
 * `pointer-events-auto` PROPRIO, e nao herdado: a cena engole o clique de
 * proposito (`CutsceneDeArea` e `pointer-events-auto` no container justamente
 * pra o jogador nao acertar um botao do campo que ele nao ve). Sem isto o botao
 * existiria na tela e nao responderia — que e pior que nao ter botao.
 *
 * O TEXTO DIZ O QUE ACONTECE, e nao "cancelar": a entrada NAO e cancelada. Ela
 * continua, e pode terminar depois. "Continuar esperando" seria mentira ao
 * contrario — o jogador nao esta escolhendo esperar, esta escolhendo sair da
 * frente.
 */
function BotaoDeSair({ aoSair }: { aoSair: () => void }) {
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-[.5em]">
      <span className="text-[.78em] tracking-[.1em] text-n400">
        Está demorando mais que o normal.
      </span>
      <button
        type="button"
        onClick={aoSair}
        className={
          'jogo-botao flex cursor-pointer items-center gap-[.45em] rounded-[.5em] border border-n600 '
          + 'bg-n900/80 px-[1em] py-[.45em] text-[.85em] font-bold tracking-[.12em] text-n100 uppercase '
          + 'transition-colors hover:border-n400 hover:bg-n800 '
          + 'focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none'
        }
      >
        <SignOut aria-hidden />
        Sair desta tela
      </button>
    </div>
  )
}
