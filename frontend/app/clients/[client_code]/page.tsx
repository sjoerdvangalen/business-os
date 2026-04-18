import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Building2,
  TrendingUp,
  Mail,
  Calendar,
  Target,
  ArrowRight,
  Activity,
  Clock,
  Database,
  RefreshCw,
} from 'lucide-react'
import {
  getClientByCode,
  getClientStats,
  getRecentActivity,
  formatDuration,
  formatDate,
  getStatusBadgeVariant,
  getStageBadgeVariant,
} from './data'

interface ClientOverviewPageProps {
  params: Promise<{ client_code: string }>
}

export default async function ClientOverviewPage({ params }: ClientOverviewPageProps) {
  const { client_code } = await params

  // Fetch client data
  const client = await getClientByCode(client_code)
  if (!client) {
    notFound()
  }

  // Fetch stats in parallel
  const [stats, recentActivity] = await Promise.all([
    getClientStats(client.id),
    getRecentActivity(client.id, 5),
  ])

  // Format reply rate for display
  const replyRateFormatted = stats.avg_reply_rate
    ? `${stats.avg_reply_rate.toFixed(1)}%`
    : '—'

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Campaigns</CardDescription>
            <CardTitle className="text-2xl">{stats.campaigns_count}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Leads</CardDescription>
            <CardTitle className="text-2xl">{stats.active_leads_count}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Meetings Booked</CardDescription>
            <CardTitle className="text-2xl">{stats.meetings_this_month}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">This month</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Reply Rate</CardDescription>
            <CardTitle className="text-2xl">{replyRateFormatted}</CardTitle>
            {stats.avg_reply_rate && (
              <p className="text-xs text-muted-foreground mt-1">
                Across all campaigns
              </p>
            )}
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Client Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Client Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Lifecycle</span>
              <Badge variant={getStatusBadgeVariant(client.status)}>
                {client.status}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Stage</span>
              <Badge variant={getStageBadgeVariant(client.stage)}>
                {client.stage}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Approval</span>
              <Badge variant={getStatusBadgeVariant(client.approval_status)}>
                {client.approval_status}
              </Badge>
            </div>
            {client.name && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Company</span>
                <span className="text-sm font-medium">{client.name}</span>
              </div>
            )}
            {client.domain && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Domain</span>
                <span className="text-sm font-medium">{client.domain}</span>
              </div>
            )}
            <Button variant="outline" className="w-full" asChild>
              <Link href={`/clients/${client_code}/projects`}>
                View Projects
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Quick Actions Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href={`/clients/${client_code}/strategy`}>
                <TrendingUp className="mr-2 h-4 w-4" />
                Review Strategy
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href={`/clients/${client_code}/cells`}>
                <Target className="mr-2 h-4 w-4" />
                Manage Cells
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href={`/clients/${client_code}/campaigns`}>
                <Mail className="mr-2 h-4 w-4" />
                View Campaigns
                {stats.campaigns_count > 0 && (
                  <Badge variant="secondary" className="ml-auto">
                    {stats.campaigns_count}
                  </Badge>
                )}
              </Link>
            </Button>
            <Button variant="outline" className="w-full justify-start" asChild>
              <Link href={`/clients/${client_code}/infrastructure`}>
                <Building2 className="mr-2 h-4 w-4" />
                Check Infrastructure
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
          <CardDescription>Latest system activity</CardDescription>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No recent activity</p>
              <p className="text-sm mt-2">
                Activity will appear here as the client progresses
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-muted rounded">
                      {activity.source.includes('sync') ? (
                        <RefreshCw className="h-4 w-4" />
                      ) : activity.table_name === 'campaigns' ? (
                        <Mail className="h-4 w-4" />
                      ) : activity.table_name === 'contacts' ? (
                        <Database className="h-4 w-4" />
                      ) : (
                        <Activity className="h-4 w-4" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {activity.operation} {activity.table_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        via {activity.source}
                        {activity.records_processed > 0 &&
                          ` • ${activity.records_processed} records`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">
                      {formatDate(activity.started_at)}
                    </p>
                    {activity.duration_ms && (
                      <p className="text-xs text-muted-foreground">
                        <Clock className="inline h-3 w-3 mr-1" />
                        {formatDuration(activity.duration_ms)}
                      </p>
                    )}
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
