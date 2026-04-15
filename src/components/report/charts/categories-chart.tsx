'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Tag } from 'lucide-react'

interface CategoriesChartProps {
  data: { name: string; count: number }[]
}

export function CategoriesChart({ data }: CategoriesChartProps) {
  const sorted = [...data].sort((a, b) => b.count - a.count).slice(0, 10)

  if (sorted.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Tag size={16} className="text-blue-600" />
            Temas mais citados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-400 text-center py-8">Sem dados no período</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Tag size={16} className="text-blue-600" />
          Temas mais citados
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={sorted} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)}
            />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }}
              formatter={(value: any) => [value, 'Notícias']}
              labelFormatter={(label: any) => String(label).charAt(0).toUpperCase() + String(label).slice(1)}
            />
            <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
