import { useRef, useState } from 'react'
import { MagnifyingGlass, Backpack } from '@phosphor-icons/react'
import { CATEGORIES, ITEMS, filterItems } from './data'
import type { Category, Item } from './data'
import { PrimaryButton } from './primitives'

export function BagPanel({ notify }: { notify: (message: string) => void }) {
  const [category, setCategory] = useState<Category>('Todos')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Item>(ITEMS[0])
  const detailRef = useRef<HTMLElement>(null)
  const items = filterItems(category, search)
  return <div className="bag-workspace">
    <section className="bag-inventory" aria-label="Itens da mochila">
      <label className="search-field"><MagnifyingGlass size={20} aria-hidden="true" /><span className="sr-only">Buscar item</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="O que você está procurando?" /></label>
      <div className="category-tabs" aria-label="Categorias de itens">{CATEGORIES.map(name => <button key={name} aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}</div>
      <div className="section-line"><h2>Suprimentos</h2><span>{items.length} tipos de item</span></div>
      <div className="item-grid">{items.map(item => <button key={item.id} className="item-tile" aria-label={`${item.name}, quantidade ${item.count}`} aria-pressed={selected.id === item.id} onClick={() => { setSelected(item); detailRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' }) }}>
        <span className="item-quantity">×{item.count}</span><img src={`/assets/item-icons/${item.id}.png`} alt="" width="64" height="64" /><strong>{item.name}</strong>
      </button>)}</div>
      {items.length === 0 && <div className="empty-state"><Backpack size={40} aria-hidden="true" /><h2>Nenhum item encontrado</h2><p>Tente outro nome ou consulte todas as categorias.</p><button className="secondary-button" onClick={() => { setSearch(''); setCategory('Todos') }}>Limpar filtros</button></div>}
      <p className="inventory-note">Um lugar para cada descoberta. Selecione um item para consultar.</p>
    </section>
    <section ref={detailRef} className="item-detail" aria-label={`Detalhes de ${selected.name}`}>
      <span className="eyebrow">NO SEU EQUIPAMENTO</span>
      <div className="item-stage"><img src={`/assets/item-icons/${selected.id}.png`} alt={selected.name} width="96" height="96" /></div>
      <span className="category-chip">{selected.category}</span><h2>{selected.name}</h2><p>{selected.description}</p>
      <div className="item-stock"><span>Na mochila</span><strong>{selected.count}<small> unidades</small></strong></div>
      <PrimaryButton onClick={() => notify('Prévia de interação: nenhum item foi usado ou consumido.')}>Prévia da ação</PrimaryButton>
      <p className="demo-caption">Itens e quantidades demonstrativos.</p>
    </section>
  </div>
}
