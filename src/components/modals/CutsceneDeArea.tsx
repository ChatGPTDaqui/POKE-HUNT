// A apresentacao de uma area, em tela cheia, com zoom-in (PH-471).
//
// O QUE ELA SUBSTITUI. Entrar num estagio era um round-trip sem nada na tela
// alem do rotulo "Entrando..." dentro do botao; e a troca de sala congelava o
// jogo por `SALA_TRANSITION_COUNTDOWN` segundos mostrando "Entrando em nova
// área..." e um numero grande — sem dizer QUAL area, defeito que a nota de
// `splashDeSalaVanilla.ts` ja registrava.
//
// O PONTO DE DESENHO: os segundos JA EXISTEM e JA SAO DE ESPERA. A entrada
// espera a sessao abrir no servidor e a arte pre-carregar (`preloadHunt`, teto
// de 4s); a troca de sala congela movimento e combate por 3s de propósito. A
// cutscene OCUPA esse tempo — ela nao acrescenta nenhum.
//
// POR QUE ELA COBRE A DOCA E O TRILHO, ao contrario de `CampoOverlay`. Aquela
// moldura foi feita para "aviso que pertence ao campo" e deixa a HUD de fora por
// pedido explicito (ver o cabecalho dela). Aqui a intencao e a oposta: e uma
// TELA DE CARREGAMENTO, e HUD visivel por cima de uma tela de carregamento diz
// que o jogo esta rodando — que e justamente o que nao esta.
import { useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * A animacao. Local no componente, como manda a convencao do projeto
 * (`SplashDeSala`, `CamadaDeCelebracao`): keyframes global em `index.css` e
 * reservado aos dois movimentos permanentes da HUD.
 *
 * DUAS REGRAS QUE VEM DE ERRO MEDIDO, e as duas estao no cabecalho de
 * `CamadaDeCelebracao`:
 *
 *  1. POSICIONAMENTO NAO MORA NOS KEYFRAMES. Centralizar com `translate(-50%)`
 *     dentro da animacao fez o splash da celebracao descolar do centro sob
 *     `prefers-reduced-motion`. Quem centra e o wrapper; a animacao so mexe em
 *     `scale` e `opacity`.
 *  2. `prefers-reduced-motion` E OBRIGATORIO. Sob ele a arte entra parada, no
 *     tamanho final — a informacao (que area e esta) continua toda na tela.
 *
 * O zoom vai de 1 a 1.14 em 4,5s com `ease-out`: lento o bastante pra nao ler
 * como sacudida e curto o bastante pra caber na espera mais curta (a troca de
 * sala, 3s). Ele NAO precisa terminar — a cena sai quando o carregamento
 * termina, e um zoom cortado no meio le como movimento interrompido, que e
 * exatamente o que aconteceu.
 */
const CSS = `
@keyframes cutscene-zoom {
  from { transform: scale(1); }
  to   { transform: scale(1.14); }
}
@keyframes cutscene-entra {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes cutscene-titulo {
  from { opacity: 0; transform: translateY(.5em); }
  to   { opacity: 1; transform: translateY(0); }
}
.cutscene-arte { animation: cutscene-zoom 4500ms ease-out both; }
.cutscene-veu { animation: cutscene-entra 220ms ease-out both; }
.cutscene-titulo { animation: cutscene-titulo 420ms 120ms ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .cutscene-arte, .cutscene-veu, .cutscene-titulo { animation: none; }
  .cutscene-arte { transform: scale(1.07); }
}
`

/**
 * O letreiro do nome da area.
 *
 * "ESCRITAS ESTILIZADAS NO ESTILO POKEMON" foi o pedido, e o projeto NAO TEM
 * fonte custom — sao duas familias variaveis via npm (Geist e Geist Mono), e
 * trazer um arquivo de fonte por causa de um letreiro seria peso permanente no
 * bundle por um efeito de dois segundos.
 *
 * O que da a leitura sem fonte nova e a COMBINACAO que o logo daquele estilo
 * usa: peso maximo, caixa alta, tracking aberto, contorno escuro grosso em
 * volta da letra e uma sombra projetada por baixo. `-webkit-text-stroke` faz o
 * contorno de verdade (nao quatro text-shadows empilhados, que engrossam nas
 * diagonais e ficam irregulares); o `text-shadow` faz a profundidade.
 *
 * O contorno E o que torna o texto legivel: as artes de fundo tem area clara e
 * area escura no mesmo quadro — foi o motivo do veu na trilha (PH-441) — e
 * texto branco sem borda desaparece na metade clara de metade das artes.
 */
function LetreiroDaArea({ titulo, subtitulo }: { titulo: string; subtitulo: string | null }) {
  return (
    <div className="cutscene-titulo flex flex-col items-center gap-[.25em] px-[1em] text-center">
      <h2
        className="text-[2.6em] leading-[1.05] font-black tracking-[.06em] text-n50 uppercase"
        style={{
          WebkitTextStroke: '.09em #0b0b12',
          // `paint-order` poe o contorno ATRAS do preenchimento. Sem ele o
          // stroke e desenhado por cima e come .045em de cada lado da letra —
          // num peso black isso fecha o vao interno do "A" e do "O".
          paintOrder: 'stroke fill',
          textShadow: '0 .12em .3em rgba(0,0,0,.85), 0 0 1.2em rgba(0,0,0,.6)',
        }}
      >
        {titulo}
      </h2>
      {subtitulo && (
        <p
          className="text-[.95em] font-bold tracking-[.22em] text-n200 uppercase"
          style={{ textShadow: '0 .1em .25em rgba(0,0,0,.9)' }}
        >
          {subtitulo}
        </p>
      )}
    </div>
  )
}

export function CutsceneDeArea({
  arte, corDeFundo, titulo, subtitulo, rodape,
}: {
  arte: string | null
  corDeFundo: string
  titulo: string
  subtitulo: string | null
  /** Canto de baixo — contagem regressiva, ou o aviso de carregando. */
  rodape?: React.ReactNode
}) {
  const [carregou, setCarregou] = useState(false)
  return (
    // `fixed inset-0` e z-[58]: acima do `CampoOverlay` (55) e do
    // `LanceVictoryReturn` (55), abaixo do `ConfirmDialog` (60) — uma
    // confirmacao aberta continua sendo a coisa mais importante da tela, mesmo
    // durante um carregamento.
    //
    // `pointer-events-auto` de proposito: ela ENGOLE o clique enquanto esta na
    // tela. Deixar passar significaria o jogador acertando um botao da doca que
    // ele nao pode ver.
    <div
      role="status"
      aria-live="polite"
      aria-label={`Entrando em ${titulo}`}
      className="pointer-events-auto fixed inset-0 z-[58] flex flex-col items-center justify-center overflow-hidden"
      style={{ background: corDeFundo }}
    >
      <style>{CSS}</style>
      {/* A ARTE NAO SEGURA A CENA. `onLoad` acende a opacidade, e a saida da
          cutscene depende do CARREGAMENTO DA HUNT e nao deste `<img>` — arte que
          nunca chega (404, rede ruim) deixaria o jogador preso numa tela de
          carregamento que nao carrega nada. Sem ela sobra a cor do bioma, que e
          o piso, e o letreiro, que e a informacao. */}
      {arte && (
        <img
          src={arte}
          alt=""
          aria-hidden
          onLoad={() => setCarregou(true)}
          className={cn(
            'cutscene-arte absolute inset-0 h-full w-full object-cover transition-opacity duration-500',
            carregou ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
      {/* Veu em gradiente, mais forte nas pontas: o letreiro fica no meio e o
          rodape embaixo, e sao esses dois que precisam de contraste. Fraco no
          centro pra a arte continuar sendo o assunto — ela e o motivo de a
          cutscene existir. */}
      <div
        aria-hidden
        className="cutscene-veu absolute inset-0 bg-gradient-to-b from-black/75 via-black/35 to-black/85"
      />
      <div className="relative flex flex-col items-center gap-[1.2em]">
        <LetreiroDaArea titulo={titulo} subtitulo={subtitulo} />
        {rodape}
      </div>
    </div>
  )
}
