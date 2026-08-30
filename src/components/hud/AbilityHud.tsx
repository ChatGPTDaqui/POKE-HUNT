// Barra de golpes do POKE em campo. Icone do TIPO elemental sobre fundo na cor
// do mesmo tipo, borda na cor da CATEGORIA (fisico/especial), bolinha verde =
// AOE, faixa inferior com o dano base, anel branco = pronto, overlay preto =
// cooldown ou desligado.
//
// O icone substituiu o rotulo de 3 letras do nome do golpe. Tradeoff assumido:
// dois golpes do mesmo tipo passam a ficar visualmente iguais no slot — o que
// os separa agora e o dano na faixa de baixo e o tooltip. Em troca, a barra
// deixou de ser uma fileira de siglas ("EMB", "FLA", "SCR") e passou a dizer o
// elemento de relance. O rotulo continua existindo como fallback pra tipo sem
// arte (ver data/abilityIcons.ts).
//
// Duplo-clique num slot liga/desliga o golpe pra selecao automatica da IA
// (combatSystem#pickAbility filtra contra `poke.disabledAbilities`) — pedido
// explicito do usuario, util principalmente pra optar por nao usar
// self-destruct, mas funciona como on/off geral por golpe.
//
// Cooldown vem do `WorldEntity` (worldStore), nao do PokeInstance salvo: e
// estado de combate ao vivo, atualizado a cada tick.
import { getAbility, type Ability } from '@/data/abilities'
import { golpesUtilizaveis } from '@/data/activeAbilities'
import { SPECIES, type PokeInstance } from '@/data/pokes'
import { resolveAbilityCategory } from '@/data/abilityCategory'
import { abilityIconUrl } from '@/data/abilityIcons'
import { colorForType } from '@/data/typeColors'
import { controller } from '@/engine/controller'
import { segundosAtePoderUsar, cooldownProprio } from '@/engine/entity'
import { cooldownTotalDoGolpe } from '@/engine/systems/combatSystem'
import { useWorldStore } from '@/stores/worldStore'
import { useDeviceMode } from '@/stores/uiStore'
import { AbilityTooltip, descricaoDoGolpe } from '@/components/shared/AbilityTooltip'
import { Palavra } from '@/components/shared/Explicacao'
import { verbeteDoTipoDoGolpe, type VerbeteId } from '@/data/glossario'
import { Sheet } from '@/components/game/Sheet'
import { GameButton } from '@/components/game/controls'
import { AOE_RADIUS, DANO_SEM_PODER_BASE } from '@/data/abilities'
import { AVISO_DANO_POR_REGRA_PROPRIA } from '@/data/moveDescriptions'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const CATEGORY_BORDER: Record<string, string> = {
  physical: 'var(--color-cat-physical)',
  special: 'var(--color-cat-special)',
  // BUG REAL CORRIGIDO: a barra so mostrava golpe com dano (`isDamagingAbility`
  // filtrava golpe de status fora). Jogador que escolhia um golpe de status
  // como um dos 4 ativos (aba Golpes, PokeStatDetail) via a selecao "sumir" da
  // barra — sem icone, sem slot, nada dizendo que o golpe estava mesmo ativo.
  // A IA (combatSystem#pickAbility) sempre considerou golpe de status pra
  // selecao; so a barra que nao mostrava.
  status: 'var(--color-n500)',
}

function shortLabel(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 3)
}

/**
 * Sigla do golpe pro desempate de slots do MESMO tipo (PH-193, item 6).
 *
 * Nao reusa `shortLabel`: aquele quebra so em espaco, e nome com hifen —
 * "Lanca-Chamas" — vira uma letra so. Com dois golpes Fire de nome hifenizado o
 * "desempate" empatava. Aqui o hifen tambem separa palavra, e nome de palavra
 * unica cai pras tres primeiras letras em vez de uma inicial solitaria.
 *
 * Nao garante unicidade absoluta (dois golpes "Lab..." do mesmo tipo ainda
 * colidiriam). Nao vale complicar por isso: o criterio e ser distinguivel, e o
 * tooltip/ficha continuam sendo a resposta exata.
 *
 * PH-294: SO LETRA E DIGITO contam como palavra. Enquanto o corte era
 * `[\s-]+`, o golpe AoE por tipo — "Explosao Elemental (FIRE)" — quebrava em
 * tres pedacos e a inicial do terceiro era o PARENTESE: a barra mostrava
 * "EE(". Nao era caso raro — toda especie recebe o AoE do proprio tipo
 * (`typedAoeMoves`), entao qualquer POKE com outro golpe do mesmo tipo caia
 * nisso, incluindo o Charmeleon de tres golpes Fire que motivou a sigla.
 *
 * Descartar o "(FIRE)" tambem e certo pelo conteudo: o TIPO ja e o icone do
 * slot, e repeti-lo na sigla gastaria a unica informacao que ela tem a dar.
 */
export function siglaDoGolpe(name: string): string {
  // O trecho entre parenteses sai ANTES do corte, e nao vira palavra. Ele so
  // aparece no AoE por tipo, onde carrega o TIPO — que ja e o icone do slot. Um
  // "F" de FIRE na sigla nao distingue nada (cada POKE tem UM AoE, o do proprio
  // tipo) e gastaria um terco do espaco repetindo o que o icone diz.
  const semParenteses = name.replace(/\([^)]*\)/g, ' ')
  const palavras = semParenteses.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (palavras.length >= 2) return palavras.map((p) => p[0]).join('').toUpperCase().slice(0, 3)
  // Sem nenhuma palavra (nome so de pontuacao) devolve vazio em vez de repetir
  // a pontuacao: nao existe golpe assim no catalogo, e o teste varre o catalogo
  // inteiro pra garantir — mas a alternativa era mostrar "!!!" na barra.
  return (palavras[0] ?? '').slice(0, 3).toUpperCase()
}

// Tamanho do slot por regime de largura. Duas coisas acontecem aqui:
//
// 1. O padrao caiu de 3.4em pra 2.6em (pedido explicito: icones menores).
// 2. Ele encolhe mais em tela estreita. O `em` sozinho ja escalava com a largura
//    (a `.hud-root` tem font-size fluido), mas nao resolvia o problema real: o
//    numero de slots cresce com o nivel do POKE, e uma fileira de 8 slotes de
//    3.4em quebra em duas ou tres linhas num celular, inflando o rodape (que o
//    chat e o botao Auto medem e ancoram em cima — ver HudLayer). Encolher por
//    breakpoint mantem a fileira baixa.
const TAMANHO_SLOT = { largo: '2.6em', medio: '2.35em', estreito: '2.05em' } as const
const TAMANHO_ROTULO = { largo: '.8em', medio: '.75em', estreito: '.68em' } as const

export function AbilityHud() {
  const player = useWorldStore((s) => s.player)
  // Clima entra na conta da recarga por causa de Chlorophyll/Swift Swim/Sand
  // Rush, que DOBRAM a Velocidade — sem ele a barra do HUD contaria mais devagar
  // que o combate de verdade.
  const clima = useWorldStore((s) => s.clima?.tipo ?? null)
  const { mode, coarse } = useDeviceMode()
  // No dedo NAO existe hover, e o tooltip do golpe (a unica fonte de dano,
  // precisao, recarga e descricao) simplesmente nunca abria — informacao
  // inalcancavel, sem nenhum sinal de que existia. No toque o slot abre um
  // sheet com o mesmo conteudo, que tambem hospeda o liga/desliga: o
  // duplo-clique que fazia isso e um gesto que o celular usa pra zoom.
  const [detalhe, setDetalhe] = useState<Ability | null>(null)

  const poke = player?.poke ?? null
  if (!poke) return null

  const regime = mode === 'compacto' ? 'estreito' : mode === 'deitado' ? 'medio' : 'largo'
  const lado = TAMANHO_SLOT[regime]
  const fonteRotulo = TAMANHO_ROTULO[regime]

  const disabled = poke.disabledAbilities || {}
  // EXATAMENTE os slots escolhidos, no maximo 4 — a mesma funcao que
  // `combatSystem#pickAbility` le, entao a barra nunca mostra golpe que a IA
  // nao pode usar nem esconde um que ela pode.
  //
  // O Ataque Basico deixou de ser anexado no fim: desde 2026-08-18 ele so
  // aparece se o jogador tiver gasto um slot nele (ver data/activeAbilities.ts).
  // Enquanto ele era anexo, a barra mostrava 5 ou 6 icones e a tela de Golpes
  // dizia "4/4" logo ao lado.
  const abilities = golpesUtilizaveis(poke, SPECIES[poke.speciesId], false)
    .map((id) => getAbility(id))
    .filter((a): a is Ability => a != null)

  // POKE SEM NENHUM GOLPE PRA USAR: a unica coisa na tela que denuncia isso.
  //
  // Desde 2026-08-18 o Ataque Basico ocupa slot e o fallback escondido saiu do
  // caminho do jogador (`combatSystem#pickAbility` devolve `null` — o
  // `tentarAtaqueBasico` e exclusivo do selvagem). Ficar sem golpe continua
  // sendo escolha permitida, mas o POKE simplesmente para de atacar, e antes
  // disto a barra devolvia `null`: campo vazio, POKE parado, zero explicacao.
  // Le como jogo travado, e nao como consequencia de dois cliques na tela de
  // golpes.
  //
  // DOIS caminhos chegam no mesmo lugar, e por isso o aviso nao pode olhar so
  // pra contagem de slots:
  //
  //  - slots vazios (desmarcou os 4 em `MovesetTable`);
  //  - slots cheios e TODOS desligados (duplo clique/sheet aqui na barra grava
  //    `disabledAbilities`) — esse caso nem aparecia na contagem "4/4" da tela
  //    de golpes, porque o slot continua ocupado.
  const semGolpeUtilizavel = abilities.every((ability) => disabled[ability.id])

  return (
    <div className="pointer-events-auto flex flex-col items-center gap-[.35em]">
      {semGolpeUtilizavel && (
        <div
          role="status"
          className="vidro flex items-center gap-[.4em] rounded-full border border-bad/50 px-[.7em] py-[.25em] text-[.78em] text-bad"
        >
          <span aria-hidden>⚠</span>
          <span>
            {abilities.length === 0
              ? 'Sem golpe escolhido — seu POKE nao ataca.'
              : 'Todos os golpes desligados — seu POKE nao ataca.'}
          </span>
        </div>
      )}
      <div className="flex flex-wrap justify-center gap-[.45em]">
      {abilities.map((ability) => {
        // DESEMPATE SO QUANDO HA EMPATE (PH-193, item 6). O cabecalho deste
        // arquivo assume o tradeoff de trocar o rotulo pelo icone do tipo; o
        // que ele nao previu e que o pior caso — Charmeleon com tres golpes
        // Fire — e comum, e ali a barra vira tres quadrados laranja iguais,
        // separados so pelo dano da faixa de baixo.
        //
        // A sigla so aparece nos slots cujo tipo se repete NESTA barra. Com
        // quatro tipos diferentes nada muda, que e o caso comum e onde gastar
        // pixel com texto seria regressao.
        const tipoRepetido = abilities.filter((a) => a.type === ability.type).length > 1
        const isOff = Boolean(disabled[ability.id])
        // TRES numeros, e os tres importam por motivos diferentes:
        //
        //   cdProprio  a recarga DESTE golpe. E o que o jogador pediu pra ver
        //              individualmente, e o que diferencia os slots entre si.
        //   cd         o maior entre `cdProprio` e o turno global de 2s — e ele
        //              que decide se o golpe pode SAIR agora (`ready`).
        //   cdTotal    a recarga cheia deste golpe pra ESTE POKE, ja escalada
        //              pela Velocidade. Serve de denominador da barra.
        //
        // Ate esta leva a barra mostrava so `cd`, e o efeito colateral era que
        // os quatro slots exibiam O MESMO numero enquanto o turno global
        // mandasse — ou seja, exatamente a informacao que NAO distingue um
        // golpe do outro. Agora o numero grande e o proprio do golpe, e o
        // bloqueio por turno aparece como uma cortina mais leve.
        const cdProprio = player ? cooldownProprio(player, ability.id) : 0
        const cd = player ? segundosAtePoderUsar(player, ability.id) : 0
        const cdTotal = player ? cooldownTotalDoGolpe(player, ability, clima) : 0
        const ready = cd <= 0 && !isOff
        // Fracao JA RECARREGADA deste golpe. 1 = pronto. `cdTotal` pode ser 0
        // (golpe sem cooldown no catalogo) — nesse caso a barra fica cheia em
        // vez de dividir por zero.
        const fracaoPronta = cdTotal > 0 ? Math.max(0, Math.min(1, 1 - cdProprio / cdTotal)) : 1
        const borderColor = CATEGORY_BORDER[resolveAbilityCategory(ability, poke)] || CATEGORY_BORDER.physical
        const icone = abilityIconUrl(ability.type)

        return (
          <EnvolucroSlot
            key={ability.id}
            ability={ability}
            poke={poke}
            coarse={coarse}
            onAbrirDetalhe={() => setDetalhe(ability)}
          >
          <div
            onDoubleClick={coarse ? undefined : () => controller.toggleAbility(poke.uid, ability.id)}
            title={coarse ? undefined : (isOff ? 'Desligado — duplo clique religa' : 'Duplo clique desliga da rotação')}
            className={cn(
              'relative flex cursor-pointer items-center justify-center rounded-[.5em] select-none',
              ready && 'shadow-[0_0_0_2px_rgba(255,255,255,.85)]',
            )}
            style={{
              width: lado,
              height: lado,
              background: colorForType(ability.type),
              // Borda proporcional ao slot: em `.28em` fixos ela comia metade do
              // icone no tamanho estreito.
              border: `.2em solid ${borderColor}`,
            }}
          >
            {icone ? (
              // Duas coisas resolvem o "preto ao redor do icone", e so a
              // primeira e `object-fit`:
              //
              // 1. `object-cover` + `h/w-full` faz a arte PREENCHER o slot. Na
              //    versao anterior ela ocupava 78% com `object-contain`, e
              //    sobrava um anel da cor do tipo entre a arte e a borda de
              //    categoria.
              // 2. `mix-blend-mode: screen` apaga o PRETO DA PROPRIA ARTE.
              //    Os icones do repositorio de origem nao tem transparencia:
              //    sao ladrilhos 32x32 com fundo preto opaco, entao nenhum
              //    `object-fit` daria conta — o preto esta dentro do PNG. No
              //    modo `screen`, pixel preto vira neutro (deixa passar o que
              //    esta atras) e so o desenho fica, sobre a cor do tipo que ja
              //    e o fundo do slot.
              //
              // `pixelated` porque a arte e 32x32 desenhada pra ser vista
              // grande; suavizar borraria a pixel-art.
              //
              // BUG REAL CORRIGIDO: golpe desligado (Ataque Basico e o AOE de
              // Nivel 50 sao os dois que o jogador realmente desliga, ja que os
              // 4 escolhidos raramente saem de rotacao) ficava com o icone
              // ILEGIVEL — o overlay "OFF" antigo era `bg-black/75` cobrindo o
              // slot inteiro por CIMA da imagem, sobrando so 25% de opacidade
              // do desenho original por baixo de um preto quase solido. Na
              // pratica o jogador via um quadrado preto com "OFF" escrito, sem
              // nenhuma pista de qual golpe era aquele. Agora o desligamento
              // dessatura e escurece o PROPRIO icone (`grayscale` +
              // `opacity-40`) em vez de tapa-lo com uma camada opaca — o
              // desenho continua reconhecivel, so visivelmente "apagado".
              <img
                src={icone}
                alt=""
                aria-hidden
                draggable={false}
                className={cn(
                  'pointer-events-none h-full w-full object-cover',
                  isOff && 'grayscale opacity-40',
                )}
                style={{ imageRendering: 'pixelated', mixBlendMode: 'screen' }}
              />
            ) : (
              <span
                className={cn('font-mono font-bold text-white', isOff && 'opacity-40')}
                style={{ fontSize: fonteRotulo, textShadow: '0 1px 3px rgba(0,0,0,.8)' }}
              >
                {shortLabel(ability.name)}
              </span>
            )}

            {ability.target === 'aoe' && (
              <span className="absolute -top-[.3em] -right-[.3em] h-[.8em] w-[.8em] rounded-full border border-[#052e16] bg-[#4ade80]" />
            )}

            {/* CORTINA DE RECARGA DO PROPRIO GOLPE: sobe de baixo pra cima na
                proporcao do que falta. Diferente do numero, ela le de relance —
                quatro slots com alturas diferentes dizem na hora qual esta mais
                perto de sair. */}
            {cdProprio > 0 && !isOff && (
              <span
                className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] rounded-b-[.32em] bg-black/55"
                style={{ height: `${(1 - fracaoPronta) * 100}%` }}
              />
            )}

            {!ready && !isOff && (
              // O numero e o cooldown DO GOLPE quando ele existe; so cai pro
              // relogio global (que e igual nos quatro slots) quando o golpe ja
              // esta recarregado e o que falta e a vez de agir. Fonte acompanha
              // o slot: "12.3s" em `.85em` fixo transbordava o slot estreito.
              <span
                className={cn(
                  'absolute inset-0 z-[1] flex items-center justify-center rounded-[.32em] tabular-nums',
                  cdProprio > 0 ? 'text-white' : 'text-n300',
                )}
                style={{ fontSize: fonteRotulo }}
              >
                {(cdProprio > 0 ? cdProprio : cd).toFixed(1)}s
              </span>
            )}
            {tipoRepetido && !isOff && (
              // Mesma faixa de topo do `OFF`, e por isso ela so aparece com o
              // golpe ligado: os dois nunca disputam o mesmo lugar, e entre
              // "este golpe esta desligado" e "este e o Lanca-Chamas, nao a
              // Labareda", o estado ganha.
              <span
                className="pointer-events-none absolute inset-x-0 top-0 z-[2] rounded-t-[.32em] bg-black/70 text-center font-bold tracking-[.06em] text-[#e5e5e5]"
                style={{ fontSize: `calc(${fonteRotulo} * .78)` }}
              >
                {siglaDoGolpe(ability.name)}
              </span>
            )}
            {isOff && (
              // Faixa no rodape, nao cobertura total: o icone dessaturado (ver
              // acima) e quem carrega a informacao de QUAL golpe esta desligado
              // agora; este rotulo so confirma o estado, mesmo padrao visual da
              // faixa de dano logo abaixo dele (que continua por cima, z-[2]).
              <span
                className="absolute inset-x-0 top-0 rounded-t-[.32em] bg-black/70 text-center tracking-[.08em] text-n300"
                style={{ fontSize: `calc(${fonteRotulo} * .78)` }}
              >
                OFF
              </span>
            )}

            {/* z-[2] pra faixa de dano continuar legivel POR CIMA do overlay de
                cooldown, que cobre o slot inteiro. */}
            <span className="absolute inset-x-0 bottom-0 z-[2] rounded-b-[.32em] bg-black/70 text-center text-[.72em] text-[#e5e5e5]">
              {ability.power > 0 ? ability.power : '—'}
            </span>
          </div>
          </EnvolucroSlot>
        )
      })}
      </div>

      {detalhe && (
        <SheetDoGolpe
          ability={detalhe}
          poke={poke}
          desligado={Boolean(disabled[detalhe.id])}
          onClose={() => setDetalhe(null)}
        />
      )}
    </div>
  )
}

/**
 * Tooltip no mouse, toque no dedo. Sao dois caminhos porque o gesto e outro:
 * hover nao existe no celular, e um tooltip preso ao toque fica aberto sem
 * nada que o feche.
 */
function EnvolucroSlot({
  ability, poke, coarse, onAbrirDetalhe, children,
}: {
  ability: Ability
  poke: PokeInstance
  coarse: boolean
  onAbrirDetalhe: () => void
  children: ReactNode
}) {
  // O slot e um `button` NOS DOIS regimes: como `div` ele nao existia pro
  // teclado nem pro leitor de tela, e quem nao usa mouse nao tinha caminho
  // nenhum ate dano, precisao e recarga.
  //
  // Quem abre a ficha muda com o meio, e por isso o `event.detail`: o clique de
  // MOUSE nao pode abrir nada, senao o duplo clique que liga/desliga o golpe
  // abriria a ficha duas vezes no caminho. `detail === 0` e o clique vindo do
  // TECLADO (Enter/Espaco) — esse abre, e e o unico jeito de o teclado chegar
  // na informacao que o mouse pega no hover.
  const botao = (
    <button
      type="button"
      data-keep-open
      aria-label={`Detalhes de ${ability.name}`}
      onClick={(e) => {
        if (coarse || e.detail === 0) onAbrirDetalhe()
      }}
      // O tamanho do slot e calibrado com a fileira (8 golpes tem que caber numa
      // linha), entao ele nao estica no toque — cresce so a area, ver
      // `.alvo-estendido`.
      className="alvo-estendido relative cursor-pointer p-0 font-[inherit]"
      style={{ '--alvo-folga': '-6px', '--alvo-folga-x': '-3px' } as CSSProperties}
    >
      {children}
    </button>
  )
  if (!coarse) {
    return <AbilityTooltip ability={ability} poke={poke}>{botao}</AbilityTooltip>
  }
  return botao
}

const ROTULO_CATEGORIA: Record<string, string> = {
  physical: 'Físico', special: 'Especial', status: 'Status',
}

function SheetDoGolpe({
  ability, poke, desligado, onClose,
}: {
  ability: Ability
  poke: PokeInstance
  desligado: boolean
  onClose: () => void
}) {
  const categoria = resolveAbilityCategory(ability, poke)
  return (
    <Sheet winKey="golpe" snap="conteudo" zIndex={33} onClose={onClose} title={ability.name}>
      <div className="flex flex-col gap-[.7em]">
        <div className="flex flex-wrap items-center gap-[.4em]">
          <Palavra
            verbete={verbeteDoTipoDoGolpe(ability.type)}
            className="no-underline"
          >
            <span
              className="rounded-[.4em] px-[.5em] py-[.1em] text-[.8em] text-white"
              style={{ background: colorForType(ability.type) }}
            >
              {ability.type}
            </span>
          </Palavra>
          <Palavra verbete="categoriaDoGolpe" className="text-[.85em] text-n400">
            {ROTULO_CATEGORIA[String(categoria)] ?? String(categoria)}
          </Palavra>
        </div>

        {/* Cada rotulo desta grade era jargao sem legenda: "PP 5" nao diz que
            aqui o PP nao e gasto, e "Recarga 8.0s" nao diz que ela sai do PP e
            da Velocidade. Os cinco explicam a si mesmos agora. */}
        <div className="grid grid-cols-2 gap-[.4em] text-[.85em]">
          <Ficha
            verbete="danoBase"
            rotulo="Dano base"
            valor={ability.power > 0 ? String(ability.power) : '—'}
          />
          <Ficha verbete="precisao" rotulo="Precisão" valor={`${ability.accuracy ?? 100}%`} />
          <Ficha verbete="pp" rotulo="PP" valor={String(ability.pp)} />
          <Ficha
            verbete="recarga"
            rotulo="Recarga"
            valor={ability.cooldown != null ? `${ability.cooldown.toFixed(1)}s` : '—'}
          />
          <Ficha
            verbete="area"
            rotulo="Alcance"
            valor={ability.target === 'aoe' ? `Área (raio ${ability.radius ?? AOE_RADIUS})` : 'Alvo único'}
          />
        </div>

        <p className="text-[.85em] text-n300">{descricaoDoGolpe(ability)}</p>
        {/* Mesma correcao do tooltip: o "Dano base —" acima nao diz de onde o
            dano sai, e nesses golpes ele sai de uma regra propria. */}
        {DANO_SEM_PODER_BASE.has(ability.id) && (
          <p className="text-[.85em] text-n400">{AVISO_DANO_POR_REGRA_PROPRIA}</p>
        )}

        {/* Substitui o duplo-clique do desktop. O rotulo diz o ESTADO RESULTANTE
            do toque, nao o atual — "Desligar" num golpe ligado. */}
        <GameButton
          variant={desligado ? 'primary' : 'secondary'}
          block
          className="justify-center"
          onClick={() => {
            controller.toggleAbility(poke.uid, ability.id)
            onClose()
          }}
        >
          {desligado ? 'Ligar na rotação' : 'Desligar da rotação'}
        </GameButton>
      </div>
    </Sheet>
  )
}

function Ficha({ rotulo, valor, verbete }: { rotulo: string; valor: string; verbete: VerbeteId }) {
  return (
    <div className="flex flex-col gap-[.1em] rounded-[.5em] border border-n800 px-[.6em] py-[.4em]">
      <Palavra verbete={verbete} className="text-[.8em] text-n500">{rotulo}</Palavra>
      <b className="font-medium tabular-nums">{valor}</b>
    </div>
  )
}
