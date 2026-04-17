import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default function AlertsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Alerts</h1>
        <p className="text-slate-500">System alerts and notifications</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>System Alerts</CardTitle>
          <CardDescription>Coming soon — migrating from dashboard-tremor</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            This page will show alerts from agent_memory and sync_log.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
