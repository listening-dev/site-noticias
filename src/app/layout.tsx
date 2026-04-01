import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Central de Notícias Inteligente',
  description: 'Agregação, filtragem e personalização de notícias por cliente',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className="h-full antialiased">{children}</body>
    </html>
  )
}
