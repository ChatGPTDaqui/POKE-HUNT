// Grade quadriculada de inventario (PH-114) — escolher item/POKE clicando num
// slot com imagem, em vez de ler nome numa lista de texto.
//
// Desde o PH-118 ela e a forma de listar inventario no jogo inteiro: Mercado
// (anunciar), Mochila (POKE e item) e Loja (venda de POKE e de item). O que
// mudou pra isso: modo de selecao MULTIPLA (a venda em lote da Loja marca vários
// POKE de uma vez), marca de canto e aro proprio (item trancado, POKE shiny —
// estado que precisa aparecer SEM selecionar), e slot desabilitado (POKE
// trancado nao entra em lote de venda).
//
// ---------------------------------------------------------------------------
// POR QUE ELA EXISTE
// ---------------------------------------------------------------------------
// Anunciar no Mercado escolhia por dropdown de TEXTO ("✨ Charmander Lv12 ·
// Incomum · IV 74%"). Sem sprite, sem borda de raridade, sem marca de shiny
// legivel — e no celular um `<select>` vira lista nativa do sistema. Escolher o
// POKE errado ali tem consequencia: ele sai da mochila.
//
// ---------------------------------------------------------------------------
// O QUE ELA NAO E
// ---------------------------------------------------------------------------
// NAO tem teto de slots, nao tem "auto arrange" e nao tem capacidade. A
// referencia que originou o pedido mostrava `0/124`, e isso ficou de fora de
// propósito: inventar limite de mochila mudaria balanceamento, e o pedido foi
// explicito em ser "apenas forma visual de organizar". A grade desenha
// exatamente os slots que existem.
//
// Tambem nao e arrastavel. Reordenar inventario e outro assunto (o trilho de
// reservas ja tem o seu), e misturar arrasto com selecao no mesmo toque e como
// se ganha o bug de "toquei pra escolher e ele reordenou".
import { type MouseEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface SlotDeInventario {
  /** Chave estavel e valor devolvido na selecao. */
  id: string
  /** O que desenha dentro do slot (sprite, icone). */
  conteudo: ReactNode
  /**
   * Descricao pra leitor de tela e pro `title` do hover. Obrigatoria: o slot e
   * uma imagem, entao sem isto ele e um botao sem nome nenhum.
   */
  rotulo: string
  /** Canto inferior direito — quantidade de item. Ausente nao desenha nada. */
  contador?: number
  /**
   * Canto superior esquerdo — icone de estado (cadeado). Ausente nao desenha.
   *
   * Existe porque a grade esconde texto: numa LISTA o cadeado tinha uma coluna
   * propria, e aqui o slot e um quadrado com sprite. Sem a marca, "trancado" so
   * apareceria depois de selecionar, e o jogador descobriria a trava ao tentar
   * vender.
   */
  marca?: ReactNode
  /** Classe de borda quando o slot NAO esta selecionado (shiny, trancado). */
  aro?: string
  /**
   * Slot que nao aceita selecao (POKE trancado na venda em lote).
   *
   * Desabilitar em vez de ocultar: o POKE continua na mochila, e uma grade que
   * some com ele faria o jogador procurar o que nao esta perdido.
   */
  desabilitado?: boolean
}

/**
 * Lado do slot, em `em`. 3.2 e o menor lado em que o sprite de 32px ainda le
 * como o POKE que e, e ao mesmo tempo passa dos ~44px de alvo de toque no
 * regime compacto.
 */
const LADO = 3.2

/**
 * Contador do slot em forma CURTA.
 *
 * Visto ao vivo em 390px (PH-123): "99999" ocupa a largura inteira do slot e
 * passa por cima do sprite. O numero e o dado menos importante do slot e estava
 * tapando o mais importante. O valor exato continua no `rotulo` — que e o
 * `aria-label` e o `title` — e na ficha de quem esta selecionado.
 *
 * Formatador local em vez do `fmtCurto` da Loja: aquele so abrevia a partir de
 * 100 mil (foi feito pra rotulo de botao) e importar `features/shop` dentro de
 * `components/game` inverteria a direcao da dependencia.
 */
function contadorCurto(n: number): string {
  const abs = Math.abs(n)
  // ARREDONDA PRA BAIXO, sempre. Com `Math.round`, 99.999 unidades apareciam
  // como "100k" — um numero maior do que o jogador tem, no lugar onde ele
  // decide quanto vender. Truncar erra pra baixo, que e o lado seguro.
  if (abs >= 1_000_000) return `${(Math.floor(n / 100_000) / 10).toString().replace(/[.,]0$/, '')}M`
  if (abs >= 10_000) return `${Math.floor(n / 1000)}k`
  if (abs >= 1_000) return `${(Math.floor(n / 100) / 10).toString().replace(/[.,]0$/, '')}k`
  return String(n)
}

export function GradeDeInventario({
  slots, selecionado, onSelecionar, alturaMaxEm = 13, className, rotuloDoGrupo,
  modo = 'unico', selecionados,
}: {
  slots: SlotDeInventario[]
  /** Slot marcado no modo 'unico'. Ignorado no modo 'multiplo'. */
  selecionado: string | null
  /**
   * Clique num slot. No modo 'multiplo' e um ALTERNAR — quem chama decide o que
   * a marca significa.
   *
   * O evento vem junto porque a Mochila liga Shift+clique em "linkar no chat", e
   * esse atalho existia na linha que a grade substituiu.
   */
  onSelecionar: (id: string, evento: MouseEvent<HTMLButtonElement>) => void
  /** Altura maxima antes de rolar. Inventario grande nao pode estourar o painel. */
  alturaMaxEm?: number
  className?: string
  rotuloDoGrupo: string
  /**
   * 'unico' = radio (escolher um). 'multiplo' = caixa de selecao (lote).
   *
   * A semantica muda de verdade no DOM, e nao so a aparencia: leitor de tela
   * anuncia "opcao 3 de 40" num radiogroup e "caixa de selecao, marcada" num
   * grupo de checkbox. Pintar checkbox com role de radio mentiria sobre poder
   * marcar varios.
   */
  modo?: 'unico' | 'multiplo'
  /** Slots marcados no modo 'multiplo'. */
  selecionados?: ReadonlySet<string>
}) {
  const multiplo = modo === 'multiplo'
  return (
    <div
      // `radiogroup` e nao `listbox`: escolha unica entre opcoes visiveis e
      // exatamente a semantica de radio. O `<select>` que estava aqui antes era
      // listbox por acidente de elemento, nao por intencao.
      //
      // No modo multiplo o container e `group`: `radiogroup` com filhos
      // `checkbox` e ARIA invalido, e o leitor de tela para de anunciar a
      // contagem.
      role={multiplo ? 'group' : 'radiogroup'}
      aria-label={rotuloDoGrupo}
      className={cn('overflow-y-auto rounded-[.5em] border border-n800 bg-n900/60 p-[.3em]', className)}
      style={{
        maxHeight: `${alturaMaxEm}em`,
        display: 'grid',
        // `auto-fill` e nao um numero fixo de colunas: a mesma grade serve o
        // painel largo do desktop e os ~470px uteis do celular sem media query.
        gridTemplateColumns: `repeat(auto-fill, minmax(${LADO}em, 1fr))`,
        gap: '.3em',
      }}
    >
      {slots.map((slot) => {
        const ativo = multiplo ? Boolean(selecionados?.has(slot.id)) : slot.id === selecionado
        return (
          <button
            key={slot.id}
            type="button"
            role={multiplo ? 'checkbox' : 'radio'}
            aria-checked={ativo}
            aria-label={slot.rotulo}
            title={slot.rotulo}
            disabled={slot.desabilitado}
            onClick={(evento) => onSelecionar(slot.id, evento)}
            className={cn(
              'relative flex items-center justify-center rounded-[.4em] border-2 p-[.15em] transition-colors',
              slot.desabilitado ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
              ativo
                ? 'border-primary bg-primary/15'
                : cn('bg-n950/60', slot.aro ?? 'border-n800', !slot.desabilitado && 'hover:border-n600'),
            )}
            style={{ aspectRatio: '1 / 1' }}
          >
            {slot.conteudo}
            {slot.marca && (
              // Mesma razao do `pointer-events-none` do contador: a marca fica
              // DENTRO do botao, e sem isto o clique em cima dela nao contava.
              <span className="pointer-events-none absolute top-0 left-[.1em] text-[.7em] leading-none">
                {slot.marca}
              </span>
            )}
            {slot.contador !== undefined && (
              // `pointer-events-none`: o contador fica DENTRO do botao, e sem
              // isto o clique em cima do numero nao contava como clique no slot
              // em alguns navegadores.
              <span className="pointer-events-none absolute right-[.1em] bottom-0 rounded-[.25em] bg-n950/85 px-[.2em] text-[.62em] leading-[1.4] tabular-nums text-n200">
                {contadorCurto(slot.contador)}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
