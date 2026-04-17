import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default function CampaignsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <p className="text-slate-500">Manage your email campaigns</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Campaigns</CardTitle>
          <CardDescription>Coming soon — migrating from dashboard-tremor</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            This page will show all campaigns with filtering by client, status, and health.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
