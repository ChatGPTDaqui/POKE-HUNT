// Um anuncio de POKE (28/10/2026): extraido de ComprarPokes pra servir a pagina
// do grupo. Comprar, ofertar e dar lance continuam nos mesmos fluxos de
// sempre — este arquivo so mudou de endereco, as regras nao.
import { useState } from 'react'
import { AvatarDoTreinador } from '@/components/shared/AvatarDoTreinador'
import { BookmarkSimple, ChatCircleDots, Gavel } from '@phosphor-icons/react'
import * as mercadoRpc from '@/data/remote/mercadoRpc'
import { type AnuncioMercado } from '@/data/remote/servidor'
import { SPECIES } from '@/data/pokes'
import { faceIconUrl } from '@/data/sprites'
import { RARITIES, type RarityKey } from '@/data/rarity'
import { useUiStore } from '@/stores/uiStore'
import { useAuthStore } from '@/stores/authStore'
import { usePokeProfileStore } from '@/stores/pokeProfileStore'
import { GameButton, GameCard, GameInput } from '@/components/game/controls'
import { cn } from '@/lib/utils'
import { useAcaoMercado } from '../hooks/useAcaoMercado'
import { anuncioParaConversa, fmt } from '../utils'
import { Moeda } from './shared'
import { TempoRestante } from './TempoRestante'
import { useSegundosRestantes, proximoLanceMinimo } from '../tempoDeLeilao'

/**
 * O cartao de perfil espera um POKE completo, e o anuncio so guarda o resumo
 * da vitrine (especie, nivel, raridade, shiny, IV medio).
 *
 * Os atributos exibidos sao entao os da especie NAQUELE nivel — o que e
 * verdade sobre o que esta a venda — mas os IVs individuais nao vem no anuncio,
 * so a media. Preencher os seis com a media seria inventar numero: aqui eles
 * vao zerados e o cartao mostra a media real na linha do anuncio.
 */
function anuncioComoPoke(a: AnuncioMercado) {
  const species = SPECIES[a.species_id]
  const ivs = { hp: 0, atkFis: 0, atkEsp: 0, def: 0, defEsp: 0, speed: 0 }
  return {
    uid: `anuncio-${a.id}`,
    speciesId: a.species_id,
    level: a.level,
    exp: 0,
    hp: species?.base.hp ?? 1,
    isShiny: a.is_shiny,
    rarity: a.rarity as RarityKey,
    ivs,
    stats: { hp: 1, atkFis: 1, atkEsp: 1, def: 1, defEsp: 1, speed: 1 },
    unlockedAbilities: [],
  }
}

/**
 * A linha de um LEILAO na vitrine (PH-101).
 *
 * Separada num componente proprio porque ela e a unica da lista que precisa de
 * um relogio: `useSegundosRestantes` assina o tique de 1s, e um hook nao pode
 * ficar dentro do `.map` do cartao (a ordem de hooks mudaria a cada filtro
 * aplicado, que e exatamente o que o React proibe).
 */
function LinhaDeLeilao({
  anuncio, valor, onValor, onLance, pendente,
}: {
  anuncio: AnuncioMercado
  valor: number | undefined
  onValor: (v: number) => void
  onLance: (valor: number) => void
  pendente: boolean
}) {
  const segundos = useSegundosRestantes(anuncio.expira_em)
  // Ja venceu e o cron ainda nao passou: o servidor recusa lance depois de
  // `expira_em`, entao a tela desabilita em vez de deixar o jogador tentar e
  // levar um erro.
  const encerrado = segundos != null && segundos <= 0

  // O minimo do PROXIMO lance sai da mesma regra que o servidor aplica: sem
  // lance ainda e o piso do leilao, com lance e o maior + o incremento.
  const minimo = proximoLanceMinimo(anuncio.melhorOferta, anuncio.lance_minimo, anuncio.incremento_minimo)

  return (
    <>
      <span className="flex flex-col text-[.78em] text-menu-muted">
        <span className="flex items-center gap-[.25em] text-warn">
          <Gavel weight="fill" /> Leilão · <TempoRestante expiraEm={anuncio.expira_em} />
        </span>
        <span>
          {anuncio.melhorOferta != null
            ? <>maior: <Moeda valor={anuncio.melhorOferta} tipo={anuncio.currency} /></>
            : <>sem lance ainda</>}
          {' · '}mínimo {fmt.format(minimo)}
        </span>
      </span>
      <GameInput
        type="number"
        min={minimo}
        className="w-[6.5em]"
        // O campo nasce VAZIO com o mínimo no placeholder, e não preenchido com
        // ele: um valor já digitado num campo de lance convida a clicar sem ler,
        // e aqui clicar sem ler tira ouro do bolso na hora.
        placeholder={String(minimo)}
        disabled={encerrado}
        value={valor ?? ''}
        onChange={(e) => onValor(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
      />
      <GameButton
        variant="primary"
        carregando={pendente}
        disabled={encerrado || !(valor != null && valor >= minimo)}
        onClick={() => valor != null && onLance(valor)}
      >
        {encerrado ? 'Encerrado' : 'Dar lance'}
      </GameButton>
    </>
  )
}

export function CartaoDeAnuncio({ anuncio: a }: { anuncio: AnuncioMercado }) {
  const abrirPerfilPublico = useUiStore((s) => s.abrirPerfilPublico)
  const abrirSocialCom = useUiStore((s) => s.abrirSocialCom)
  const meuId = useAuthStore((s) => s.user?.id ?? null)
  const showProfile = usePokeProfileStore((s) => s.showProfile)
  const [valor, setValor] = useState<number | undefined>(undefined)
  const comprar = useAcaoMercado((anuncioId: string) => mercadoRpc.comprarAnuncio(anuncioId))
  const ofertar = useAcaoMercado(mercadoRpc.ofertar)
  const darLance = useAcaoMercado(mercadoRpc.darLance)
  const species = SPECIES[a.species_id]
  const cor = RARITIES[a.rarity as RarityKey]?.color
  return (
    <GameCard className="flex flex-wrap items-center gap-[.45em] p-[.4em]">
      <img
        src={faceIconUrl(a.species_id, a.is_shiny) ?? undefined}
        alt=""
        className="h-[2.4em] w-[2.4em] shrink-0 rounded-[.4em] object-cover"
        style={cor ? { border: `2px solid ${cor}` } : undefined}
      />
      <div className="min-w-[8em] flex-1">
        <div className="flex flex-wrap items-center gap-[.35em]">
          <b className={cn('font-medium', a.is_shiny && 'text-shiny')}>
            {a.is_shiny ? '✨ ' : ''}{species?.name ?? a.species_id}
          </b>
          <span className="text-menu-muted">Lv{a.level}</span>
          <span className="text-[.78em]" style={cor ? { color: cor } : undefined}>
            {RARITIES[a.rarity as RarityKey]?.label ?? a.rarity}
          </span>
        </div>
        <div className="text-[.75em] text-menu-muted">
          IV {a.iv_percent}% · vendedor{' '}
          {/* PH-119: o nome do vendedor era texto morto. Vira o caminho
              pro perfil dele, e de lá pra conversa — negociar preço era
              o pedido, e antes exigia achar o sujeito no Painel de
              Amigos, que só lista quem já é amigo.

              O PRÓPRIO anúncio fica sem link: a vitrine NÃO esconde o que
              você mesmo anunciou, e o caminho terminaria num botão
              "Conversar" que o servidor recusa com "Voce nao pode mandar
              mensagem pra si mesmo" — erro depois do clique, para uma
              situação que dava pra não oferecer. */}
          {/* PH-548: a foto do vendedor ao lado do nome, em linha. */}
          <AvatarDoTreinador userId={a.seller_id} tamanho={1.4} className="mr-[.25em] align-middle" />
          {a.seller_id === meuId ? (
            <span className="text-menu-muted">{a.vendedor} (você)</span>
          ) : (
            <>
              <button
                type="button"
                className="underline decoration-dotted underline-offset-2 transition-colors hover:text-menu-ink"
                onClick={() => abrirPerfilPublico({ userId: a.seller_id, nome: a.vendedor ?? '?' })}
              >
                {a.vendedor}
              </button>
              {/* PH-435: negociar direto, sem passar pelo perfil.
                  O caminho do PH-119 tinha três telas (vitrine → perfil →
                  conversa) e perdia o anúncio na primeira: o vendedor
                  recebia "aceita 1.8M?" sem saber de qual POKE se tratava.
                  Aqui o anúncio vai junto e vira card no fio dos dois. */}
              {' · '}
              <button
                type="button"
                aria-label={`Negociar ${SPECIES[a.species_id]?.name ?? a.species_id} com ${a.vendedor ?? 'o vendedor'}`}
                className="inline-flex items-center gap-[.2em] text-menu-brand underline decoration-dotted underline-offset-2 transition-colors hover:text-menu-ink"
                onClick={() => abrirSocialCom({
                  userId: a.seller_id,
                  nick: a.vendedor ?? '?',
                  anuncio: anuncioParaConversa(a),
                })}
              >
                <ChatCircleDots aria-hidden /> negociar
              </button>
            </>
          )}
          {a.apenas_oferta && ` · ${a.ofertas ?? 0} oferta(s)`}
        </div>
        {/* PH-437: este anuncio esta na vitrine DELE e de mais ninguem.
            Sem dizer isso, o comprador ve um preco que nao existe pra
            outros jogadores e nao tem como saber que ele foi combinado
            nem que ninguem vai passar na frente. */}
        {a.reservado_para && a.reservado_para === meuId && (
          <span className="mt-[.15em] flex w-fit items-center gap-[.2em] rounded-full bg-menu-brand/15 px-[.4em] text-[.72em] text-menu-brand">
            <BookmarkSimple aria-hidden weight="fill" /> reservado para você
          </span>
        )}
      </div>
      {a.modo === 'leilao' ? (
        <LinhaDeLeilao
          anuncio={a}
          valor={valor}
          onValor={setValor}
          onLance={(valor) => darLance.mutate({ anuncioId: a.id, valor })}
          pendente={darLance.isPending}
        />
      ) : a.apenas_oferta ? (
        <>
          <span className="flex flex-col text-[.78em] text-menu-muted">
            <span className="flex items-center gap-[.25em] text-warn">
              <Gavel weight="fill" /> Somente lance
            </span>
            {a.melhorOferta != null && (
              <span>maior: <Moeda valor={a.melhorOferta} tipo={a.currency} /></span>
            )}
          </span>
          <GameInput
            type="number"
            min={1}
            className="w-[6.5em]"
            placeholder="Seu lance"
            value={valor ?? ''}
            onChange={(e) => setValor(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          />
          <GameButton
            variant="primary"
            carregando={ofertar.isPending}
            disabled={!(valor != null && valor > 0)}
            onClick={() => valor != null && ofertar.mutate({ anuncioId: a.id, valor })}
          >
            Ofertar
          </GameButton>
        </>
      ) : (
        <>
          <Moeda valor={a.price ?? 0} tipo={a.currency} />
          <GameButton
            variant="primary"
            carregando={comprar.isPending}
            onClick={() => comprar.mutate(a.id)}
          >
            Comprar
          </GameButton>
        </>
      )}
      {species && (
        <GameButton variant="ghost" onClick={() => showProfile(anuncioComoPoke(a), species)}>
          Ver
        </GameButton>
      )}
    </GameCard>
  )
}
