// Monta a trilha de estagios (PH-431) fora do jogo, com progresso simulado.
//
// Ver o cabecalho do .html ao lado pro que esta bancada responde e o que ela
// nao responde. Em resumo: ela existe pra a decisao VISUAL — se dez nos ligados
// por um trilho leem como trilha, se os estados se distinguem de relance, se a
// composicao de sub-bioma conta que o bioma afunda — sem precisar de login,
// inicial escolhido e sessao aberta.
import { createRoot } from 'react-dom/client'
import { useState } from 'react'

import '@/index.css'
import { BIOMAS } from '@/data/biomas'
import { ESTAGIOS_POR_BIOMA } from '@/data/estagios'
import { progressoPorBiomaDefault, type ProgressoPorBioma } from '@/data/progressoDeBioma'
import { MapaDeBiomas, TrilhaDoBioma } from '@/features/hunt/TrilhaDeEstagios'

function progressoSimulado(nivel: number): ProgressoPorBioma {
  const base = progressoPorBiomaDefault()
  if (nivel === 0) return base
  // O caso do meio e o interessante: um bioma adiantado e os outros parados, que
  // e exatamente o que o redesenho permite (progresso independente por bioma) e
  // o que a tela de 12 precisa conseguir mostrar de uma vez.
  if (nivel === 3) return { ...base, marinho: 3, mata: 1 }
  return Object.fromEntries(BIOMAS.map((b) => [b.chave, Math.min(nivel, ESTAGIOS_POR_BIOMA)]))
}

/** PH-523: prefixa `nightmare_<bioma>` pra simular progresso do Pesadelo, independente do Mundo. */
function progressoDoPesadelo(nivel: number): ProgressoPorBioma {
  const p = progressoSimulado(nivel)
  return Object.fromEntries(
    Object.entries(p).map(([chave, valor]) => [`nightmare_${chave}`, valor]),
  )
}

function Bancada() {
  const [nivel, setNivel] = useState(3)
  const [pesadelo, setPesadelo] = useState(false)
  const [bioma, setBioma] = useState<string | null>(
    new URLSearchParams(location.search).get('bioma'),
  )
  const [aberto, setAberto] = useState<string | null>(null)
  const progresso = { ...progressoSimulado(nivel), ...progressoDoPesadelo(nivel) }

  // Os botoes da barra vivem no HTML (fora do React) pra a bancada abrir com
  // estilo mesmo se o bundle demorar; aqui so ligamos o clique.
  document.querySelectorAll<HTMLButtonElement>('#barra button[data-p]').forEach((b) => {
    const p = Number(b.dataset.p)
    b.dataset.on = p === nivel ? '1' : '0'
    b.onclick = () => setNivel(p)
  })
  const btnPesadelo = document.getElementById('btn-pesadelo')
  if (btnPesadelo) {
    btnPesadelo.textContent = `Pesadelo: ${pesadelo ? 'on' : 'off'}`
    btnPesadelo.onclick = () => setPesadelo((v) => !v)
  }
  const onde = document.getElementById('onde')
  if (onde) onde.textContent = bioma ? `— trilha de ${bioma}` : '— os 12 biomas'

  if (bioma) {
    return (
      <TrilhaDoBioma
        biomaChave={bioma}
        progresso={progresso}
        pesadelo={pesadelo}
        mapaAtivoId={null}
        abertoId={aberto}
        entrandoId={null}
        onAbrir={setAberto}
        onEntrar={(mapId) => console.log('[bancada] entraria em', mapId)}
        onVoltar={() => { setBioma(null); setAberto(null) }}
      />
    )
  }
  return <MapaDeBiomas progresso={progresso} onEscolher={setBioma} pesadelo={pesadelo} />
}

createRoot(document.getElementById('palco')!).render(<Bancada />)
