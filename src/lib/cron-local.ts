/**
 * Cron job local para rodar durante desenvolvimento
 * Executa fetch-feeds e detect-crises a cada 15 minutos
 */

const CRON_SECRET = process.env.CRON_SECRET || 'NoticiasListening2026'
const API_URL = process.env.API_URL || 'http://localhost:3001'

export async function startLocalCron() {
  console.log(`[LocalCron] Iniciando cron local - executando a cada 15 minutos`)
  console.log(`[LocalCron] API URL: ${API_URL}`)

  // Executar imediatamente na inicialização
  await executePipeline()

  // Depois a cada 15 minutos
  setInterval(async () => {
    await executePipeline()
  }, 15 * 60 * 1000) // 15 minutos em ms
}

async function executePipeline() {
  const timestamp = new Date().toISOString()
  console.log(`\n[LocalCron] ⏰ Executando pipeline - ${timestamp}`)

  try {
    // 1. Fetch feeds
    console.log(`[LocalCron] 📰 Chamando /api/cron/fetch-feeds...`)
    const feedRes = await fetch(`${API_URL}/api/cron/fetch-feeds`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    })

    if (!feedRes.ok) {
      console.error(`[LocalCron] ❌ fetch-feeds falhou: ${feedRes.status}`)
      return
    }

    const feedData = await feedRes.json()
    console.log(
      `[LocalCron] ✅ fetch-feeds: ${feedData.totalInserted} notícias, ${feedData.totalMatched} matches`
    )

    // 2. Detect crises
    console.log(`[LocalCron] 🚨 Chamando /api/cron/detect-crises...`)
    const crisisRes = await fetch(`${API_URL}/api/cron/detect-crises`, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    })

    if (!crisisRes.ok) {
      console.error(`[LocalCron] ❌ detect-crises falhou: ${crisisRes.status}`)
      return
    }

    const crisisData = await crisisRes.json()
    console.log(`[LocalCron] ✅ detect-crises: detectadas ${crisisData.clientCrises?.length || 0} crises`)

    console.log(`[LocalCron] ✅ Pipeline concluído com sucesso!\n`)
  } catch (error) {
    console.error(`[LocalCron] ❌ Erro ao executar pipeline:`, error)
  }
}
