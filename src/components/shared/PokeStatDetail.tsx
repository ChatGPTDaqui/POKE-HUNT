// Pecas do perfil de POKE: cabecalho (sprite gen5 animada + identidade +
// barras), grid de stats/IVs, e a tabela de moveset completo.
//
// O cabecalho fica FORA do corpo trocado pelas abas (ver PokeProfileModal): se
// fosse remontado a cada clique de aba, a animacao do GIF reiniciaria do zero.
import type { ReactNode } from 'react'
import { expProgressForInstance } from '@/engine/systems/progressionSystem'
import { getAbility, BASIC_ATTACK } from '@/data/abilities'
import { activeAbilitiesPadrao, ehGolpeAoeDeNivel50, MAX_ACTIVE_ABILITIES } from '@/data/activeAbilities'
import { resolveAbilityCategory } from '@/data/abilityCategory'
import { controller } from '@/engine/controller'
import { useGameStateStore } from '@/stores/gameStateStore'
import { useToastStore } from '@/stores/toastStore'
import { cn } from '@/lib/utils'
import { gen5SpriteUrl } from '@/data/gen5Sprites'
import { rarityOf } from '@/data/rarity'
import type { PokeInstance, Species } from '@/data/pokes'
import { PokeNameTag } from './PokeNameTag'
import { StatusBadge } from './StatusBadge'
import { TypeChip } from './TypeChip'
import { AbilityTooltip } from './AbilityTooltip'
import { Meter } from '@/components/game/controls'
import type { AbilityCategory } from '@/data/generated/types'

// Rotulo das 3 categorias reais. Antes era um ternario `physical ? ... : ...`,
// que passou a mentir quando 'status' virou categoria de verdade com os dados
// do Ultra Sun: todo golpe de status apareceria como "Especial".
const ROTULO_CATEGORIA: Record<AbilityCategory, string> = {
  physical: 'Fisico',
  special: 'Especial',
  status: 'Status',
}

export function ProfileHero({ poke, species }: { poke: PokeInstance; species: Species }) {
  const url = gen5SpriteUrl(poke.speciesId, poke.isShiny)
  const hpPct = Math.max(0, (poke.hp / poke.stats.hp) * 100)
  const progress = expProgressForInstance(poke, species)
  const expPct = Math.max(0, Math.min(100, (progress.into / progress.needed) * 100))

  return (
    <div className="flex items-start gap-[.6em] border-b border-n800 p-[.7em]">
      <div
        // `object-contain` num box fixo: o GIF nativo varia muito de tamanho
        // (Charmander 41x42, Gyarados 102x84) e sem o box a arte "pula" de
        // tamanho a cada POKE aberto.
        className="flex h-[7em] w-[7em] shrink-0 items-center justify-center rounded-[.7em] border-2 bg-n900"
        style={{ borderColor: rarityOf(poke).color }}
      >
        {/* `h-full w-full` (e nao `max-h/max-w`): os GIFs nativos variam muito
            de tamanho — Charmander e 41x42, Gyarados e 102x84 — e com `max-*` os
            pequenos ficavam perdidos no meio de um box de 7em. Assim toda
            especie preenche o mesmo espaco, com upscale pixelado. */}
        <img
          src={url}
          alt={species.name}
          className="h-full w-full object-contain [image-rendering:pixelated]"
          onError={(e) => e.currentTarget.remove()}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-[.35em]">
        <div className="flex flex-wrap items-center gap-[.4em]">
          <PokeNameTag poke={poke} species={species} />
          <span className="text-n400">Lv{poke.level}</span>
        </div>
        <div className="flex gap-[.3em]">
          <TypeChip type={species.type} />
          {species.type2 && <TypeChip type={species.type2} />}
        </div>
        <div className="flex items-center gap-[.4em] text-[.75em] text-n400">
          <span>HP {Math.floor(poke.hp)}/{poke.stats.hp}</span>
          {/* So o nao-volatil aqui: a ficha abre pra qualquer POKE da equipe ou
              da mochila, e confusao so existe pra quem esta em campo. */}
          <StatusBadge status={poke.status} />
        </div>
        <Meter pct={hpPct} height=".45em" color={hpPct < 30 ? 'var(--color-hp-low)' : 'var(--color-hp)'} />
        <Meter pct={expPct} height=".3em" color="var(--color-exp)" />
      </div>
    </div>
  )
}

const IV_LABELS: Record<string, string> = {
  hp: 'HP', atkFis: 'AF', atkEsp: 'AE', def: 'DF', defEsp: 'DE', speed: 'VL',
}
// Um IV so e "perfeito" em 31 — e o teto do dado. Destacar em verde faz a
// leitura de "vale a pena investir neste POKE" ser instantanea.
const IV_MAX = 31

export function StatDetail({ poke, weaknessSection }: { poke: PokeInstance; weaknessSection: ReactNode }) {
  return (
    <div className="flex flex-col gap-[.5em]">
      {/* Ausente em POKE anterior a coluna `original_trainer` que o backfill
          nao alcancou (nenhum hoje) — a linha some em vez de mostrar vazio. */}
      {poke.originalTrainer && (
        <div className="flex items-center justify-between rounded-[.4em] border border-n800 bg-n900 px-[.55em] py-[.4em] text-[.85em]">
          <span className="text-n500">Treinador original</span>
          <b className="min-w-0 truncate font-medium">{poke.originalTrainer}</b>
        </div>
      )}
      <div className="grid grid-cols-3 gap-[.4em]">
        {([
          ['Atk Fis', poke.stats.atkFis],
          ['Atk Esp', poke.stats.atkEsp],
          ['Defesa', poke.stats.def],
          ['Def Esp', poke.stats.defEsp],
          ['Velocidade', poke.stats.speed],
        ] as const).map(([label, value]) => (
          <div key={label} className="flex justify-between rounded-[.4em] border border-n800 bg-n900 px-[.55em] py-[.4em]">
            <span className="text-[.85em] text-n500">{label}</span>
            <b className="font-medium">{value}</b>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-[.3em]">
        {Object.entries(poke.ivs).map(([key, value]) => {
          const perfeito = value >= IV_MAX
          return (
            <span
              key={key}
              className="rounded-[.4em] border px-[.5em] py-[.15em] text-[.72em]"
              style={{
                color: perfeito ? '#4ade80' : 'var(--color-n400)',
                borderColor: perfeito ? '#4ade80' : 'var(--color-n700)',
              }}
            >
              {IV_LABELS[key] || key} {value}
            </span>
          )
        })}
      </div>

      {weaknessSection}
    </div>
  )
}

const MOVE_GRID = 'grid grid-cols-[2.4em_1fr_3.4em_3.8em_3em_2.4em_2.6em] items-center gap-[.4em]'

// Checkbox generico da coluna "Usar" — usado tanto pro slot-de-4 (`ativo` =
// esta nos 4 escolhidos) quanto pro liga/desliga do Ataque Basico e do AOE do
// Nivel 50 (`ativo` = nao esta em `disabledAbilities`). Os dois ja
// funcionavam por baixo (double-click no AbilityHud, `disabledAbilities`) —
// aqui so torna a escolha visivel e explicavel na tela de perfil.
function CelulaCheckbox(
  { ativo, habilitado, tituloAtivo, tituloInativo, tituloDesabilitado, onClick }:
  { ativo: boolean; habilitado: boolean; tituloAtivo: string; tituloInativo: string; tituloDesabilitado: string; onClick: () => void },
) {
  return (
    <button
      type="button"
      disabled={!habilitado}
      onClick={onClick}
      title={habilitado ? (ativo ? tituloAtivo : tituloInativo) : tituloDesabilitado}
      className={cn(
        'h-[1.4em] w-[1.4em] rounded-[.25em] border font-[inherit] leading-none',
        ativo ? 'border-primary bg-primary text-n900' : 'border-n700 bg-transparent text-transparent',
        habilitado ? 'cursor-pointer' : 'cursor-not-allowed opacity-45',
      )}
    >
      ✓
    </button>
  )
}

// A celula da coluna "Usar" das linhas do learnset normal. Dois estados sem
// toggle: golpe ainda nao aprendido (nada), e dentro de hunt (mostra a marca,
// mas nao clica — as RPCs `definir_golpes_ativos` E `alternar_habilidade`
// recusam mudar golpe com sessao de hunt aberta, ver migration
// 20260815190000: reintroduzida a pedido do usuario, cobrindo tambem o AOE do
// Nivel 50 desta vez — antes so o slot-de-4 tinha trava).
function CelulaUsar(
  { aoe50, aprendido, ativo, habilitado, onClick }:
  { aoe50: boolean; aprendido: boolean; ativo: boolean; habilitado: boolean; onClick: () => void },
) {
  if (!aprendido) return <span className="text-n700">—</span>
  if (aoe50) {
    return (
      <CelulaCheckbox
        ativo={ativo}
        habilitado={habilitado}
        tituloAtivo="Desligar este golpe (nao ocupa slot, so entra/sai do combate)"
        tituloInativo="Ligar este golpe"
        tituloDesabilitado="Saia da hunt para trocar de golpe"
        onClick={onClick}
      />
    )
  }
  return (
    <CelulaCheckbox
      ativo={ativo}
      habilitado={habilitado}
      tituloAtivo="Remover dos golpes ativos"
      tituloInativo="Usar este golpe"
      tituloDesabilitado="Saia da hunt para trocar de golpe"
      onClick={onClick}
    />
  )
}

export function MovesetTable({ poke, species }: { poke: PokeInstance; species: Species }) {
  // O learnset COMPLETO da especie, nao so `poke.unlockedAbilities`: a tabela
  // tambem serve como preview de "o que vem por ai".
  const rows = species.abilities
    .map((entry) => ({ entry, ability: getAbility(entry.key) }))
    .filter((r): r is { entry: typeof r.entry; ability: NonNullable<typeof r.ability> } => Boolean(r.ability))
    .sort((a, b) => a.entry.levelReq - b.entry.levelReq)

  // A selecao dos 4 so aparece pra POKE QUE E SEU. Este mesmo componente abre
  // na Pokedex com um POKE de preview (createPokeInstance com uid solto), e la
  // nao ha nada a configurar — dai a checagem por uid no estado, e nao uma prop
  // que cada chamador teria que lembrar de passar.
  const equipe = useGameStateStore((s) => s.team)
  const mochila = useGameStateStore((s) => s.bagPokes)
  const emHunt = useGameStateStore((s) => s.currentMapId) != null
  const meu = [...equipe, ...mochila].some((p) => p.uid === poke.uid)

  // `poke` e a prop que o chamador passou — pro perfil aberto de um POKE
  // seu, isso e um SNAPSHOT tirado no clique que abriu o modal
  // (usePokeProfileStore#showProfile grava o objeto, nao um uid), que nunca
  // mais atualiza sozinho. Bug real achado ao vivo: marcar/desmarcar um
  // golpe aqui dentro chamava a acao certa (RPC ida, estado global mudava),
  // mas o proprio checkbox clicado continuava mostrando o valor antigo ate
  // fechar e reabrir o modal — mesmo o slot-de-4 preexistente ja tinha esse
  // problema, so nunca tinha um teste ao vivo que clicasse e conferisse a
  // tela sem reabrir. Resolvido lendo do POKE AO VIVO (equipe/mochila) por
  // uid quando ele e seu; POKE de preview (Pokedex/ranking) nao esta em
  // nenhum dos dois arrays, entao cai de volta na prop como sempre.
  const pokeVivo = equipe.find((p) => p.uid === poke.uid) ?? mochila.find((p) => p.uid === poke.uid) ?? poke

  const ativos = pokeVivo.activeAbilities ?? activeAbilitiesPadrao(species, pokeVivo.level)
  // Pedido explicito do usuario (revertendo uma leva anterior, que a tinha
  // removido a pedido DELE tambem): build fixo durante o combate, editavel so
  // fora da hunt. Tecnicamente nao havia risco de corromper nada (o servidor
  // so le `active_abilities`/`disabled_abilities` na proxima janela de flush,
  // <=30s) — a trava aqui e regra de jogo, nao protecao de dado, e a RPC quem
  // decide de verdade (`definir_golpes_ativos`/`alternar_habilidade`, ambas
  // recusando com sessao viva — migration 20260815190000). A tela so espelha.
  const podeEscolher = meu && !emHunt
  const desabilitados = pokeVivo.disabledAbilities ?? {}

  function alternar(key: string): void {
    if (!podeEscolher) return
    const ja = ativos.includes(key)
    if (!ja && ativos.length >= MAX_ACTIVE_ABILITIES) {
      useToastStore.getState().pushToast(`Maximo de ${MAX_ACTIVE_ABILITIES} golpes — desmarque um primeiro.`, 'info', 'world')
      return
    }
    controller.setActiveAbilities(poke.uid, ja ? ativos.filter((k) => k !== key) : [...ativos, key])
  }

  // Ataque Basico e o AOE do Nivel 50 nunca ocupam slot: sao liga/desliga puro
  // em `disabledAbilities`, mesmo caminho do double-click no AbilityHud —
  // mesma trava de hunt de `alternar`, ja que `alternar_habilidade` tambem
  // passou a recusar com sessao viva.
  function alternarOpcional(key: string): void {
    if (!podeEscolher) return
    controller.toggleAbility(poke.uid, key)
  }

  return (
    <div className="overflow-hidden rounded-[.4em] border border-n800 text-[.8em]">
      {meu && (
        <div className="flex items-center justify-between border-b border-n800 bg-n900 px-[.5em] py-[.35em]">
          <span className="text-n400">
            Golpes ativos <span className="text-foreground">{ativos.length}/{MAX_ACTIVE_ABILITIES}</span>
          </span>
          <span className="text-n500">
            {emHunt ? 'Saia da hunt para trocar de golpe.' : 'Clique na coluna Usar para escolher.'}
          </span>
        </div>
      )}
      <div
        className={`${MOVE_GRID} overflow-y-hidden border-b border-n800 bg-n800/60 px-[.5em] py-[.3em] font-medium`}
        style={{ scrollbarGutter: 'stable' }}
      >
        <span>Nv</span><span>Golpe</span><span>Tipo</span><span>Cat.</span><span>Dano</span><span>AOE</span><span>Usar</span>
      </div>
      {/* `scrollbar-gutter: stable` nos dois: sem isso, a barra de rolagem
          nativa (so aparece aqui, quando a lista estoura 18em) reduz a
          largura util so do corpo, desalinhando as colunas contra o
          cabecalho de cima (que nunca rola). Reservando o gutter sempre nos
          dois, a largura util fica igual com ou sem overflow. */}
      <div className="max-h-[18em] overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
        {meu && (
          <div className={`${MOVE_GRID} border-b border-n800 bg-n900 px-[.5em] py-[.3em] text-foreground`}>
            <span className="text-n400">—</span>
            <AbilityTooltip ability={BASIC_ATTACK} poke={pokeVivo}>
              <span className="cursor-help truncate underline decoration-dotted underline-offset-2">
                {BASIC_ATTACK.name}
              </span>
            </AbilityTooltip>
            <span><TypeChip type={BASIC_ATTACK.type} /></span>
            <span className="text-n400">{ROTULO_CATEGORIA[resolveAbilityCategory(BASIC_ATTACK, pokeVivo)]}</span>
            <span>{BASIC_ATTACK.power > 0 ? BASIC_ATTACK.power : '—'}</span>
            <span className="text-n400">—</span>
            <span>
              <CelulaCheckbox
                ativo={!desabilitados[BASIC_ATTACK.id]}
                habilitado={podeEscolher}
                tituloAtivo="Desligar o Ataque Basico (fallback universal — sem ele, o POKE fica sem opcao quando os golpes ativos estao em cooldown)"
                tituloInativo="Ligar o Ataque Basico"
                tituloDesabilitado="Saia da hunt para trocar de golpe"
                onClick={() => alternarOpcional(BASIC_ATTACK.id)}
              />
            </span>
          </div>
        )}
        {rows.map(({ entry, ability }, index) => {
          const learned = entry.levelReq <= pokeVivo.level
          const aoe50 = ehGolpeAoeDeNivel50(entry.key)
          return (
            <div
              // A chave inclui o indice porque uma especie PODE aprender o
              // mesmo golpe em dois niveis (forma evoluida herda no nivel 1 e
              // reaprende no nivel real dela) — so a chave do golpe duplicaria.
              key={`${entry.key}-${index}`}
              className={`${MOVE_GRID} border-b border-n800 px-[.5em] py-[.3em] last:border-b-0 ${
                learned ? 'bg-n900 text-foreground' : 'text-n500 opacity-45'
              }`}
            >
              <span className="text-n400">{entry.levelReq}</span>
              <AbilityTooltip ability={ability} poke={pokeVivo}>
                <span className="cursor-help truncate underline decoration-dotted underline-offset-2">
                  {ability.name}
                </span>
              </AbilityTooltip>
              <span><TypeChip type={ability.type} /></span>
              <span className="text-n400">
                {ROTULO_CATEGORIA[resolveAbilityCategory(ability, pokeVivo)]}
              </span>
              <span>{ability.power > 0 ? ability.power : '—'}</span>
              <span className="text-n400">{ability.target === 'aoe' ? '✓' : '—'}</span>
              <span>{meu && <CelulaUsar
                aoe50={aoe50}
                aprendido={learned}
                ativo={aoe50 ? !desabilitados[entry.key] : ativos.includes(entry.key)}
                habilitado={podeEscolher}
                onClick={() => (aoe50 ? alternarOpcional(entry.key) : alternar(entry.key))}
              />}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
