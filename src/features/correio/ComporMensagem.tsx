// Formulario de COMECAR UMA CONVERSA (PH-81).
//
// Era o formulario de escrever/responder carta. Perdeu as duas coisas: o campo
// ASSUNTO (conversa nao tem) e o modo RESPOSTA (responder agora e so mandar
// outra mensagem dentro do fio, em Conversa.tsx). Sobrou o unico caso que ainda
// precisa de formulario proprio: abrir conversa com quem ainda nao tem fio,
// apontando o destinatario pelo nick — e ja mandando anexo junto, se quiser.
import { useMemo, useState } from 'react'
import { PaperPlaneRight, Trash, X } from '@phosphor-icons/react'
import { GameButton, GameInput, GameSelect, SectionLabel } from '@/components/game/controls'
import { useGameStateStore } from '@/stores/gameStateStore'
import { getItem } from '@/data/items'
import { itemIconUrl } from '@/data/sprites'
import type { AnexoItemCorreio } from '@/data/remote/servidor'
import { cn } from '@/lib/utils'

export const MAX_CORPO = 1000
/** Espelha o limite da RPC `enviar_mensagem`. */
export const MAX_ANEXOS = 5

interface Props {
  /** Nick pre-preenchido (clicou em "Conversar" a partir de um amigo). */
  nickInicial?: string
  enviando: boolean
  onCancelar: () => void
  onEnviar: (dados: { nick: string; corpo: string; anexos: AnexoItemCorreio[] }) => void
}

export function ComporMensagem({ nickInicial, enviando, onCancelar, onEnviar }: Props) {
  const [nick, setNick] = useState(nickInicial ?? '')
  const [corpo, setCorpo] = useState('')
  const [anexos, setAnexos] = useState<AnexoItemCorreio[]>([])
  const [itemEscolhido, setItemEscolhido] = useState('')
  const [qtd, setQtd] = useState(1)

  const items = useGameStateStore((s) => s.items)
  const lockedItems = useGameStateStore((s) => s.lockedItems)

  // Item travado nao entra na lista: a RPC recusa de qualquer jeito, e oferecer
  // uma opcao que sempre da erro e pior que nao oferecer. A trava continua
  // revalidada no servidor — isto aqui e conveniencia, nao a regra.
  const disponiveis = useMemo(
    () => Object.entries(items)
      .filter(([id, qty]) => qty > 0 && !lockedItems[id] && !anexos.some((a) => a.itemId === id))
      .map(([id, qty]) => ({ id, qty, nome: getItem(id)?.name ?? id }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
    [items, lockedItems, anexos],
  )

  const maxQtd = itemEscolhido ? (items[itemEscolhido] ?? 0) : 0
  const podeEnviar = corpo.trim().length > 0 && nick.trim().length > 0

  function adicionarAnexo() {
    if (!itemEscolhido || qtd < 1) return
    const limite = Math.min(qtd, items[itemEscolhido] ?? 0)
    if (limite < 1) return
    setAnexos((a) => [...a, { itemId: itemEscolhido, quantity: limite }])
    setItemEscolhido('')
    setQtd(1)
  }

  return (
    <div className="flex flex-col gap-[.5em] rounded-[.7em] border border-primary/40 bg-n900 p-[.7em]">
      <div className="flex items-center justify-between">
        <SectionLabel>NOVA CONVERSA</SectionLabel>
        <GameButton variant="ghost" onClick={onCancelar} aria-label="Fechar">
          <X />
        </GameButton>
      </div>

      <label className="flex flex-col gap-[.2em] text-[.78em] text-n300">
        Para (nick exato)
        <GameInput
          value={nick}
          placeholder="Nome do treinador"
          maxLength={40}
          onChange={(e) => setNick(e.target.value)}
        />
      </label>

      <label className="flex flex-col gap-[.2em] text-[.78em] text-n300">
        Mensagem
        <textarea
          value={corpo}
          maxLength={MAX_CORPO}
          rows={4}
          placeholder="Escreva aqui"
          onChange={(e) => setCorpo(e.target.value)}
          className={cn(
            'jogo-campo min-w-0 resize-y rounded-[.45em] border border-n700 bg-n900 px-[.55em] py-[.32em]',
            'font-[inherit] text-[.85em] text-foreground placeholder:text-n500',
            'focus-visible:border-n500 focus-visible:outline-none',
          )}
        />
        <span className={cn('self-end text-[.72em]', corpo.length >= MAX_CORPO ? 'text-bad' : 'text-n500')}>
          {corpo.length}/{MAX_CORPO}
        </span>
      </label>

      <div className="flex flex-col gap-[.35em]">
          <SectionLabel>ANEXAR ITENS ({anexos.length}/{MAX_ANEXOS})</SectionLabel>

          {anexos.length > 0 && (
            <div className="flex flex-wrap gap-[.3em]">
              {anexos.map((a) => (
                <span
                  key={a.itemId}
                  className="flex items-center gap-[.3em] rounded-[.35em] border border-n700 bg-n800 px-[.35em] py-[.1em] text-[.78em]"
                >
                  <img
                    src={itemIconUrl(a.itemId) ?? undefined}
                    alt=""
                    aria-hidden
                    className="h-[1.2em] w-[1.2em] object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                  {getItem(a.itemId)?.name ?? a.itemId} x{a.quantity}
                  <button
                    type="button"
                    aria-label={`Remover ${getItem(a.itemId)?.name ?? a.itemId}`}
                    className="text-n400 hover:text-bad"
                    onClick={() => setAnexos((prev) => prev.filter((x) => x.itemId !== a.itemId))}
                  >
                    <Trash />
                  </button>
                </span>
              ))}
            </div>
          )}

          {anexos.length < MAX_ANEXOS && (
            <div className="flex flex-wrap items-end gap-[.35em]">
              <GameSelect
                className="min-w-[10em] flex-1"
                value={itemEscolhido}
                aria-label="Item para anexar"
                onChange={(e) => { setItemEscolhido(e.target.value); setQtd(1) }}
              >
                <option value="">Escolher item...</option>
                {disponiveis.map((i) => (
                  <option key={i.id} value={i.id}>{i.nome} ({i.qty})</option>
                ))}
              </GameSelect>
              <GameInput
                type="number"
                aria-label="Quantidade"
                className="w-[5em]"
                min={1}
                max={maxQtd || 1}
                value={qtd}
                disabled={!itemEscolhido}
                onChange={(e) => setQtd(Math.max(1, Math.min(maxQtd, Number(e.target.value) || 1)))}
              />
              <GameButton variant="secondary" disabled={!itemEscolhido} onClick={adicionarAnexo}>
                Anexar
              </GameButton>
            </div>
          )}

        {disponiveis.length === 0 && anexos.length === 0 && (
          <p className="text-[.75em] text-n500">
            Nenhum item disponivel. Itens travados nao podem ser anexados.
          </p>
        )}
      </div>

      <div className="flex justify-end gap-[.35em]">
        <GameButton variant="ghost" onClick={onCancelar}>Cancelar</GameButton>
        <GameButton
          variant="primary"
          carregando={enviando}
          disabled={!podeEnviar}
          onClick={() => onEnviar({ nick: nick.trim(), corpo: corpo.trim(), anexos })}
        >
          <PaperPlaneRight /> Enviar
        </GameButton>
      </div>
    </div>
  )
}
