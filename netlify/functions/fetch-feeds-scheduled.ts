/// <reference types="node" />
import type { Config } from '@netlify/functions'

// Netlify Scheduled Function - executa a cada 15 minutos
export default async () => {
  try {
    const baseUrl = 'https://site-noticias-listening.netlify.app'
    const cronSecret = process.env.CRON_SECRET || ''

    console.log('=== INICIANDO PIPELINE DE CRON ===')
    console.log(`Timestamp: ${new Date().toISOString()}`)
    console.log(`Base URL: ${baseUrl}`)
    console.log(`CRON_SECRET presente: ${!!cronSecret}`)

    // 1. Fetch feeds
    console.log('--- Chamando /api/cron/fetch-feeds ---')
    const feedUrl = `${baseUrl}/api/cron/fetch-feeds`
    console.log(`URL: ${feedUrl}`)

    const feedResponse = await fetch(feedUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
    })

    console.log(`Status: ${feedResponse.status}`)
    const feedData = await feedResponse.json() as any
    console.log(`Total inserido: ${feedData.totalInserted || 0}`)
    console.log(`Total matched: ${feedData.totalMatched || 0}`)

    // 2. Detect crises
    console.log('--- Chamando /api/cron/detect-crises ---')
    const crisisUrl = `${baseUrl}/api/cron/detect-crises`
    const crisisResponse = await fetch(crisisUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
    })

    console.log(`Status: ${crisisResponse.status}`)
    const crisisData = (await crisisResponse.json()) as any

    console.log('=== PIPELINE CONCLUÍDO COM SUCESSO ===')

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        feeds: (feedData as any).totalInserted,
        matched: (feedData as any).totalMatched,
        crises: (crisisData as any).success,
      }),
    }
  } catch (error) {
    console.error('=== ERRO NO PIPELINE ===')
    console.error(error)

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    }
  }
}

export const config: Config = {
  schedule: '*/15 * * * *', // A cada 15 minutos
}
