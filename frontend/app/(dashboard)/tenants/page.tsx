import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export default function TenantsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tenants</h1>
        <p className="text-slate-500">M365 tenant management</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tenant Provisioning</CardTitle>
          <CardDescription>Coming soon — migrating from dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500">
            This page will show M365 tenant provisioning status.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
