import { Sparkles, Globe, Zap } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import {
  getTopGlobalThemes,
  getGlobalCrises,
  getCampaignRecommendations,
  getStrategistKPIs,
} from '@/services/strategist-insights'

export default async function EstrategistPage() {
  const supabase = await createClient()

  const [kpis, topThemes, globalCrises, recommendations] = await Promise.all([
    getStrategistKPIs(supabase),
    getTopGlobalThemes(supabase, 10, 7),
    getGlobalCrises(supabase, 5),
    getCampaignRecommendations(supabase, 5),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Insights Globais</h1>
        <p className="text-gray-600 mt-1">
          Tendências, recomendações e análises consolidadas de toda a mídia
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard
          icon={<Globe className="h-5 w-5" />}
          label="Temas Únicos"
          value={String(kpis.total_unique_themes)}
        />
        <KPICard
          icon={<Zap className="h-5 w-5 text-orange-600" />}
          label="Crises Globais"
          value={String(kpis.global_crises)}
          color="orange"
        />
        <KPICard
          icon={<Sparkles className="h-5 w-5 text-purple-600" />}
          label="Recomendações"
          value={String(recommendations.length)}
          color="purple"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Top Temas Globais</CardTitle>
          <CardDescription>Temas mais mencionados na mídia (últimos 7 dias)</CardDescription>
        </CardHeader>
        <CardContent>
          {topThemes.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-8 text-center">
              <p className="text-gray-500">Sem temas registrados</p>
            </div>
          ) : (
            <div className="space-y-3">
              {topThemes.map((theme, idx) => (
                <div key={theme.theme_id} className="flex items-center justify-between border border-gray-200 rounded-lg p-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-gray-400 w-8">#{idx + 1}</span>
                      <div>
                        <p className="font-semibold text-gray-900">{theme.theme_name}</p>
                        <p className="text-sm text-gray-600">
                          {theme.mention_count} {theme.mention_count === 1 ? 'menção' : 'menções'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {theme.recent_spike && (
                      <Badge className="bg-amber-100 text-amber-800">↑ Alta recente</Badge>
                    )}
                    {theme.trending && (
                      <Badge className="bg-red-100 text-red-800">Trending 🔥</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Crises Globais</CardTitle>
          <CardDescription>Temas em crise na mídia</CardDescription>
        </CardHeader>
        <CardContent>
          {globalCrises.length === 0 ? (
            <div className="bg-green-50 rounded-lg p-8 text-center">
              <p className="text-green-700 font-medium">✓ Nenhuma crise global detectada</p>
            </div>
          ) : (
            <div className="space-y-3">
              {globalCrises.map((crisis, idx) => (
                <div
                  key={idx}
                  className={`border rounded-lg p-3 ${
                    crisis.severity === 'critical'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-orange-50 border-orange-200'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Zap
                      className={`h-4 w-4 ${
                        crisis.severity === 'critical' ? 'text-red-600' : 'text-orange-600'
                      }`}
                    />
                    <span className="font-semibold text-sm text-gray-900">
                      {crisis.theme_name}
                    </span>
                    <Badge
                      className={
                        crisis.severity === 'critical'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-orange-100 text-orange-800'
                      }
                    >
                      {crisis.severity}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      {crisis.client_count} cliente{crisis.client_count !== 1 ? 's' : ''} afetado{crisis.client_count !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Oportunidades de Campanha</CardTitle>
          <CardDescription>Temas com maior crescimento de volume (7 dias vs. 7 anteriores)</CardDescription>
        </CardHeader>
        <CardContent>
          {recommendations.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-8 text-center">
              <p className="text-gray-500">Sem recomendações no momento</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recommendations.map((rec, idx) => (
                <div key={idx} className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-900">{rec.theme}</p>
                      <p className="text-sm text-gray-700 mt-1">{rec.reason}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-600">
                        {rec.opportunity_score}
                      </p>
                      <p className="text-xs text-gray-600">Menções (7d)</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function KPICard({
  icon,
  label,
  value,
  color = 'blue',
}: {
  icon: React.ReactNode
  label: string
  value: string
  color?: string
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700',
    orange: 'bg-orange-50 text-orange-700',
    purple: 'bg-purple-50 text-purple-700',
    cyan: 'bg-cyan-50 text-cyan-700',
    green: 'bg-green-50 text-green-700',
  }

  return (
    <Card className={colorClasses[color as keyof typeof colorClasses]}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium opacity-75">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
          <div className="text-2xl opacity-50">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}
