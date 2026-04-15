import { SearchResult } from './advanced-search'

/**
 * Gera CSV a partir de resultados de busca
 */
export function generateCSV(results: SearchResult[], filename = 'relatorio.csv'): void {
  const headers = [
    'Título',
    'Descrição',
    'Fonte',
    'URL',
    'Data Publicação',
    'Categoria',
    'Sentimento',
    'Tópicos Principais',
    'Entidades',
  ]

  const rows = results.map((r) => [
    `"${r.title.replace(/"/g, '""')}"`,
    `"${(r.description || '').replace(/"/g, '""')}"`,
    `"${r.sources?.name || ''}"`,
    `"${r.url}"`,
    r.published_at ? new Date(r.published_at).toLocaleDateString('pt-BR') : '',
    r.category || '',
    r.news_topics?.sentiment || 'N/A',
    r.news_topics?.topics
      ? `"${r.news_topics.topics
          .map((t) => `${t.name} (${(t.confidence * 100).toFixed(0)}%)`)
          .join('; ')
          .replace(/"/g, '""')}"`
      : '',
    r.news_topics?.entities
      ? `"${r.news_topics.entities
          .map((e) => `${e.name} (${e.type})`)
          .join('; ')
          .replace(/"/g, '""')}"`
      : '',
  ])

  // Criar conteúdo CSV
  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.join(',')),
  ].join('\n')

  // Fazer download
  downloadFile(csvContent, filename, 'text/csv;charset=utf-8;')
}

/**
 * Gera JSON estruturado para exportação
 */
export function generateJSON(results: SearchResult[], filename = 'relatorio.json'): void {
  const data = {
    metadata: {
      exportDate: new Date().toISOString(),
      totalResults: results.length,
    },
    results: results.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      url: r.url,
      source: r.sources?.name,
      publishedAt: r.published_at,
      category: r.category,
      topics: r.news_topics?.topics || [],
      entities: r.news_topics?.entities || [],
      sentiment: r.news_topics?.sentiment,
    })),
  }

  const jsonContent = JSON.stringify(data, null, 2)
  downloadFile(jsonContent, filename, 'application/json;charset=utf-8;')
}

/**
 * Gera HTML estilizado para visualização/impressão
 */
export function generateHTML(
  results: SearchResult[],
  title = 'Relatório de Análise de Notícias'
): string {
  const date = new Date().toLocaleDateString('pt-BR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #1f2937;
      line-height: 1.6;
      background: #f9fafb;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
      background: white;
    }

    header {
      border-bottom: 3px solid #3b82f6;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }

    h1 {
      font-size: 28px;
      color: #1f2937;
      margin-bottom: 10px;
    }

    .metadata {
      display: flex;
      gap: 20px;
      font-size: 14px;
      color: #6b7280;
      flex-wrap: wrap;
    }

    .result {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      page-break-inside: avoid;
    }

    .result:hover {
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    }

    .result h3 {
      font-size: 18px;
      color: #1f2937;
      margin-bottom: 8px;
      word-break: break-word;
    }

    .result a {
      color: #3b82f6;
      text-decoration: none;
    }

    .result a:hover {
      text-decoration: underline;
    }

    .description {
      color: #6b7280;
      font-size: 14px;
      margin-bottom: 12px;
      line-height: 1.5;
    }

    .meta-info {
      display: flex;
      gap: 16px;
      font-size: 13px;
      color: #6b7280;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }

    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }

    .badge-source {
      background: #f3f4f6;
      color: #374151;
    }

    .badge-category {
      background: #dbeafe;
      color: #1e40af;
    }

    .sentiment-positive {
      background: #dcfce7;
      color: #166534;
    }

    .sentiment-neutral {
      background: #f3f4f6;
      color: #374151;
    }

    .sentiment-negative {
      background: #fee2e2;
      color: #991b1b;
    }

    .topics {
      margin-top: 12px;
    }

    .topics-label {
      font-weight: 600;
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 6px;
    }

    .topic-tag {
      display: inline-block;
      background: #eff6ff;
      color: #0c4a6e;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      margin-right: 6px;
      margin-bottom: 6px;
    }

    @media print {
      body {
        background: white;
      }
      .container {
        padding: 0;
        max-width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${title}</h1>
      <div class="metadata">
        <span><strong>${results.length}</strong> notícias encontradas</span>
        <span>Gerado em ${date}</span>
      </div>
    </header>

    <main>
      ${results
        .map(
          (r) => `
        <div class="result">
          <h3><a href="${r.url}" target="_blank">${escapeHtml(r.title)}</a></h3>

          ${
            r.description
              ? `<p class="description">${escapeHtml(r.description)}</p>`
              : ''
          }

          <div class="meta-info">
            ${
              r.sources?.name
                ? `<span class="badge badge-source">${escapeHtml(r.sources.name)}</span>`
                : ''
            }
            ${
              r.category
                ? `<span class="badge badge-category">${escapeHtml(r.category)}</span>`
                : ''
            }
            ${
              r.news_topics?.sentiment
                ? `<span class="badge sentiment-${r.news_topics.sentiment}">
                    ${
                      r.news_topics.sentiment === 'positive'
                        ? '😊 Positivo'
                        : r.news_topics.sentiment === 'negative'
                          ? '😞 Negativo'
                          : '😐 Neutro'
                    }
                  </span>`
                : ''
            }
            ${
              r.published_at
                ? `<span>${new Date(r.published_at).toLocaleDateString('pt-BR')}</span>`
                : ''
            }
          </div>

          ${
            r.news_topics?.topics && r.news_topics.topics.length > 0
              ? `
            <div class="topics">
              <div class="topics-label">Tópicos principais:</div>
              ${r.news_topics.topics
                .slice(0, 5)
                .map(
                  (t) =>
                    `<span class="topic-tag">${escapeHtml(t.name)} (${(t.confidence * 100).toFixed(0)}%)</span>`
                )
                .join('')}
            </div>
          `
              : ''
          }
        </div>
      `
        )
        .join('')}
    </main>
  </div>
</body>
</html>
  `

  return html
}

/**
 * Faz download de arquivo
 */
function downloadFile(
  content: string,
  filename: string,
  type: string
): void {
  const blob = new Blob([content], { type })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

/**
 * Escapa caracteres HTML para segurança
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * Gera nome de arquivo com timestamp
 */
export function generateFilename(format: 'csv' | 'json' | 'html'): string {
  const date = new Date().toISOString().split('T')[0]
  const time = new Date().toTimeString().split(' ')[0].replace(/:/g, '-')
  return `relatorio-${date}-${time}.${format}`
}
