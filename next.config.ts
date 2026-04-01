import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Necessário para o @netlify/plugin-nextjs
  output: 'standalone',

  // Permitir imagens de domínios externos (portais de notícias)
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
}

export default nextConfig
