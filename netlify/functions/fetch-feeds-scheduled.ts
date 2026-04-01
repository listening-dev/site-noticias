import type { Config } from '@netlify/functions'

// Netlify Scheduled Function - executa a cada hora
export default async () => {
  const baseUrl = process.env.URL || process.env.DEPLOY_URL || 'http://localhost:3000'
  const cronSecret = process.env.CRON_SECRET || ''

  try {
    const response = await fetch(`${baseUrl}/api/cron/fetch-feeds`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
      },
    })

    const data = await response.json()
    console.log('[Scheduled] Resultado:', JSON.stringify(data, null, 2))
  } catch (error) {
    console.error('[Scheduled] Erro ao chamar endpoint:', error)
  }
}

export const config: Config = {
  schedule: '0 * * * *', // Toda hora no minuto 0
}
