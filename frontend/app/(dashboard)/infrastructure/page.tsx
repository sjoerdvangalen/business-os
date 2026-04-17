import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default function InfrastructurePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Infrastructure</h1>
        <p className="text-slate-500">Email infrastructure overview</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Email Infrastructure</CardTitle>
          <CardDescription>Coming soon — migrating from dashboard-tremor</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            This page will show domains and email inboxes.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
