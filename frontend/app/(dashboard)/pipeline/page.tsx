import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export const dynamic = 'force-dynamic'

interface PipelineClient {
  id: string
  client_code: string
  name: string
  status: string
  stage: string | null
  approval_status: string | null
  workflow_metrics: Record<string, unknown> | null
  last_intake_at: string | null
}

function stageColor(stage: string | null): string {
  switch (stage) {
    case 'intake': return 'bg-slate-100 text-slate-700'
    case 'internal_approval': return 'bg-blue-100 text-blue-700'
    case 'external_approval': return 'bg-purple-100 text-purple-700'
    case 'messaging_approval': return 'bg-yellow-100 text-yellow-700'
    case 'data_sourcing': return 'bg-orange-100 text-orange-700'
    case 'h1': return 'bg-emerald-100 text-emerald-700'
    case 'f1': return 'bg-emerald-200 text-emerald-800'
    case 'cta1': return 'bg-green-100 text-green-700'
    case 'scaling': return 'bg-green-200 text-green-800'
    default: return 'bg-slate-100 text-slate-500'
  }
}

function approvalBadgeVariant(as: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (!as) return 'outline'
  if (as.includes('approved')) return 'secondary'
  if (as.includes('rejected') || as.includes('iteration')) return 'destructive'
  if (as === 'external_sent' || as === 'internal_review') return 'default'
  return 'outline'
}

function infraStatus(wm: Record<string, unknown> | null): string {
  if (!wm) return '-'
  const infra = wm.infra as Record<string, unknown> | undefined
  return (infra?.status as string) || '-'
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: '2-digit' })
}

export default async function PipelinePage() {
  const supabase = await createClient()

  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, client_code, name, status, stage, approval_status, workflow_metrics, last_intake_at')
    .neq('status', 'churned')
    .order('last_intake_at', { ascending: false })

  if (error) {
    console.error('Error fetching pipeline clients:', error)
  }

  const rows: PipelineClient[] = clients || []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <p className="text-slate-500">GTM onboarding status per client</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clients ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Naam</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Approval</th>
                  <th className="px-4 py-3">Infra</th>
                  <th className="px-4 py-3">Intake</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((client) => (
                  <tr key={client.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs font-medium">
                      {client.client_code}
                    </td>
                    <td className="px-4 py-3 font-medium">{client.name}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-500">{client.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {client.stage ? (
                        <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${stageColor(client.stage)}`}>
                          {client.stage.replace(/_/g, ' ')}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {client.approval_status ? (
                        <Badge variant={approvalBadgeVariant(client.approval_status)} className="text-xs">
                          {client.approval_status.replace(/_/g, ' ')}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${infraStatus(client.workflow_metrics) === 'ready' ? 'text-emerald-600 font-medium' : 'text-slate-500'}`}>
                        {infraStatus(client.workflow_metrics)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {formatDate(client.last_intake_at)}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                      Geen actieve clients gevonden
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
