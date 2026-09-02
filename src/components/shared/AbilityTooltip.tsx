// Tooltip de golpe: tipo, categoria, PP, cooldown, area, descricao e os EFEITOS
// com numero (chance de status, estagio de atributo, dreno, flinch, critico —
// ver `efeitosDoGolpe`).
//
// A categoria e resolvida com o POKE em maos (`resolveAbilityCategory`) porque
// o golpe de nivel 50 tem categoria `dynamic` — ela depende de qual atributo do
// POKE e maior no nivel 50. Um tooltip que mostrasse "dynamic" nao diria nada.
import type { ReactNode } from 'react'
import {
  AOE_RADIUS,
  CLIMA_DO_GOLPE,
  DANO_SEM_PODER_BASE,
  OHKO_DESLIGADO,
  isDamagingAbility,
  type Ability,
} from '@/data/abilities'
import { resolveAbilityCategory } from '@/data/abilityCategory'
import {
  AVISO_DANO_POR_REGRA_PROPRIA,
  AVISO_OHKO_DESLIGADO,
  AVISO_SEM_DANO,
  MOVE_DESCRIPTIONS,
  golpeTemEfeitoReal,
} from '@/data/moveDescriptions'
import { ROTULO_ESTAGIO } from '@/data/statLabels'
import { formatarEstagio } from '@/data/textoDeEstagioEPrazo'
import { nomeDoStatus } from '@/data/statusEffects'
import { colorForType } from '@/data/typeColors'
import type { PokeInstance } from '@/data/pokes'
import { Explicacao } from './Explicacao'
import { cn } from '@/lib/utils'

// 'status' e categoria de verdade desde a base de dados do Ultra Sun (ate a
// Gen III a categoria era decidida pelo TIPO do golpe e nao existia uma
// terceira). Golpe de status pode ou nao ter efeito real aqui — ver
// `golpeTemEfeitoReal` (data/moveDescriptions.ts), que decide se o aviso logo
// abaixo aparece.
const ROTULO_CATEGORIA: Record<string, string> = { physical: 'Fisico', special: 'Especial', status: 'Status' }

/**
 * Os efeitos do golpe COM NÚMERO, lidos do próprio objeto `Ability` — o mesmo
 * dado que o motor de combate consome.
 *
 * POR QUE ISTO EXISTE (PH-71): até aqui a ficha mostrava tipo, categoria, dano
 * base, precisão, PP, recarga e área — e depois a descrição em prosa, escrita à
 * mão, como ÚNICA informação sobre o que o golpe faz. Chance de status, estágios
 * de atributo, percentual de dreno, chance de flinch, estágio de crítico: nada
 * disso aparecia na tela, mesmo estando no dado. O jogador escolhia os 4 slots
 * com base num texto que nada verificava, e foi assim que 479 golpes acumularam
 * divergência sem ninguém notar.
 *
 * Ler do dado é o ponto: esta lista NÃO PODE divergir do combate, porque é a
 * mesma fonte. Texto em prosa continua existindo, mas para o sabor do golpe, não
 * para os números.
 */
export function efeitosDoGolpe(ability: Ability): string[] {
  const efeitos: string[] = []

  if (ability.status) {
    const chance = ability.statusChance ?? 100
    efeitos.push(`${nomeDoStatus(ability.status)}${chance < 100 ? ` (${chance}%)` : ''}`)
  }

  for (const mudanca of ability.statChanges ?? []) {
    const chance = ability.statChance ?? 100
    // PH-421: o tooltip promete o RESULTADO, e nao o degrau. "Atk Fis +2" nao
    // diz ao jogador que o Ataque DOBRA; "para 2x (+100%)" diz.
    //
    // A conta parte do zero de proposito: o tooltip e lido antes de escolher o
    // golpe, e nesse instante nao existe "estagio atual" — o mesmo golpe pode
    // cair num POKE neutro ou num ja buffado. Prometer o resultado a partir do
    // neutro e a unica leitura que nao depende de estado que a tela nao tem.
    const alvo = ability.statTarget === 'self' ? 'de quem usa' : 'do alvo'
    efeitos.push(
      `${ROTULO_ESTAGIO[mudanca.stat]} ${alvo} para ${formatarEstagio(mudanca.stat, mudanca.estagios)}`
      + `${chance < 100 ? ` (${chance}%)` : ''}`,
    )
  }

  // Dreno e recuo dividem `drainPercent` — o SINAL e que separa os dois (ver
  // combatSystem.ts). Mostrar "50%" sem dizer de que e o percentual foi
  // exatamente o mal-entendido que abriu esta issue: dreno e do DANO CAUSADO,
  // nao do HP do alvo.
  if (ability.drainPercent) {
    const p = Math.abs(ability.drainPercent)
    efeitos.push(ability.drainPercent > 0
      ? `Cura ${p}% do dano causado`
      : `Recuo: ${p}% do dano causado`)
  }
  if (ability.healPercent) efeitos.push(`Cura ${ability.healPercent}% do HP máximo`)
  // PH-422: "turno" sai do texto de jogo tambem aqui. Nao e prazo, e a ACAO
  // que o alvo perde — e essa e a palavra que o jogador entende sem precisar
  // saber que este motor tem turno de 3s.
  if (ability.flinchChance) efeitos.push(`${ability.flinchChance}% de tirar a ação do alvo`)
  if (ability.critStages) efeitos.push('Chance de crítico maior')
  if (ability.hazard) efeitos.push('Armadilha no campo inimigo')
  const clima = CLIMA_DO_GOLPE[ability.id]
  if (clima) efeitos.push(`Muda o clima para ${clima}`)

  return efeitos
}

export function descricaoDoGolpe(ability: Ability): string {
  const pronta = MOVE_DESCRIPTIONS[ability.id]
  if (pronta) return pronta
  // Golpes que nao vem da planilha: o Ataque Basico e os 17 de nivel 50, todos
  // conteudo proprio deste jogo. Descrever pelo que eles fazem AQUI e mais
  // correto que inventar texto de um golpe que nao existe no original.
  if (ability.id === 'basic_attack') {
    return 'Golpe universal: todo POKE sempre tem este, mesmo sem nenhum outro golpe de dano aprendido.'
  }
  if (ability.id.startsWith('aoe50_')) {
    return `Golpe de área aprendido no Nível 50, tematico do tipo ${ability.type}. A categoria acompanha o maior atributo de ataque do POKE no Nível 50.`
  }
  return 'Sem descrição.'
}

export function AbilityTooltip({
  ability, poke, desligado, children,
}: {
  ability: Ability
  poke?: PokeInstance | null
  /**
   * O golpe esta FORA da rotacao (PH-165).
   *
   * Opcional porque esta bolha tambem e usada fora da fileira de golpes (ficha
   * do POKE, item linkado no chat), onde ligar e desligar nao existe. Quando vem
   * definido, a bolha ganha a linha do duplo clique — que antes era um `title=`
   * nativo no slot, ou seja: hover puro, sem formatacao, e disputando o MESMO
   * gesto com esta bolha aqui.
   */
  desligado?: boolean
  children: ReactNode
}) {
  const categoria = poke ? resolveAbilityCategory(ability, poke) : ability.category
  const cor = colorForType(ability.type)
  const descricao = descricaoDoGolpe(ability)
  const efeitos = efeitosDoGolpe(ability)
  const semDano = ability.power <= 0 && !golpeTemEfeitoReal(ability)
  // Golpe de regra propria: `power` 0 no catalogo, dano real vindo de
  // combatSystem#specialDamageFor. "Dano base 0" sozinho le como golpe fraco.
  const danoPorRegraPropria = DANO_SEM_PODER_BASE.has(ability.id)
  const ohkoDesligado = OHKO_DESLIGADO.has(ability.id)

  return (
    <Explicacao
      envolve="bloco"
      conteudo={
        <div className="flex flex-col gap-[.3em] text-left">
          <div className="flex flex-wrap items-center gap-[.4em]">
            <b>{ability.name}</b>
            <span className="rounded-[.3em] px-[.35em] text-[.85em] text-white" style={{ background: cor }}>
              {ability.type}
            </span>
            <span className="text-[.85em] opacity-80">
              {ROTULO_CATEGORIA[String(categoria)] ?? String(categoria)}
            </span>
          </div>

          <div className="flex flex-wrap gap-x-[.55em] text-[.9em] opacity-85">
            <span>Dano base {danoPorRegraPropria ? '—' : ability.power}</span>
            {/* Precisao so pra golpe de DANO: golpe de status passa pelo mesmo
                sorteio no motor, mas mostrar "100%" nele sugere um teste de
                acerto que na pratica nunca falha.
                `isDamagingAbility` e nao `power > 0`: os 12 de
                DANO_SEM_PODER_BASE tem poder 0 e causam dano, e com o teste
                antigo a precisao deles nunca aparecia — Earthquake mostrava
                "Precisão 100%" e Magnitude, ao lado, nada. */}
            {isDamagingAbility(ability) && (
              <span className={(ability.accuracy ?? 100) < 100 ? 'text-warn' : undefined}>
                Precisao {ability.accuracy ?? 100}%
              </span>
            )}
            <span>PP {ability.pp}</span>
            {ability.cooldown != null && <span>Recarga {ability.cooldown.toFixed(1)}s</span>}
            {ability.target === 'aoe' && <span>Área (raio {ability.radius ?? AOE_RADIUS})</span>}
          </div>

          <span className="opacity-85">{descricao}</span>

          {/* Efeitos COM NUMERO, do proprio dado do golpe — ver efeitosDoGolpe.
              Ficam depois da prosa de proposito: a prosa diz o que o golpe e, e
              estas linhas dizem o que ele faz de fato neste jogo. */}
          {efeitos.length > 0 && (
            <div className="flex flex-wrap gap-[.3em]">
              {efeitos.map((efeito) => (
                <span key={efeito} className="rounded-[.3em] bg-n800 px-[.4em] py-[.05em] text-[.8em]">
                  {efeito}
                </span>
              ))}
            </div>
          )}
          {/* So golpe SEM efeito real nenhum implementado aqui (nem dano, nem
              status/estagio/clima/escudo/etc) — ver golpeTemEfeitoReal. */}
          {semDano && <span className="text-[.85em] text-warn">{AVISO_SEM_DANO}</span>}
          {danoPorRegraPropria && (
            <span className="text-[.85em] opacity-70">{AVISO_DANO_POR_REGRA_PROPRIA}</span>
          )}
          {ohkoDesligado && <span className="text-[.85em] text-warn">{AVISO_OHKO_DESLIGADO}</span>}
          {/* PH-165: o duplo clique. Por ultimo de proposito — e instrucao de
              interface, e as linhas acima sao o golpe. O texto diz o estado
              ATUAL e o que o gesto faz com ele, porque so "duplo clique
              desliga" num golpe ja desligado seria mentira. */}
          {desligado != null && (
            <span className={cn('text-[.85em]', desligado ? 'text-warn' : 'opacity-70')}>
              {desligado
                ? 'Fora da rotação — duplo clique religa.'
                : 'Duplo clique desliga da rotação.'}
            </span>
          )}
        </div>
      }
    >
      {children}
    </Explicacao>
  )
}
