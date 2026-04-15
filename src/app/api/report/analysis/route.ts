import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(request: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { from, to, totalNews, sourceStats, categoryStats, topTitles, clientName } = body

  if (!totalNews || totalNews === 0) {
    return NextResponse.json({ error: 'Sem dados para analisar no período selecionado' }, { status: 400 })
  }

  const fromDate = new Date(from).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const toDate = new Date(to).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const clientContext = clientName
    ? `\n**Contexto:** Esta análise é filtrada para o cliente "${clientName}". As notícias abaixo são aquelas que foram capturadas pelos filtros de monitoramento deste cliente.`
    : ''

  const prompt = `Analise os seguintes dados de monitoramento de mídia do período de ${fromDate} a ${toDate}.${clientContext}

**Resumo quantitativo:**
- Total de notícias: ${totalNews}
- Portais monitorados com publicações: ${(sourceStats ?? []).length}
- Categorias identificadas: ${(categoryStats ?? []).length}

**Top portais por volume de publicações:**
${(sourceStats ?? []).slice(0, 10).map((s: any, i: number) => `${i + 1}. ${s.name}: ${s.count} notícias`).join('\n')}

**Distribuição por categoria/tema:**
${(categoryStats ?? []).slice(0, 10).map((c: any, i: number) => `${i + 1}. ${c.name}: ${c.count} notícias`).join('\n')}

**Títulos das principais notícias recentes:**
${(topTitles ?? []).slice(0, 20).map((t: any, i: number) => `${i + 1}. [${t.source}] ${t.title}`).join('\n')}

Com base EXCLUSIVAMENTE nos dados acima, elabore uma análise de 3-4 parágrafos cobrindo:
1. Visão geral do volume e distribuição da cobertura no período
2. Principais temas e tendências observados nos títulos das notícias
3. Quais portais concentraram maior cobertura e o que isso pode indicar
4. Pontos de atenção para o monitoramento de mídia`

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content: `Você é um analista de social listening sênior, especialista em monitoramento de mídia brasileira.

REGRAS OBRIGATÓRIAS:
- Baseie-se EXCLUSIVAMENTE nos dados fornecidos pelo usuário
- NÃO invente, suponha ou extrapole informações que não estejam nos dados
- NÃO cite fontes, notícias ou números que não foram fornecidos
- Se não houver dados suficientes para uma conclusão, diga isso explicitamente
- Use linguagem profissional e analítica em português do Brasil
- Seja objetivo e direto, evitando generalidades vazias`,
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 1000,
    })

    const analysis = completion.choices[0]?.message?.content ?? 'Não foi possível gerar a análise.'

    return NextResponse.json({ analysis })
  } catch (error) {
    console.error('[Report Analysis] Erro:', error)
    return NextResponse.json({ error: 'Erro ao gerar análise com IA. Verifique a configuração da API key.' }, { status: 500 })
  }
}
