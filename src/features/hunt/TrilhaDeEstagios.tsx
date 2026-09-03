// A navegacao do mundo, em DOIS NIVEIS (PH-431).
//
// POR QUE DOIS, E NAO UMA LISTA SO. Com 120 hunts de bioma a lista de cards que
// existia deixa de ser navegavel: sao 121 linhas onde antes eram 37, e o cartao
// de "Marinho 4" nao se distingue do de "Marinho 5" a nao ser pelo numero. O
// jogador nao esta procurando uma hunt num catalogo — ele esta escolhendo ONDE
// no mundo cacar, e isso tem forma: primeiro o lugar, depois quao fundo nele.
//
//   Nivel 1   os 12 biomas, cada um com o quanto o jogador ja fundou nele
//   Nivel 2   a TRILHA dos 10 estagios daquele bioma
//
// A TRILHA E O PONTO, e nao decoracao. Ela e o unico lugar do jogo onde as duas
// coisas que o redesenho criou ficam visiveis ao mesmo tempo: que o bioma
// AFUNDA (a composicao de sub-bioma muda do estagio 1 ao 10) e que a cacada e
// DIRECIONADA (nenhum estagio fica obsoleto — voltar ao 3 pela especie que ele
// da e uma escolha, nao um retrocesso). Uma grade de dez quadrados nao conta
// nenhuma das duas; uma trilha conta as duas de relance.
import { CircleNotch } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'

import { BIOMAS, BIOMA_POR_CHAVE, SUB_BIOMA_POR_CHAVE, type BiomaDef } from '@/data/biomas'
import {
  ESTAGIOS_POR_BIOMA, estagioId, niveisDoEstagio, parseEstagioId, pesosDoEstagio,
  quantidadeDeSalas,
} from '@/data/estagios'
import {
  bloqueioDoEstagio, estagioLiberado, maiorEstagioLimpo, type ProgressoPorBioma,
} from '@/data/progressoDeBioma'
import { MAPS } from '@/data/maps'
import { ENCOUNTERS } from '@/data/huntSpawnOverrides'
import { SPECIES, type Species } from '@/data/pokes'
import { colorForType } from '@/data/typeColors'
import { cn } from '@/lib/utils'

/**
 * O bioma sugerido pra quem esta comecando.
 *
 * ORIENTACAO, E NAO CADEADO — os 12 nascem abertos por decisao de desenho. O
 * risco que isto cobre e concreto: no dia 1 o jogador ve 12 portas que anunciam
 * exatamente a mesma coisa (Lv 1-10), e escolher entre doze iguais nao e
 * liberdade, e paralisia. Campo Aberto porque e o bioma NORMAL, o mais proximo
 * da primeira rota que a hunt inicial ja apresentou.
 */
export const BIOMA_RECOMENDADO = 'campo_aberto'

export type EstadoDoEstagio = 'limpo' | 'atual' | 'liberado' | 'bloqueado'

/**
 * O estado de um estagio pro jogador.
 *
 * Quatro, e nao tres, porque "liberado" e "o proximo que voce tem pra fazer"
 * pesam diferente na tela: o jogador precisa achar onde continuar sem ler os
 * dez. `atual` e o primeiro nao-limpo que esta liberado.
 */
export function estadoDoEstagio(
  progresso: ProgressoPorBioma, bioma: string, estagio: number,
): EstadoDoEstagio {
  const limpo = maiorEstagioLimpo(progresso, bioma)
  if (estagio <= limpo) return 'limpo'
  if (!estagioLiberado(progresso, bioma, estagio)) return 'bloqueado'
  return estagio === limpo + 1 ? 'atual' : 'liberado'
}

/** Os sub-biomas do estagio com a porcentagem de cada um, do maior pro menor. */
export function composicaoDoEstagio(
  bioma: BiomaDef, estagio: number,
): { chave: string; nome: string; pct: number }[] {
  const pesos = pesosDoEstagio(bioma, estagio)
  return Object.entries(pesos)
    .map(([chave, peso]) => ({
      chave,
      nome: SUB_BIOMA_POR_CHAVE[chave]?.sub.nome ?? chave,
      pct: peso * 100,
    }))
    // Sub-bioma com peso 0 nao e sorteado NESTE estagio — mostra-lo com "0%"
    // seria anunciar um lugar que o jogador nunca vai ver aqui. A ausencia dele
    // e justamente o que conta a historia de que o bioma afundou.
    .filter((s) => s.pct > 0.05)
    .sort((a, b) => b.pct - a.pct)
}

/** As especies que podem nascer no estagio, sem repetir. */
export function especiesDoEstagio(mapId: string): Species[] {
  const map = MAPS[mapId]
  if (!map) return []
  const vistas = new Set<string>()
  const lista: Species[] = []
  for (const encId of map.enemyPool) {
    const speciesId = ENCOUNTERS[encId]?.speciesId
    if (!speciesId) continue
    if (vistas.has(speciesId)) continue
    vistas.add(speciesId)
    const sp = SPECIES[speciesId]
    if (sp) lista.push(sp)
  }
  return lista
}

// ---------------------------------------------------------------------------
// Nivel 1 — os 12 biomas
// ---------------------------------------------------------------------------
/**
 * O icone do bioma: a arte dele, com a cor dele em volta (PH-469).
 *
 * O QUE ELE SUBSTITUI, E POR QUE. Era um circulo cheio de
 * `colorForType(bioma.tipo)`. Doze circulos de cor solida nao distinguem
 * LUGAR: a cor diz o elemento (e dois biomas de elemento vizinho ficam
 * quase iguais), e o jogador esta escolhendo onde cacar, nao qual tipo.
 * A arte de cada bioma ja existia desde a PH-441 e aparecia so no nivel 2.
 *
 * A COR NAO SAI — ela vira a BORDA. Ela continua sendo o unico canal que
 * agrupa bioma por elemento, e ela e o que le de relance numa grade de 12;
 * a arte e o que responde "que lugar e esse" quando o olho para. Trocar um
 * pelo outro perderia metade da leitura, ter os dois nao custa nada.
 *
 * DUAS CAMADAS, mesmo raciocinio do `FundoDoBioma`: a cor de tema (`bg.primary`)
 * e o piso enquanto a miniatura nao chega, e a arte entra com transicao. Sem
 * o piso, a grade de 12 pisca doze quadrados vazios na primeira abertura.
 */
function IconeDoBioma({ bioma, cor }: { bioma: BiomaDef; cor: string }) {
  const [carregou, setCarregou] = useState(false)
  return (
    <span
      aria-hidden
      className="relative block h-[2.4em] w-[2.4em] shrink-0 overflow-hidden rounded-[.5em]"
      style={{
        background: bioma.bg.primary,
        // Borda por `box-shadow` inset, e nao `border`: `border` come area da
        // caixa e a arte teria que ser reencaixada; o inset desenha o anel
        // POR CIMA da arte, entao a miniatura continua preenchendo o quadrado
        // inteiro. O halo externo e o mesmo do circulo antigo.
        boxShadow: `inset 0 0 0 .14em ${cor}, 0 0 10px ${cor}55`,
      }}
    >
      <img
        src={urlDaMiniaturaDoBioma(bioma.chave)}
        alt=""
        loading="lazy"
        decoding="async"
        onLoad={() => setCarregou(true)}
        className={cn(
          'h-full w-full object-cover transition-opacity duration-300',
          carregou ? 'opacity-100' : 'opacity-0',
        )}
      />
    </span>
  )
}

function CartaoDeBioma({
  bioma, progresso, onEscolher,
}: {
  bioma: BiomaDef
  progresso: ProgressoPorBioma
  onEscolher: () => void
}) {
  const limpo = maiorEstagioLimpo(progresso, bioma.chave)
  const cor = colorForType(bioma.tipo)
  const recomendado = bioma.chave === BIOMA_RECOMENDADO && limpo === 0

  return (
    <button
      type="button"
      onClick={onEscolher}
      className={cn(
        'group flex min-w-0 flex-col gap-[.35em] rounded-[.7em] border p-[.5em] text-left transition-colors',
        'border-n800 bg-n900 hover:border-n600 hover:bg-n800',
      )}
    >
      <div className="flex min-w-0 items-center gap-[.45em]">
        <IconeDoBioma bioma={bioma} cor={cor} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-n100">{bioma.nome}</div>
          {/* O SELO VAI EMBAIXO, E NAO AO LADO DO NOME. Na bancada, com ele na
              mesma linha, "Campo Aberto" virava "Ca…" e o subtitulo quebrava em
              tres linhas — o cartao recomendado era o unico ilegivel da grade,
              justamente o que o novato precisa ler. */}
          <div className="flex min-w-0 flex-wrap items-center gap-[.3em] text-[.72em] text-n500">
            <span className="truncate">
              {limpo === 0
                ? 'nenhum estágio limpo'
                : limpo >= ESTAGIOS_POR_BIOMA
                  ? 'bioma completo'
                  : `${limpo} de ${ESTAGIOS_POR_BIOMA} estágios`}
            </span>
            {recomendado && (
              <span className="shrink-0 rounded-[.3em] bg-ok/20 px-[.35em] py-[.05em] text-[.86em] font-bold text-ok">
                COMECE AQUI
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Dez tracinhos, um por estagio. Le o progresso do bioma inteiro sem
          ninguem ter que abrir a trilha — e o que faz a tela de 12 responder
          "onde eu parei" em cada um deles ao mesmo tempo. */}
      <div className="flex gap-[.15em]">
        {Array.from({ length: ESTAGIOS_POR_BIOMA }, (_, i) => (
          <span
            key={i}
            className={cn('h-[.3em] flex-1 rounded-full', i < limpo ? '' : 'bg-n700')}
            style={i < limpo ? { background: cor } : undefined}
          />
        ))}
      </div>
    </button>
  )
}

export function MapaDeBiomas({
  progresso, onEscolher,
}: {
  progresso: ProgressoPorBioma
  onEscolher: (chave: string) => void
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(11em,1fr))] gap-[.5em]">
      {BIOMAS.map((bioma) => (
        <CartaoDeBioma
          key={bioma.chave}
          bioma={bioma}
          progresso={progresso}
          onEscolher={() => onEscolher(bioma.chave)}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Nivel 2 — a trilha
// ---------------------------------------------------------------------------
/**
 * A arte de fundo da trilha de um bioma (PH-441).
 *
 * URL RELATIVA, como toda arte do jogo: `assets/` mora na RAIZ do repo, fora de
 * `public/`, e e servida por um plugin em dev e copiada pro `dist` no build
 * (ver vite.config.ts e scripts/copiar-assets.mjs). Um caminho absoluto aqui
 * quebraria no site publicado sem quebrar em dev.
 *
 * O nome do arquivo E a chave do bioma, e nao o nome de exibicao: as artes
 * chegaram como "campo aberto.jpg" e "metropole.jpg" (o Urbano), e nome com
 * espaco, maiuscula e acento vira URL fragil — o 404 de arte nao lanca erro
 * nenhum, so nao desenha.
 */
export function urlDoFundoDoBioma(chave: string): string {
  return `assets/biome-selector/${chave}.jpg`
}

/**
 * A MINIATURA da arte do bioma (PH-469), para o icone do cartao de nivel 1.
 *
 * NAO E A MESMA ARTE REDIMENSIONADA POR CSS, e a diferenca e de megabytes. As
 * 12 originais tem 2048px e somam 39 MB — elas existem pra ser o FUNDO da
 * trilha, onde uma delas por vez ocupa a tela e o peso se paga. O seletor
 * desenha as DOZE ao mesmo tempo num icone de ~2em: apontar o `<img>` pra
 * original faria a tela de 12 cartoes baixar 39 MB pra preencher 12
 * quadradinhos. `scripts/gerar-miniaturas-de-bioma.py` gera o recorte de 256px
 * em WebP — as 12 juntas dao 241 KB, 160x menos.
 */
export function urlDaMiniaturaDoBioma(chave: string): string {
  return `assets/biome-selector/mini/${chave}.webp`
}

/**
 * O fundo, com a arte entrando por cima da cor.
 *
 * TRES CAMADAS, e cada uma resolve um problema distinto:
 *
 *  1. a COR do bioma (no elemento-pai) — o piso enquanto os ~3 MB nao chegam;
 *  2. a ARTE, que aparece com transicao quando carrega. `onLoad` e nao
 *     `background-image` porque so o `<img>` avisa quando terminou, e sem esse
 *     aviso a unica opcao seria mostrar a arte na hora — que e o "pisca";
 *  3. o VEU escuro, que e o que torna o texto legivel. As 12 artes sao fotos
 *     de cena, com area clara e area escura na mesma imagem: sem o veu, metade
 *     dos nomes de estagio some no claro e a outra metade nao.
 */
function FundoDoBioma({ biomaChave }: { biomaChave: string }) {
  const [carregou, setCarregou] = useState(false)
  // A chave force a remontagem ao trocar de bioma: sem ela o `carregou` de um
  // bioma valeria pro seguinte, e a arte nova apareceria sem transicao.
  return (
    <div key={biomaChave} aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <img
        src={urlDoFundoDoBioma(biomaChave)}
        alt=""
        onLoad={() => setCarregou(true)}
        className={cn(
          'h-full w-full object-cover transition-opacity duration-500',
          carregou ? 'opacity-100' : 'opacity-0',
        )}
      />
      {/* O VEU E O QUE TORNA O TEXTO LEGIVEL, e calibrar a forca dele foi feito
          na bancada: a 85% a arte sumia (o motivo de ela existir ia junto), e
          sem veu nenhum metade dos nomes de estagio desaparecia nas areas
          claras das fotos. Mais forte em cima e embaixo, onde ficam o
          cabecalho e o fim da lista. */}
      <div className="absolute inset-0 bg-gradient-to-b from-n900/80 via-n900/40 to-n900/85" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// O CAMINHO
// ---------------------------------------------------------------------------
/**
 * Onde cada um dos 10 nos fica sobre a arte, em coordenadas RELATIVAS (0-1).
 *
 * POR QUE RELATIVAS. A area do mapa muda de largura com a tela, e a arte e
 * `object-cover`. Coordenada em pixel casaria com uma largura so e sairia do
 * lugar em qualquer outra — o no ficaria fora do caminho que ele deveria
 * seguir, sem nada quebrar.
 *
 * O CAMINHO DESCE, e isso nao e estetica: as 12 artes foram desenhadas
 * acompanhando a profundidade do bioma (no Marinho, ceu e praia em cima, leito
 * oceanico com corais embaixo; no Gelido, floresta nevada em cima e caverna de
 * gelo no fundo). Como o estagio 1 e o raso e o 10 e o fundo, um caminho que
 * subisse poria o estagio 10 na praia — a arte contaria o contrario da
 * mecanica.
 *
 * UM CAMINHO SO PRA OS 12, E NAO 120 COORDENADAS A MAO. Afinar cada no contra
 * cada arte fica melhor e custa 120 numeros que ninguem revisa e que quebram na
 * primeira troca de arte. O override existe (`CAMINHO_POR_BIOMA`) pra o bioma
 * cuja arte pedir outra coisa — mesmo padrao da curva de profundidade em
 * `estagios.ts`: uma regra que serve pra todos, com escape nomeado.
 *
 * A serpentina fica entre 10% e 90% da altura de proposito: a arte e quadrada
 * e a area do mapa e 4/3, entao `object-cover` corta um pouco de cima e de
 * baixo. No sem folga cairia bem na borda do corte.
 */
export const CAMINHO_PADRAO: readonly (readonly [number, number])[] = [
  [0.14, 0.10],
  [0.34, 0.17],
  [0.51, 0.27],
  [0.33, 0.37],
  [0.51, 0.46],
  [0.71, 0.52],
  [0.84, 0.62],
  [0.65, 0.71],
  [0.44, 0.79],
  [0.62, 0.90],
]

/**
 * Caminho proprio de um bioma, quando a arte dele pedir. Vazio hoje — o escape
 * existe pra nao travar em 120 coordenadas antes de alguem ver como o caminho
 * padrao cai sobre cada imagem.
 */
export const CAMINHO_POR_BIOMA: Record<string, readonly (readonly [number, number])[]> = {}

export function caminhoDoBioma(chave: string): readonly (readonly [number, number])[] {
  return CAMINHO_POR_BIOMA[chave] ?? CAMINHO_PADRAO
}

// ---------------------------------------------------------------------------
// O no sobre o mapa
// ---------------------------------------------------------------------------
/**
 * O rotulo curto do estado.
 *
 * ELE MIGROU PRO PAINEL com o desenho espacial: o no e um circulo com um
 * numero e nao carrega texto nenhum. O estado dele se le por forma e cor.
 */
const ROTULO_DO_ESTADO: Record<EstadoDoEstagio, string> = {
  limpo: 'LIMPO · FARM LIVRE',
  atual: 'CONTINUE AQUI',
  liberado: '',
  bloqueado: '',
}

/**
 * O verde de "concluido" (PH-469).
 *
 * Literal, e nao `var(--color-ok)`: o anel do no e desenhado por `box-shadow`
 * inline com opacidade concatenada (`${COR}88`), e `color-mix`/`var()` dentro
 * de uma string de sombra montada a mao nao aceita o sufixo de alfa. O valor e
 * o mesmo `--color-ok` do tema.
 */
const VERDE_DE_LIMPO = '#22c55e'

function NoNoMapa({
  estagio, estado, cor, x, y, selecionado, ehAtiva, onSelecionar, onDestacar,
}: {
  estagio: number
  estado: EstadoDoEstagio
  cor: string
  x: number
  y: number
  selecionado: boolean
  ehAtiva: boolean
  onSelecionar: () => void
  /** Ponteiro/foco entrou (`true`) ou saiu (`false`) — quem monta a dica e a trilha. */
  onDestacar: (dentro: boolean) => void
}) {
  const bloqueado = estado === 'bloqueado'
  const limpo = estado === 'limpo'
  // O ANEL E O ESTADO (PH-469). Antes o estagio limpo trocava o CONTEUDO do no
  // (`✓` no lugar do numero) e ganhava a cor do bioma como preenchimento. Isso
  // apagava a identidade do no: numa trilha com seis estagios limpos, os seis
  // eram o mesmo simbolo, e o jogador nao respondia "estou no 7" olhando o mapa
  // — tinha que contar os circulos. O numero passa a ficar SEMPRE, e o que muda
  // e o anel: verde = concluido, cor do bioma = disponivel, cinza = bloqueado.
  const corDoAnel = bloqueado ? '#3a3a44' : limpo ? VERDE_DE_LIMPO : cor
  return (
    <button
      type="button"
      onClick={onSelecionar}
      // SO PONTEIRO, sem `onFocus`. O pedido e "ao passar a seta em cima", e o
      // teclado ja tem resposta melhor: o `aria-label` abaixo e lido pelo leitor
      // de tela e a tecla de acao abre o painel, que carrega TUDO o que a dica
      // resume. Abrir a dica no foco tambem duplicaria a informacao na tela,
      // porque o clique de mouse deixa o no focado E sob o cursor.
      onMouseEnter={() => onDestacar(true)}
      onMouseLeave={() => onDestacar(false)}
      aria-label={`Estágio ${estagio}`}
      aria-pressed={selecionado}
      data-estado={estado}
      className={cn(
        'absolute z-[2] flex h-[2.4em] w-[2.4em] -translate-x-1/2 -translate-y-1/2',
        'items-center justify-center rounded-full text-[.85em] font-bold transition-transform',
        'hover:scale-110',
        // O ATUAL PULSA. Com dez pontos espalhados sobre uma foto, "onde eu
        // continuo" nao se acha lendo — precisa de um canal que o olho pegue
        // antes de qualquer texto.
        estado === 'atual' && 'animate-pulse',
      )}
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        // Fundo escuro nos QUATRO estados, pra o numero ter sempre o mesmo
        // contraste. O estagio limpo tinha preenchimento na cor do bioma, e
        // isso obrigava o numero a virar quase-preto — dois esquemas de
        // contraste na mesma trilha.
        background: bloqueado ? '#1a1a22' : '#12121a',
        color: bloqueado ? '#6b6b78' : corDoAnel,
        // Anel duplo: o de dentro na cor do ESTADO, o de fora PRETO. As artes
        // tem area clara, e um anel claro sobre neve some — o contorno escuro
        // e o que garante a silhueta do no em qualquer foto. O anel do limpo e
        // mais grosso: ele e o unico canal que sobrou pra "concluido", entao
        // ele precisa ganhar a comparacao de relance contra o anel do liberado.
        boxShadow: bloqueado
          ? 'inset 0 0 0 .14em #3a3a44, 0 0 0 .16em rgba(0,0,0,.75)'
          : `inset 0 0 0 ${limpo ? '.22em' : '.16em'} ${corDoAnel}, 0 0 0 .16em rgba(0,0,0,.75), 0 0 .9em ${corDoAnel}88`,
        outline: selecionado ? '.18em solid #f4f4f6' : undefined,
        outlineOffset: '.12em',
      }}
    >
      {estagio}
      {ehAtiva && (
        <span
          aria-hidden
          className="absolute -right-[.15em] -top-[.15em] h-[.7em] w-[.7em] rounded-full bg-ok"
          style={{ boxShadow: '0 0 0 .12em rgba(0,0,0,.75)' }}
        />
      )}
    </button>
  )
}

/**
 * A dica que aparece ao passar o cursor num no (PH-469).
 *
 * POR QUE NAO O `Explicacao`/base-ui. A bolha padrao do projeto e portada pro
 * `document.body` e ancora no `firstElementChild` do gatilho (ver
 * `components/shared/Explicacao.tsx` e a armadilha do `display: contents`). O
 * no da trilha e um `<button>` posicionado em `absolute` por `left`/`top` em
 * porcentagem: envolve-lo num gatilho tiraria o posicionamento do proprio
 * elemento. Aqui a dica mora DENTRO da caixa do mapa, que e o que garante que
 * ela nunca escapa do cartao, e a posicao dela sai das MESMAS coordenadas do
 * caminho — nao ha segunda fonte de verdade pra sair de sincronia.
 *
 * ELA NAO SUBSTITUI O PAINEL. O painel embaixo responde "o que tem la" com
 * calma (elenco, composicao completa, bloqueio); a dica responde "o que e este
 * ponto" sem gastar um clique — o que, com dez pontos espalhados, era o custo
 * de comparar dois estagios.
 */
const ROTULO_CURTO_DO_ESTADO: Record<EstadoDoEstagio, string> = {
  limpo: 'concluído',
  atual: 'continue aqui',
  liberado: 'liberado',
  bloqueado: 'bloqueado',
}

function DicaDoEstagio({
  estagio, estado, x, y, niveis, salas, composicao, ehAtiva,
}: {
  estagio: number
  estado: EstadoDoEstagio
  x: number
  y: number
  niveis: readonly [number, number]
  salas: number
  composicao: { chave: string; nome: string; pct: number }[]
  ehAtiva: boolean
}) {
  // A dica vai PRA CIMA do no na metade de baixo do mapa e pra baixo na metade
  // de cima — senao ela sai da caixa nos nos das pontas (o estagio 1 fica a 10%
  // da altura e o 10 a 90%).
  const acima = y > 0.5
  return (
    <div
      role="tooltip"
      aria-hidden
      className={cn(
        'pointer-events-none absolute z-[3] w-[11em] -translate-x-1/2 rounded-[.5em]',
        'border border-n700 bg-n900/95 p-[.45em] text-left shadow-lg',
        acima ? '-translate-y-[calc(100%+1.6em)]' : 'translate-y-[1.6em]',
      )}
      style={{
        // Centro preso entre 18% e 82% pra a caixa de 11em nao vazar nas
        // laterais; o `-translate-x-1/2` centra a dica nesse ponto, nao no no.
        left: `${Math.min(Math.max(x, 0.18), 0.82) * 100}%`,
        top: `${y * 100}%`,
      }}
    >
      <div className="flex items-baseline gap-[.35em]">
        <b className="text-[.9em] text-n100">Estágio {estagio}</b>
        <span className="text-[.72em] text-n400">Lv {niveis[0]}-{niveis[1]}</span>
      </div>
      <div className="text-[.7em] text-n500">
        {salas} salas · {ROTULO_CURTO_DO_ESTADO[estado]}
        {ehAtiva && <span className="font-bold text-ok"> · em caçada</span>}
      </div>
      {composicao.length > 0 && (
        <div className="mt-[.25em] flex flex-col gap-[.1em] text-[.7em] text-n300">
          {composicao.slice(0, 3).map((s) => (
            <div key={s.chave} className="flex justify-between gap-[.4em]">
              <span className="min-w-0 truncate">{s.nome}</span>
              <b className="tabular-nums text-n100">{Math.round(s.pct)}%</b>
            </div>
          ))}
          {composicao.length > 3 && (
            <div className="text-n600">+{composicao.length - 3} sub-biomas</div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * A linha que liga os nos, em SVG sobre a arte.
 *
 * DOIS TRACOS, e nao um: o trecho ja percorrido vem na cor do bioma e o que
 * falta vem pontilhado e apagado. Uma linha unica desenharia um caminho sem
 * progresso — e o progresso e a unica coisa que a FORMA da trilha existe pra
 * contar.
 *
 * Cada traco vai com um contorno preto por baixo. As 12 artes tem area clara: a
 * linha na cor do bioma sozinha some na neve do Gelido e no ceu do Marinho.
 *
 * `preserveAspectRatio="none"` com viewBox 0-100 deixa o SVG esticar junto com
 * a caixa, entao as coordenadas do caminho e as do SVG sao as MESMAS — os nos
 * (posicionados em %) e a linha nunca saem de sincronia.
 */
function LinhaDoCaminho({
  pontos, limpo, cor,
}: {
  pontos: readonly (readonly [number, number])[]
  limpo: number
  cor: string
}) {
  const traco = (de: number, ate: number) => pontos
    .slice(de, ate)
    .map(([x, y]) => `${x * 100},${y * 100}`)
    .join(' ')
  // O trecho percorrido vai ate o no do ultimo estagio limpo, e o que falta
  // comeca NELE — senao haveria um vao entre os dois.
  const feito = traco(0, Math.max(limpo, 1))
  const falta = traco(Math.max(limpo - 1, 0), pontos.length)

  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
    >
      <polyline
        points={falta} fill="none" stroke="rgba(0,0,0,.55)"
        strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        points={falta} fill="none" stroke="#8b8b99" strokeDasharray="6 6"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {limpo > 0 && (
        <>
          <polyline
            points={feito} fill="none" stroke="rgba(0,0,0,.6)"
            strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            points={feito} fill="none" stroke={cor}
            strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </>
      )}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// O painel de detalhe
// ---------------------------------------------------------------------------
/**
 * O que a lista vertical mostrava em cada linha, agora num painel so.
 *
 * O NO NAO CABE ISSO. Um circulo com um numero nao carrega faixa de nivel,
 * composicao de sub-bioma com porcentagem, contagem de salas e mensagem de
 * bloqueio — e foi exatamente por isso que a primeira versao virou uma lista.
 * A troca e a das duas referencias que o dono mandou: o mapa responde "onde
 * estou e pra onde vou", o painel responde "o que tem la".
 */
function PainelDoEstagio({
  bioma, estagio, estado, progresso, ehAtiva, entrando, onEntrar,
}: {
  bioma: BiomaDef
  estagio: number
  estado: EstadoDoEstagio
  progresso: ProgressoPorBioma
  ehAtiva: boolean
  entrando: boolean
  onEntrar: () => void
}) {
  const mapId = estagioId(bioma.chave, estagio)
  const [lo, hi] = niveisDoEstagio(estagio)
  const composicao = useMemo(() => composicaoDoEstagio(bioma, estagio), [bioma, estagio])
  const especies = useMemo(() => especiesDoEstagio(mapId), [mapId])
  const bloqueio = bloqueioDoEstagio(progresso, bioma.chave, estagio)
  const bloqueado = estado === 'bloqueado'

  return (
    <div className="flex flex-col gap-[.4em] rounded-[.6em] border border-n800 bg-n900 p-[.55em]">
      <div className="flex flex-wrap items-center gap-[.4em]">
        <span className="font-semibold text-n100">Estágio {estagio}</span>
        <span className="text-[.8em] text-n400">Lv {lo}-{hi}</span>
        <span className="text-[.72em] text-n600">{quantidadeDeSalas(mapId)} salas</span>
        {ROTULO_DO_ESTADO[estado] && (
          <span
            className={cn(
              'rounded-[.3em] px-[.35em] py-[.05em] text-[.62em] font-bold',
              estado === 'limpo' ? 'bg-n700 text-n300' : 'bg-ok/20 text-ok',
            )}
          >
            {ROTULO_DO_ESTADO[estado]}
          </span>
        )}
        {ehAtiva && (
          <span className="rounded-[.3em] bg-ok/20 px-[.35em] py-[.05em] text-[.62em] font-bold text-ok">
            EM CAÇADA
          </span>
        )}
      </div>

      {bloqueado && bloqueio && <div className="text-[.78em] text-warn">{bloqueio}</div>}

      {/* A COMPOSICAO DE SUB-BIOMA e o que conta que o bioma afunda: no Marinho
          a Praia cai de 60% pra 0% e o Leito Oceanico sobe de 0% pra 79% ao
          descer os dez. Sub-bioma de peso zero nao aparece — a ausencia dele E
          a historia. */}
      <div className="flex flex-wrap gap-[.3em]">
        {composicao.map((s) => (
          <span
            key={s.chave}
            className="rounded-[.35em] bg-n800 px-[.4em] py-[.1em] text-[.72em] text-n300"
          >
            {s.nome} <b className="text-n100">{Math.round(s.pct)}%</b>
          </span>
        ))}
      </div>

      <div className="text-[.72em] text-n500">POKEs deste estágio ({especies.length})</div>
      <div className="flex flex-wrap gap-[.25em]">
        {especies.map((sp) => (
          <span
            key={sp.id}
            className="rounded-[.35em] bg-n800 px-[.4em] py-[.1em] text-[.72em] text-n300"
          >
            {sp.name}
          </span>
        ))}
      </div>

      <BotaoDeEntrar
        cor={colorForType(bioma.tipo)}
        bloqueado={bloqueado}
        entrando={entrando}
        ehAtiva={ehAtiva}
        onEntrar={onEntrar}
      />
    </div>
  )
}

/**
 * O botao de entrar no estagio (PH-469).
 *
 * ELE SAIU DA LINHA DO CABECALHO, e o motivo e hierarquia, nao tamanho. Ele
 * estava inline entre o rotulo "3 salas" e o selo de estado, com `text-[.85em]`
 * — o mesmo peso visual do texto que ele estava ao lado. Numa tela cuja unica
 * acao e "entrar nesse estagio", a acao era o elemento mais discreto do painel.
 * Agora ele fecha o painel, ocupa a largura toda e e o unico elemento grande.
 *
 * A COR VEM DO BIOMA porque ela e o unico fio que liga o botao ao lugar em que
 * ele entra — o mesmo tom do anel dos nos e do caminho percorrido. Fora do
 * caminho feliz ela cede: bloqueado e cinza (a acao nao existe) e "voltar ao
 * campo" e verde (o mesmo verde de "EM CAÇADA" no resto do jogo).
 *
 * NAO USA `GameButton` de proposito: os cinco `variant` dele sao pilulas de
 * `text-[.85em]` pra barra de acao e trilho, e o `primary` e a pilula clara
 * (conteudo escuro sobre fundo claro) — nenhum deles cobre "o botao principal
 * de uma tela, na cor do contexto". Estender o design system com um sexto
 * variant usado uma vez so seria pior: a proxima tela herdaria a decisao desta.
 */
function BotaoDeEntrar({
  cor, bloqueado, entrando, ehAtiva, onEntrar,
}: {
  cor: string
  bloqueado: boolean
  entrando: boolean
  ehAtiva: boolean
  onEntrar: () => void
}) {
  const rotulo = entrando ? 'Entrando...' : bloqueado ? 'Bloqueado' : ehAtiva ? 'Voltar ao campo' : 'Entrar'
  // Verde literal e nao `var(--color-ok)`: entra em gradiente e em sombra com
  // sufixo de alfa concatenado, que `var()` nao aceita. Ver `VERDE_DE_LIMPO`.
  const acento = ehAtiva ? VERDE_DE_LIMPO : cor
  return (
    <button
      type="button"
      disabled={bloqueado || entrando}
      onClick={onEntrar}
      aria-busy={entrando || undefined}
      className={cn(
        'jogo-botao mt-[.15em] flex w-full cursor-pointer items-center justify-center gap-[.4em]',
        'rounded-[.55em] border-2 py-[.55em] text-[1.05em] font-black uppercase tracking-[.12em]',
        'transition-all focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none',
        bloqueado || entrando
          ? 'cursor-not-allowed border-n700 bg-n800 text-n600'
          : 'text-n50 hover:brightness-115 active:translate-y-[.06em]',
      )}
      style={bloqueado || entrando ? undefined : {
        borderColor: acento,
        // Gradiente na cor do bioma, escuro embaixo: o botao lê como uma placa
        // iluminada por cima, que e o que o distingue de um retangulo chapado
        // sem custar uma imagem.
        background: `linear-gradient(180deg, ${acento}55 0%, ${acento}22 55%, rgba(0,0,0,.35) 100%)`,
        boxShadow: `0 0 .9em ${acento}55, inset 0 .05em 0 ${acento}88`,
        textShadow: '0 .08em .2em rgba(0,0,0,.85)',
      }}
    >
      {entrando && <CircleNotch className="animate-spin" aria-hidden />}
      {rotulo}
    </button>
  )
}

// ---------------------------------------------------------------------------
// A trilha
// ---------------------------------------------------------------------------
export function TrilhaDoBioma({
  biomaChave, progresso, mapaAtivoId, abertoId, entrandoId, onAbrir, onEntrar, onVoltar,
}: {
  biomaChave: string
  progresso: ProgressoPorBioma
  mapaAtivoId: string | null
  abertoId: string | null
  entrandoId: string | null
  onAbrir: (mapId: string | null) => void
  onEntrar: (mapId: string) => void
  onVoltar: () => void
}) {
  const bioma = BIOMA_POR_CHAVE[biomaChave]
  if (!bioma) return null

  const limpo = maiorEstagioLimpo(progresso, bioma.chave)
  const cor = colorForType(bioma.tipo)
  const pontos = caminhoDoBioma(bioma.chave)
  // Qual no o cursor/foco esta em cima (PH-469). Estado LOCAL e nao no store:
  // ele morre com a tela e ninguem mais precisa dele.
  const [destacado, setDestacado] = useState<number | null>(null)

  // O painel abre no estagio ATUAL quando o jogador entra no bioma, e nao
  // vazio: chegar num mapa e ter que adivinhar qual dos dez clicar e o mesmo
  // problema que o pulso do no resolve — so que sem resposta nenhuma.
  const doAberto = abertoId != null ? parseEstagioId(abertoId) : null
  const selecionado = doAberto?.bioma === bioma.chave
    ? doAberto.estagio
    : Math.min(limpo + 1, ESTAGIOS_POR_BIOMA)

  return (
    <div className="flex flex-col gap-[.5em]">
      <div className="flex items-center gap-[.5em]">
        <button
          type="button"
          onClick={onVoltar}
          className="rounded-[.4em] bg-n800 px-[.5em] py-[.2em] text-[.8em] text-n300 hover:bg-n700"
        >
          ← Biomas
        </button>
        <span className="min-w-0 truncate font-medium text-n100">{bioma.nome}</span>
        <span className="text-[.75em] text-n500">
          {limpo} de {ESTAGIOS_POR_BIOMA} estágios
        </span>
      </div>

      {/* O MAPA. Proporcao FIXA pra a arte nao distorcer e pra as coordenadas
          relativas do caminho valerem em qualquer largura de tela. */}
      <div
        data-testid="mapa-da-trilha"
        className="relative isolate aspect-[4/3] w-full overflow-hidden rounded-[.7em] border border-n800"
        style={{ background: bioma.bg.primary }}
      >
        <FundoDoBioma biomaChave={bioma.chave} />
        <LinhaDoCaminho pontos={pontos} limpo={limpo} cor={cor} />
        {pontos.map(([x, y], i) => {
          const estagio = i + 1
          const mapId = estagioId(bioma.chave, estagio)
          return (
            <NoNoMapa
              key={mapId}
              estagio={estagio}
              estado={estadoDoEstagio(progresso, bioma.chave, estagio)}
              cor={cor}
              x={x}
              y={y}
              selecionado={selecionado === estagio}
              ehAtiva={mapaAtivoId === mapId}
              onSelecionar={() => onAbrir(mapId)}
              onDestacar={(dentro) => setDestacado(dentro ? estagio : (atual) => (atual === estagio ? null : atual))}
            />
          )
        })}
        {/* A dica do no destacado, montada aqui e nao dentro do `NoNoMapa`: o no
            e um `<button>` de 2.4em com `overflow` proprio e um filho de 11em
            dentro dele herdaria a escala e o `-translate` do no. Uma dica so na
            tela por vez tambem e o certo — duas abertas seria estado
            impossivel.

            O NO SELECIONADO NAO GANHA DICA. O painel logo abaixo ja mostra tudo
            o que ela resume, e com mais detalhe; abrir as duas repetiria "Estágio
            N", "Lv x-y" e a composicao no mesmo instante da tela. E acontece
            sempre, nao e caso de canto: clicar num no deixa o cursor em cima
            dele. */}
        {destacado != null && destacado !== selecionado && (() => {
          const [x, y] = pontos[destacado - 1]
          const mapId = estagioId(bioma.chave, destacado)
          return (
            <DicaDoEstagio
              estagio={destacado}
              estado={estadoDoEstagio(progresso, bioma.chave, destacado)}
              x={x}
              y={y}
              niveis={niveisDoEstagio(destacado)}
              salas={quantidadeDeSalas(mapId)}
              composicao={composicaoDoEstagio(bioma, destacado)}
              ehAtiva={mapaAtivoId === mapId}
            />
          )
        })()}
      </div>

      <PainelDoEstagio
        bioma={bioma}
        estagio={selecionado}
        estado={estadoDoEstagio(progresso, bioma.chave, selecionado)}
        progresso={progresso}
        ehAtiva={mapaAtivoId === estagioId(bioma.chave, selecionado)}
        entrando={entrandoId === estagioId(bioma.chave, selecionado)}
        onEntrar={() => onEntrar(estagioId(bioma.chave, selecionado))}
      />
    </div>
  )
}
