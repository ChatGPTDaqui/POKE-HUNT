// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { getItem, SHOP_STOCK } from '@/data/items'
import { useUiStore } from '@/stores/uiStore'
import { ItemCompraCard } from './ItemCompraCard'

afterEach(cleanup)

it('abre a ficha pela identidade compacta sem executar compra', () => {
  useUiStore.setState({ viewportWidth: 390, viewportHeight: 844, coarsePointer: true })
  const item = getItem(SHOP_STOCK[0].itemId)
  if (!item || !('buyPrice' in item)) throw new Error('Fixture de item comprável ausente')
  const onAbrir = vi.fn(), onComprar = vi.fn(), onExecutarAtalho = vi.fn()
  render(<ItemCompraCard item={item} owned={12345} gold={99999} qty={1} ocupado={false}
    isPending={false} onQtyChange={vi.fn()} onComprar={onComprar}
    onExecutarAtalho={onExecutarAtalho} onAbrir={onAbrir} />)
  expect(screen.getByText('Na mochila: 12.345')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: `Comprar ${item.name}`, exact: true }))
  expect(onAbrir).toHaveBeenCalledTimes(1)
  expect(onComprar).not.toHaveBeenCalled()
  expect(onExecutarAtalho).not.toHaveBeenCalled()
})
