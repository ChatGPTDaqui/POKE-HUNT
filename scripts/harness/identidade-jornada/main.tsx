import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/fredoka'
import '@fontsource-variable/manrope'
import { App } from './App'
import './styles.css'

// Entrada isolada: não inicializa o jogo, autenticação, stores ou clientes de rede.
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
