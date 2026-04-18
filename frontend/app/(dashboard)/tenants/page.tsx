import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const dynamic = 'force-dynamic'

interface Tenant {
  id: string
  name: string
  domain: string
  status: string
  provisioned_at: string | null
  last_sync: string | null
}

const mockTenants: Tenant[] = [
  { id: '1', name: 'PESC M365', domain: 'pescheck.mail', status: 'active', provisioned_at: '2024-01-15T10:00:00Z', last_sync: '2024-04-17T08:00:00Z' },
  { id: '2', name: 'FRTC M365', domain: 'frtc.mail', status: 'active', provisioned_at: '2024-02-01T10:00:00Z', last_sync: '2024-04-17T08:00:00Z' },
]

function statusBadge(status: string) {
  switch (status) {
    case 'active': return <Badge className="bg-emerald-500">Active</Badge>
    case 'provisioning': return <Badge variant="secondary">Provisioning</Badge>
    case 'error': return <Badge variant="destructive">Error</Badge>
    default: return <Badge variant="outline">{status}</Badge>
  }
}

export default async function TenantsPage() {
  const tenants = mockTenants

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tenants</h1>
        <p className="text-slate-500">M365 tenant management</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{tenants.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">{tenants.filter(t => t.status === 'active').length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tenant Provisioning</CardTitle>
          <CardDescription>M365 tenant provisioning status</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Provisioned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map(tenant => (
                <TableRow key={tenant.id}>
                  <TableCell className="font-medium">{tenant.name}</TableCell>
                  <TableCell>{tenant.domain}</TableCell>
                  <TableCell>{statusBadge(tenant.status)}</TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {tenant.provisioned_at ? new Date(tenant.provisioned_at).toLocaleDateString('nl-NL') : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {tenants.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-slate-500">No tenants found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
