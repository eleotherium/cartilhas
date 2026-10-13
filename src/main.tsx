import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AdminApp } from './admin/AdminApp.tsx'

// Roteamento mínimo sem dependência nova (react-router seria demais pra duas
// "páginas"): a autenticação de /admin já é feita na borda pelo Cloudflare
// Access, então aqui só decide qual árvore React montar.
const isAdmin = window.location.pathname.startsWith('/admin')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdmin ? <AdminApp /> : <App />}
  </StrictMode>,
)
