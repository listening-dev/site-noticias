/// <reference types="node" />
import type { Config } from '@netlify/functions'

// Netlify Scheduled Function - executa a cada 15 minutos
export default async () => {
  const baseUrl = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:3000'
  const cronSecret = process.env.CRON_SECRET || ''

  console.log('[Scheduled] ⏰ Iniciando pipeline de cron...')
  console.log(`[Scheduled] Base URL: ${baseUrl}`)

  try {
    // 1. Fetch feeds, process topics, match news
    console.log('[Scheduled] 📰 Chamando /api/cron/fetch-feeds...')
    const feedResponse = await fetch(`${baseUrl}/api/cron/fetch-feeds`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    })

    if (!feedResponse.ok) {
      console.error(`[Scheduled] Erro na resposta fetch-feeds: ${feedResponse.status}`)
      return { statusCode: 500, body: `fetch-feeds failed: ${feedResponse.status}` }
    }

    const feedData = await feedResponse.json()
    console.log(`[Scheduled] ✅ fetch-feeds concluído: ${feedData.totalInserted} notícias inseridas`)

    // 2. Detect crises (após processamento de tópicos)
    console.log('[Scheduled] 🚨 Chamando /api/cron/detect-crises...')
    const crisisResponse = await fetch(`${baseUrl}/api/cron/detect-crises`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    })

    if (!crisisResponse.ok) {
      console.error(`[Scheduled] Erro na resposta detect-crises: ${crisisResponse.status}`)
      return { statusCode: 500, body: `detect-crises failed: ${crisisResponse.status}` }
    }

    const crisisData = await crisisResponse.json()
    console.log(`[Scheduled] ✅ detect-crises concluído: ${crisisData.totalCrises} crises detectadas`)

    console.log('[Scheduled] ✅ Pipeline concluído com sucesso!')
    return { statusCode: 200, body: 'Pipeline executado com sucesso' }
  } catch (error) {
    console.error('[Scheduled] ❌ Erro ao executar pipeline:', error)
    return { statusCode: 500, body: `Erro: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export const config: Config = {
  schedule: '*/15 * * * *', // A cada 15 minutos
}
