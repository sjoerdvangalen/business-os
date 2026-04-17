'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Server, Globe, Mail, Shield, CheckCircle2, AlertCircle, XCircle } from 'lucide-react'

interface InfrastructurePageProps {
  params: { client_code: string }
}

export default function InfrastructurePage({ params }: InfrastructurePageProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Infrastructure</h2>
          <p className="text-muted-foreground">
            Domains, email accounts, and sending health
          </p>
        </div>
        <Badge variant="outline" className="text-yellow-600">
          <AlertCircle className="mr-1 h-3 w-3" />
          Setup Required
        </Badge>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Domains</CardDescription>
            <CardTitle className="text-2xl">0</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Email Accounts</CardDescription>
            <CardTitle className="text-2xl">0</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Warmup Score</CardDescription>
            <CardTitle className="text-2xl">—</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Health Status</CardDescription>
            <CardTitle className="text-xl">Unknown</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Domains */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Domains
            </CardTitle>
            <CardDescription>
              Sending domains and DNS status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Globe className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No domains configured</p>
              <p className="text-sm mt-2">
                Domains will appear here after setup
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Email Accounts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Accounts
            </CardTitle>
            <CardDescription>
              Inboxes and warmup status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No email accounts</p>
              <p className="text-sm mt-2">
                Accounts will appear here after provisioning
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DNS Health */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            DNS Health
          </CardTitle>
          <CardDescription>
            SPF, DKIM, DMARC configuration status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="mx-auto h-12 w-12 mb-4 opacity-50" />
            <p>No DNS records to check</p>
            <p className="text-sm mt-2">
              DNS health will be monitored after domain setup
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
