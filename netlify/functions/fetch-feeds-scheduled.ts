import type { Config } from '@netlify/functions'

// Netlify Scheduled Function - executa a cada hora
export default async () => {
  const baseUrl = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:3000'
  const cronSecret = process.env.CRON_SECRET || ''

  try {
    // 1. Fetch feeds, process topics, match news
    console.log('[Scheduled] Iniciando coleta de feeds e processamento...')
    const feedResponse = await fetch(`${baseUrl}/api/cron/fetch-feeds`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    })

    const feedData = await feedResponse.json()
    console.log('[Scheduled] Resultado fetch-feeds:', JSON.stringify(feedData, null, 2))

    // 2. Detect crises (após processamento de tópicos)
    console.log('[Scheduled] Iniciando detecção de crises...')
    const crisisResponse = await fetch(`${baseUrl}/api/cron/detect-crises`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    })

    const crisisData = await crisisResponse.json()
    console.log('[Scheduled] Resultado detect-crises:', JSON.stringify(crisisData, null, 2))
  } catch (error) {
    console.error('[Scheduled] Erro ao executar pipeline de cron:', error)
  }
}

// Schedule configurado no netlify.toml (*/15 * * * * - a cada 15 minutos)
export const config: Config = {}
