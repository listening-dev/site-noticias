'use client'

import { useState } from 'react'
import { Download, FileJson, FileText, File } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SearchResult } from '@/services/advanced-search'
import { generateCSV, generateJSON, generateHTML, generateFilename } from '@/services/report-generator'

interface ExportMenuProps {
  results: SearchResult[]
  disabled?: boolean
}

export function ExportMenu({ results, disabled = false }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleExportCSV = () => {
    generateCSV(results, generateFilename('csv'))
    setIsOpen(false)
  }

  const handleExportJSON = () => {
    generateJSON(results, generateFilename('json'))
    setIsOpen(false)
  }

  const handleExportHTML = () => {
    const html = generateHTML(results)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = generateFilename('html')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
    setIsOpen(false)
  }

  const hasResults = results.length > 0

  return (
    <div className="relative">
      <Button
        disabled={disabled || !hasResults}
        className="gap-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Download className="h-4 w-4" />
        Exportar ({results.length})
      </Button>

      {isOpen && hasResults && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-10">
          <div className="p-2">
            <button
              onClick={handleExportCSV}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 rounded-md text-sm text-left text-gray-700 transition-colors"
            >
              <FileText className="h-4 w-4 text-blue-600" />
              <div>
                <div className="font-medium">Exportar CSV</div>
                <div className="text-xs text-gray-500">Planilha (Excel, Sheets)</div>
              </div>
            </button>

            <button
              onClick={handleExportJSON}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 rounded-md text-sm text-left text-gray-700 transition-colors"
            >
              <FileJson className="h-4 w-4 text-purple-600" />
              <div>
                <div className="font-medium">Exportar JSON</div>
                <div className="text-xs text-gray-500">Dados estruturados</div>
              </div>
            </button>

            <button
              onClick={handleExportHTML}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 rounded-md text-sm text-left text-gray-700 transition-colors"
            >
              <File className="h-4 w-4 text-red-600" />
              <div>
                <div className="font-medium">Exportar HTML</div>
                <div className="text-xs text-gray-500">Relatório visual (imprimível)</div>
              </div>
            </button>
          </div>

          <div className="border-t border-gray-100 px-4 py-2">
            <p className="text-xs text-gray-500">
              {results.length} notícias serão exportadas
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
