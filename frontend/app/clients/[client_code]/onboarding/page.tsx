import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Circle, Clock, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { redirect } from 'next/navigation'

interface OnboardingPageProps {
  params: Promise<{ client_code: string }>
}

interface OnboardingStep {
  id: string
  name: string
  description: string
  status: 'completed' | 'in_progress' | 'pending'
  href?: string
}

async function getClientData(clientCode: string) {
  const supabase = await createClient()

  const { data: client, error } = await supabase
    .from('clients')
    .select(`
      id,
      client_code,
      name,
      status,
      stage,
      approval_status,
      onboarding_form,
      gtm_synthesis,
      created_at,
      updated_at
    `)
    .eq('client_code', clientCode.toUpperCase())
    .single()

  if (error || !client) {
    return null
  }

  // Fetch related data
  const { data: gtmStrategy } = await supabase
    .from('gtm_strategies')
    .select('id, status, synthesis')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  const { data: campaignCells } = await supabase
    .from('campaign_cells')
    .select('id, status')
    .eq('client_id', client.id)

  const { data: domains } = await supabase
    .from('domains')
    .select('id, status')
    .eq('client_id', client.id)

  const { data: inboxes } = await supabase
    .from('email_inboxes')
    .select('id, status')
    .eq('client_id', client.id)

  const { data: sourcingRuns } = await supabase
    .from('sourcing_runs')
    .select('id, status')
    .eq('client_id', client.id)

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, status')
    .eq('client_id', client.id)

  return {
    client,
    gtmStrategy,
    campaignCells: campaignCells || [],
    domains: domains || [],
    inboxes: inboxes || [],
    sourcingRuns: sourcingRuns || [],
    campaigns: campaigns || [],
  }
}

function determineStepStatus(
  stepId: string,
  client: any,
  gtmStrategy: any,
  campaignCells: any[],
  domains: any[],
  inboxes: any[],
  sourcingRuns: any[],
  campaigns: any[]
): 'completed' | 'in_progress' | 'pending' {
  switch (stepId) {
    case 'intake':
      // Check if onboarding_form is filled
      if (client.onboarding_form && Object.keys(client.onboarding_form).length > 0) {
        return 'completed'
      }
      // If client exists, intake is in progress
      return client.status ? 'in_progress' : 'pending'

    case 'research':
      // Check if gtm_strategy exists with research complete
      if (gtmStrategy?.synthesis &&
          (gtmStrategy.synthesis.icp_segments?.length > 0 ||
           gtmStrategy.synthesis.verticals?.length > 0)) {
        return 'completed'
      }
      // If intake is done but no strategy yet
      if (client.onboarding_form && !gtmStrategy) {
        return 'in_progress'
      }
      return 'pending'

    case 'synthesis':
      // Check if gtm_strategy has synthesis
      if (gtmStrategy?.synthesis &&
          gtmStrategy.synthesis.campaign_matrix_seed?.length > 0) {
        return 'completed'
      }
      // If research is done but no synthesis
      if (gtmStrategy?.synthesis?.icp_segments && !gtmStrategy.synthesis?.campaign_matrix_seed) {
        return 'in_progress'
      }
      return 'pending'

    case 'internal_review':
      // Check approval_status
      if (['internal_approved', 'external_sent', 'external_iteration', 'external_approved'].includes(client.approval_status)) {
        return 'completed'
      }
      if (client.approval_status === 'internal_review') {
        return 'in_progress'
      }
      return 'pending'

    case 'external_review':
      // Check if external review is sent or approved
      if (['external_sent', 'external_iteration', 'external_approved'].includes(client.approval_status)) {
        if (client.approval_status === 'external_approved') {
          return 'completed'
        }
        return 'in_progress'
      }
      return 'pending'

    case 'cell_design':
      // Check if campaign_cells exist
      if (campaignCells.length > 0) {
        return 'completed'
      }
      // If external approved but no cells yet
      if (client.approval_status === 'external_approved') {
        return 'in_progress'
      }
      return 'pending'

    case 'messaging':
      // Check if cells have messaging (brief with hooks)
      const cellsWithMessaging = campaignCells.filter(
        cell => cell.brief?.hook_frameworks || cell.brief?.messaging_approved
      ).length
      if (cellsWithMessaging > 0 && campaignCells.length > 0) {
        return 'completed'
      }
      // If cells exist but no messaging
      if (campaignCells.length > 0 && cellsWithMessaging === 0) {
        return 'in_progress'
      }
      return 'pending'

    case 'infrastructure':
      // Check if domains and inboxes are configured
      const activeDomains = domains.filter(d => d.status === 'active' || d.status === 'verified').length
      const activeInboxes = inboxes.filter(i => i.status === 'active' || i.status === 'connected').length
      if (activeDomains > 0 && activeInboxes > 0) {
        return 'completed'
      }
      // If some infrastructure exists
      if (domains.length > 0 || inboxes.length > 0) {
        return 'in_progress'
      }
      return 'pending'

    case 'sourcing':
      // Check sourcing runs
      const completedSourcing = sourcingRuns.filter(s => s.status === 'completed').length
      if (completedSourcing > 0 && sourcingRuns.length > 0) {
        return 'completed'
      }
      // If sourcing is running
      if (sourcingRuns.some(s => s.status === 'running')) {
        return 'in_progress'
      }
      return 'pending'

    case 'launch':
      // Check if campaigns are live
      const liveCampaigns = campaigns.filter(c => c.status === 'active' || c.status === 'running').length
      if (liveCampaigns > 0) {
        return 'completed'
      }
      // If campaigns exist but not live
      if (campaigns.length > 0) {
        return 'in_progress'
      }
      return 'pending'

    default:
      return 'pending'
  }
}

function getOnboardingSteps(
  client: any,
  gtmStrategy: any,
  campaignCells: any[],
  domains: any[],
  inboxes: any[],
  sourcingRuns: any[],
  campaigns: any[]
): OnboardingStep[] {
  const steps = [
    {
      id: 'intake',
      name: 'Intake Form',
      description: 'Client submits onboarding questionnaire',
      href: undefined,
    },
    {
      id: 'research',
      name: 'Research Phase',
      description: 'Exa deep research on ICP, verticals, competitors',
      href: `/clients/${client.client_code}/strategy`,
    },
    {
      id: 'synthesis',
      name: 'Strategy Synthesis',
      description: 'AI generates GTM strategy document',
      href: `/clients/${client.client_code}/strategy`,
    },
    {
      id: 'internal_review',
      name: 'Internal Review',
      description: 'Team reviews and approves strategy',
      href: `/clients/${client.client_code}/strategy`,
    },
    {
      id: 'external_review',
      name: 'Client Review',
      description: 'Client reviews strategy document',
      href: `/clients/${client.client_code}/strategy`,
    },
    {
      id: 'cell_design',
      name: 'Cell Design',
      description: 'Campaign cells created from approved matrix',
      href: `/clients/${client.client_code}/cells`,
    },
    {
      id: 'messaging',
      name: 'Messaging Development',
      description: 'ERIC + HUIDIG messaging per cell',
      href: `/clients/${client.client_code}/cells`,
    },
    {
      id: 'infrastructure',
      name: 'Infrastructure Setup',
      description: 'Domains, inboxes, warm-up configured',
      href: `/clients/${client.client_code}/infrastructure`,
    },
    {
      id: 'sourcing',
      name: 'Lead Sourcing',
      description: 'A-Leads sourcing for approved cells',
      href: `/clients/${client.client_code}/cells`,
    },
    {
      id: 'launch',
      name: 'Campaign Launch',
      description: 'H1 testing begins',
      href: `/clients/${client.client_code}/campaigns`,
    },
  ]

  return steps.map((step, index) => {
    // Determine status based on current step and previous steps
    let status: 'completed' | 'in_progress' | 'pending'

    // First check if this step is explicitly completed
    status = determineStepStatus(
      step.id,
      client,
      gtmStrategy,
      campaignCells,
      domains,
      inboxes,
      sourcingRuns,
      campaigns
    )

    // If current step is pending but previous step is completed, this step is in progress
    if (status === 'pending' && index > 0) {
      const prevStep = steps[index - 1]
      const prevStatus = determineStepStatus(
        prevStep.id,
        client,
        gtmStrategy,
        campaignCells,
        domains,
        inboxes,
        sourcingRuns,
        campaigns
      )
      if (prevStatus === 'completed') {
        status = 'in_progress'
      }
    }

    // First step special case
    if (index === 0 && status === 'pending' && client.status) {
      status = 'in_progress'
    }

    return {
      ...step,
      status,
    }
  })
}

function getCurrentFocusStep(steps: OnboardingStep[]): OnboardingStep | null {
  // Find first in_progress step
  return steps.find(step => step.status === 'in_progress') || null
}

function getOverallStatus(steps: OnboardingStep[]): {
  label: string
  variant: 'default' | 'secondary' | 'destructive' | 'outline'
  className?: string
} {
  const completed = steps.filter(s => s.status === 'completed').length
  const inProgress = steps.filter(s => s.status === 'in_progress').length

  if (completed === steps.length) {
    return { label: 'Completed', variant: 'default', className: 'bg-green-600' }
  }
  if (inProgress > 0) {
    return { label: 'In Progress', variant: 'outline', className: 'text-yellow-600' }
  }
  return { label: 'Not Started', variant: 'secondary' }
}

export default async function OnboardingPage({ params }: OnboardingPageProps) {
  const resolvedParams = await params
  const clientCode = resolvedParams.client_code.toUpperCase()

  const data = await getClientData(clientCode)

  if (!data) {
    redirect('/')
  }

  const { client, gtmStrategy, campaignCells, domains, inboxes, sourcingRuns, campaigns } = data

  const onboardingSteps = getOnboardingSteps(
    client,
    gtmStrategy,
    campaignCells,
    domains,
    inboxes,
    sourcingRuns,
    campaigns
  )

  const currentFocus = getCurrentFocusStep(onboardingSteps)
  const overallStatus = getOverallStatus(onboardingSteps)

  const completedCount = onboardingSteps.filter(s => s.status === 'completed').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Onboarding</h2>
          <p className="text-muted-foreground">
            Track client onboarding progress from intake to launch
          </p>
        </div>
        <Badge variant={overallStatus.variant} className={overallStatus.className}>
          {overallStatus.label}
        </Badge>
      </div>

      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Onboarding Progress</CardTitle>
          <CardDescription>
            {completedCount} of {onboardingSteps.length} steps completed
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {onboardingSteps.map((step, index) => (
              <div
                key={step.id}
                className="flex items-start gap-4 p-4 rounded-lg border"
              >
                <div className="mt-0.5">
                  {step.status === 'completed' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : step.status === 'in_progress' ? (
                    <Clock className="h-5 w-5 text-yellow-600" />
                  ) : (
                    <Circle className="h-5 w-5 text-gray-300" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{step.name}</h4>
                    {step.status === 'in_progress' && (
                      <Badge variant="outline" className="text-yellow-600">
                        In Progress
                      </Badge>
                    )}
                    {step.status === 'completed' && (
                      <Badge variant="outline" className="text-green-600">
                        Completed
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {step.description}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  Step {index + 1}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Current Focus */}
      {currentFocus && (
        <Card>
          <CardHeader>
            <CardTitle>Current Focus</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium">{currentFocus.name}</h4>
                <p className="text-sm text-muted-foreground">
                  {currentFocus.description}
                </p>
              </div>
              {currentFocus.href ? (
                <Button asChild>
                  <Link href={currentFocus.href}>
                    View Details
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Client Status Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Client Status Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-muted-foreground">Lifecycle</p>
              <p className="font-medium capitalize">{client.status || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Stage</p>
              <p className="font-medium capitalize">{client.stage || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Approval</p>
              <p className="font-medium capitalize">{client.approval_status || 'Draft'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
