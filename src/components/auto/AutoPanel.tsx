// Port de js/ui/panels/AutoPanel.js — corpo do painel de automacoes
// (auto-pot / auto-catch / auto-revive).
//
// Duas coisas do original sumiram de proposito:
//  - `updateAutoPanelCounts` rodando a cada frame pra manter os badges "x12"
//    de quantidade vivos sem tocar no <select>: era um workaround pro mesmo
//    bug de reconstruir DOM interativo debaixo do ponteiro. Aqui os badges
//    saem de um selector do Zustand (`items`), entao atualizam sozinhos
//    quando a quantidade muda, e o <select> so re-renderiza se o valor dele
//    de fato mudou.
//  - `controller.save()` apos cada mutacao: o `persist` do Zustand grava
//    sozinho a cada escrita na store.
import { useEffect, useRef } from 'react'
import { ITEMS } from '@/data/items'
import { SPECIES } from '@/data/pokes'
import { getEncounter } from '@/data/enemies'
import { BEST_POTION_OPTION } from '@/engine/systems/autoSystem'
import { useGameStateStore } from '@/stores/gameStateStore'
import { sincronizarAuto } from '@/data/remote/autoridade'
import { useWorldStore } from '@/stores/worldStore'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const MAX_AUTO_POT_RULES = 3

const POTION_OPTIONS = Object.values(ITEMS).filter((i) => i.kind === 'potion')
const BALL_OPTIONS = Object.values(ITEMS).filter((i) => i.kind === 'ball')

function InfoIcon({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border text-[9px] text-muted-foreground" />
        }
      >
        ?
      </TooltipTrigger>
      <TooltipContent className="max-w-64 bg-popover text-popover-foreground">{text}</TooltipContent>
    </Tooltip>
  )
}

function ItemCountBadge({ itemId }: { itemId: string }) {
  const count = useGameStateStore((s) => s.items[itemId] ?? 0)
  if (itemId === BEST_POTION_OPTION) return null
  return <span className="shrink-0 text-[11px] text-muted-foreground">x{count}</span>
}

// Especies que podem nascer na hunt atual — mesma cadeia enemyPool ->
// encounter -> species que o HuntMenu ja usa. Deduplicado, ja que a mesma
// especie pode ter varias linhas de encontro no mesmo pool.
function useCurrentHuntSpecies() {
  const mapDef = useWorldStore((s) => s.mapDef)
  if (!mapDef) return []
  const seen = new Map<string, (typeof SPECIES)[string]>()
  for (const encounterId of mapDef.enemyPool) {
    const enc = getEncounter(encounterId)
    const species = enc && SPECIES[enc.speciesId]
    if (species && !seen.has(species.id)) seen.set(species.id, species)
  }
  return [...seen.values()]
}

export function AutoPanel() {
  const autoToggles = useGameStateStore((s) => s.autoToggles)
  const autoPotRules = useGameStateStore((s) => s.autoPotRules)
  const autoCatchConfig = useGameStateStore((s) => s.autoCatchConfig)
  const autoCatchRules = useGameStateStore((s) => s.autoCatchRules)
  const setAutoToggle = useGameStateStore((s) => s.setAutoToggle)
  const addAutoPotRule = useGameStateStore((s) => s.addAutoPotRule)
  const updateAutoPotRule = useGameStateStore((s) => s.updateAutoPotRule)
  const removeAutoPotRule = useGameStateStore((s) => s.removeAutoPotRule)
  const setAutoCatchConfig = useGameStateStore((s) => s.setAutoCatchConfig)
  const addAutoCatchRule = useGameStateStore((s) => s.addAutoCatchRule)
  const updateAutoCatchRule = useGameStateStore((s) => s.updateAutoCatchRule)
  const removeAutoCatchRule = useGameStateStore((s) => s.removeAutoCatchRule)

  // A config de auto e sincronizada em BLOCO quando muda, em vez de rotear os
  // 14 pontos de mutacao um a um — ver sincronizarAuto(). Nao e cosmetico: o
  // servidor le estas regras ao decidir usar pocao/bola durante a simulacao.
  //
  // O primeiro disparo e ignorado de proposito: ele aconteceria logo apos o
  // estado chegar DO servidor, e mandaria os mesmos valores de volta a cada
  // abertura do painel.
  const primeiraSync = useRef(true)
  useEffect(() => {
    if (primeiraSync.current) { primeiraSync.current = false; return }
    sincronizarAuto()
  }, [autoToggles, autoPotRules, autoCatchConfig, autoCatchRules])


  const huntSpecies = useCurrentHuntSpecies()

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span>
          Auto-pot
          <InfoIcon text="Cura automaticamente usando as regras abaixo. Cada regra define um limite de vida (%) e qual pocao usar quando o POKE cair abaixo desse limite. A primeira regra que corresponder (na ordem da lista) e usada." />
        </span>
        <Switch checked={autoToggles.autoPot} onCheckedChange={(v) => setAutoToggle('autoPot', v)} />
      </div>

      <div className="space-y-1.5">
        {autoPotRules.map((rule, index) => (
          <div key={index} className="flex flex-wrap items-center gap-1.5 rounded-md border p-1.5">
            <span>Vida &lt;=</span>
            <Input
              type="number"
              min={1}
              max={99}
              value={rule.hpPercent}
              onChange={(e) =>
                updateAutoPotRule(index, { hpPercent: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })
              }
              className="h-7 w-14 px-1.5 text-xs"
            />
            <span>%, usar</span>
            <select
              value={rule.itemId}
              onChange={(e) => updateAutoPotRule(index, { itemId: e.target.value })}
              className="h-7 rounded border bg-background px-1 text-xs"
            >
              <option value={BEST_POTION_OPTION}>Escolher melhor</option>
              {POTION_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <ItemCountBadge itemId={rule.itemId} />
            {autoPotRules.length > 1 && (
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => removeAutoPotRule(index)}>
                Remover
              </Button>
            )}
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="h-7 w-full text-[11px]"
        disabled={autoPotRules.length >= MAX_AUTO_POT_RULES}
        onClick={() => addAutoPotRule({ hpPercent: 50, itemId: BEST_POTION_OPTION })}
      >
        + Adicionar regra
      </Button>

      <div className="flex items-center justify-between gap-2">
        <span>
          Auto-catch
          <InfoIcon text="Lanca automaticamente a bola escolhida abaixo em todo inimigo derrotado, tentando captura-lo. Capturas sempre vao para a mochila." />
        </span>
        <Switch checked={autoToggles.autoCatch} onCheckedChange={(v) => setAutoToggle('autoCatch', v)} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span>
          Catch Shiny
          <InfoIcon text="Quando ativado, usa uma bola diferente (escolhida abaixo) especificamente ao capturar POKES Shiny — uma variante rara e colorida." />
        </span>
        <Switch
          checked={autoCatchConfig.catchShinyEnabled}
          onCheckedChange={(v) => setAutoCatchConfig({ catchShinyEnabled: v })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 rounded-md border p-1.5">
          <span className="text-[11px] text-muted-foreground">Bola padrao</span>
          <div className="flex items-center gap-1">
            <select
              value={autoCatchConfig.ballId}
              onChange={(e) => setAutoCatchConfig({ ballId: e.target.value })}
              className="h-7 min-w-0 flex-1 rounded border bg-background px-1 text-xs"
            >
              {BALL_OPTIONS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <ItemCountBadge itemId={autoCatchConfig.ballId} />
          </div>
        </label>

        <label className="flex flex-col gap-1 rounded-md border p-1.5">
          <span className="text-[11px] text-muted-foreground">Bola Shiny</span>
          <div className="flex items-center gap-1">
            <select
              value={autoCatchConfig.shinyBallId}
              disabled={!autoCatchConfig.catchShinyEnabled}
              onChange={(e) => setAutoCatchConfig({ shinyBallId: e.target.value })}
              className="h-7 min-w-0 flex-1 rounded border bg-background px-1 text-xs disabled:opacity-50"
            >
              {BALL_OPTIONS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <ItemCountBadge itemId={autoCatchConfig.shinyBallId} />
          </div>
        </label>
      </div>

      <div className="font-medium">
        Regras por especie
        <InfoIcon text="Define uma bola especifica pra uma especie da hunt atual. Tem prioridade sobre a bola padrao/shiny. Se a bola da regra acabar, o bot so mata aquela especie em vez de gastar outra bola nela." />
      </div>

      {huntSpecies.length === 0 && (
        <div className="text-muted-foreground">Entre numa hunt pra configurar regras por especie.</div>
      )}

      <div className="space-y-1.5">
        {autoCatchRules.map((rule, index) => {
          // A especie de uma regra pode sobreviver a hunt em que foi criada
          // (o jogador seguiu em frente) — mantem ela selecionavel/visivel em
          // vez de sumir silenciosamente do proprio dropdown.
          const options = new Map(huntSpecies.map((s) => [s.id, s.name]))
          if (rule.speciesId && !options.has(rule.speciesId)) {
            const stale = SPECIES[rule.speciesId]
            options.set(rule.speciesId, stale ? `${stale.name} (fora da hunt atual)` : rule.speciesId)
          }
          return (
            <div key={index} className="flex flex-wrap items-center gap-1.5 rounded-md border p-1.5">
              <select
                value={rule.speciesId}
                onChange={(e) => updateAutoCatchRule(index, { speciesId: e.target.value })}
                className="h-7 min-w-0 flex-1 rounded border bg-background px-1 text-xs"
              >
                {[...options.entries()].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={rule.ballItemId}
                onChange={(e) => updateAutoCatchRule(index, { ballItemId: e.target.value })}
                className="h-7 rounded border bg-background px-1 text-xs"
              >
                {BALL_OPTIONS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <ItemCountBadge itemId={rule.ballItemId} />
              <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => removeAutoCatchRule(index)}>
                Remover
              </Button>
            </div>
          )
        })}
      </div>

      <Button
        variant="outline"
        size="sm"
        className="h-7 w-full text-[11px]"
        disabled={huntSpecies.length === 0}
        onClick={() => {
          if (huntSpecies.length === 0) return
          const alreadyRuled = new Set(autoCatchRules.map((r) => r.speciesId))
          const firstFree = huntSpecies.find((s) => !alreadyRuled.has(s.id)) || huntSpecies[0]
          addAutoCatchRule({ speciesId: firstFree.id, ballItemId: autoCatchConfig.ballId })
        }}
      >
        + Adicionar regra
      </Button>

      <div className="flex items-center justify-between gap-2">
        <span>
          Auto-revive
          <InfoIcon text="Se o POKE em campo desmaiar, usa automaticamente um Revive da mochila para reanima-lo." />
        </span>
        <Switch checked={autoToggles.autoRevive} onCheckedChange={(v) => setAutoToggle('autoRevive', v)} />
      </div>
    </div>
  )
}
