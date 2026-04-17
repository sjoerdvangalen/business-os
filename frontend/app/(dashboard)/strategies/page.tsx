import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default function StrategiesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">GTM Strategies</h1>
        <p className="text-slate-500">View and manage client strategies</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Strategies</CardTitle>
          <CardDescription>Coming soon — migrating from dashboard-tremor</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            This page will show gtm_strategies with status and campaign cells.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
