import { useRef, useState } from 'react'
import { ArrowsOutSimple, ChatCircle, Minus, PaperPlaneTilt, ArrowsInSimple } from '@phosphor-icons/react'

type Channel = 'Log' | 'Mundo' | 'Comércio'
type Message = { id: number; author: string; text: string }
const CHANNELS: Channel[] = ['Log', 'Mundo', 'Comércio']
const INITIAL: Record<Channel, Message[]> = {
  Log: ['Você chegou à Mata.', 'Um Caterpie apareceu!', 'Seu parceiro está em campo.', 'Confira seus objetivos em Tasks.', 'Eventos ilustrativos; nenhum combate real.'].map((text, id) => ({ id, author: 'Hunt', text })),
  Mundo: ['Boa jornada, treinadores!', 'Alguém explorando a Mata?', 'Estou por aqui com meu Bulbasaur.', 'Vamos completar a Pokédex!', 'Acabei de encontrar um Caterpie.'].map((text, id) => ({ id, author: ['Lia', 'Caio', 'Nina', 'Theo', 'Lia'][id], text })),
  Comércio: ['Procuro itens de evolução.', 'Consultando as ofertas no Mercado.', 'Alguém buscando uma Water Stone?', 'Eu! Vamos conversar.', 'Ofertas fictícias; nenhuma transação.'].map((text, id) => ({ id, author: ['Rui', 'Bia', 'Leo', 'Bia', 'Prévia'][id], text })),
}

export function Chat() {
  const [mode, setMode] = useState<'compact' | 'expanded' | 'minimized'>('compact')
  const [channel, setChannel] = useState<Channel>('Log')
  const [messages, setMessages] = useState(INITIAL)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const history = useRef<HTMLDivElement>(null)
  const minimizeButton = useRef<HTMLButtonElement>(null)
  const restoreButton = useRef<HTMLButtonElement>(null)
  function latest() {
    const element = history.current
    if (element) element.scrollTop = element.scrollHeight
    setPending(false)
  }
  function minimize() {
    setMode('minimized')
    requestAnimationFrame(() => restoreButton.current?.focus())
  }
  function send() {
    const text = draft.trim()
    if (!text || channel === 'Log') return
    const readingOlder = history.current && history.current.scrollHeight - history.current.scrollTop - history.current.clientHeight > 24
    setMessages(previous => ({ ...previous, [channel]: [...previous[channel], { id: Date.now(), author: 'Você', text }].slice(-100) }))
    setDraft('')
    if (readingOlder) setPending(true)
    else requestAnimationFrame(latest)
  }
  if (mode === 'minimized') return <div className="hunt-chat hunt-chat--minimized"><button ref={restoreButton} aria-label="Abrir Conversas" onClick={() => { setMode('compact'); requestAnimationFrame(() => minimizeButton.current?.focus()) }}><ChatCircle size={19} aria-hidden="true" /><strong>Conversas</strong><span>Log · Mundo · Comércio</span></button></div>
  return <section className="hunt-chat" data-mode={mode} aria-label="Comunicador de jornada" onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); minimize() } }}>
    <header className="chat-heading"><ChatCircle size={19} aria-hidden="true" /><strong>Conversas</strong><small>PRÉVIA</small><button aria-label={mode === 'expanded' ? 'Reduzir Conversas' : 'Expandir Conversas'} onClick={() => { setMode(mode === 'expanded' ? 'compact' : 'expanded'); requestAnimationFrame(latest) }}>{mode === 'expanded' ? <ArrowsInSimple size={18} /> : <ArrowsOutSimple size={18} />}</button><button ref={minimizeButton} aria-label="Minimizar Conversas" onClick={minimize}><Minus size={18} /></button></header>
    <div className="chat-channels" role="group" aria-label="Canais de Conversas">{CHANNELS.map(name => <button key={name} aria-pressed={channel === name} onClick={() => { setChannel(name); setPending(false); setDraft(''); requestAnimationFrame(latest) }}>{name}</button>)}</div>
    <div className="chat-history" ref={history} role="region" aria-label={`Mensagens de ${channel}`} tabIndex={0} onScroll={() => { const element = history.current; if (element && element.scrollHeight - element.scrollTop - element.clientHeight < 24) setPending(false) }}>
      {(mode === 'compact' ? messages[channel].slice(-5) : messages[channel]).map(message => <p key={message.id} className="chat-message"><strong>{message.author}:</strong> <span>{message.text}</span></p>)}
    </div>
    {pending && <button className="chat-latest" onClick={latest}>Novas mensagens ↓</button>}
    {mode === 'expanded' && <><p className="chat-demo-note">Demonstração local · sem envio ao servidor.</p>{channel === 'Log' ? <p className="chat-readonly">Log da hunt · somente leitura</p> : <form className="chat-compose" onSubmit={event => { event.preventDefault(); send() }}><input aria-label={`Mensagem para ${channel}`} value={draft} maxLength={240} placeholder="Escreva uma mensagem…" onChange={event => setDraft(event.target.value)} /><button type="submit" aria-label="Enviar mensagem demonstrativa" disabled={!draft.trim()}><PaperPlaneTilt size={19} aria-hidden="true" /></button></form>}</>}
  </section>
}
