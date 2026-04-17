'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

// Mock data for Companies
const mockCompanies = [
  { id: 1, name: 'Acme B.V.', industry: 'Software', employees: 45, website: 'acme.nl', status: 'Active', lastContact: '2026-04-10' },
  { id: 2, name: 'TechStart B.V.', industry: 'IT Services', employees: 12, website: 'techstart.nl', status: 'Prospect', lastContact: '2026-04-08' },
  { id: 3, name: 'GroeiGroep', industry: 'Consulting', employees: 89, website: 'groei.nl', status: 'Active', lastContact: '2026-04-05' },
  { id: 4, name: 'DataDriven', industry: 'Analytics', employees: 23, website: 'datadriven.io', status: 'Cold', lastContact: '2026-03-28' },
  { id: 5, name: 'CloudNine', industry: 'Cloud', employees: 156, website: 'cloudnine.tech', status: 'Active', lastContact: '2026-04-11' },
  { id: 6, name: 'SecureFirst', industry: 'Security', employees: 34, website: 'securefirst.eu', status: 'Prospect', lastContact: '2026-04-01' },
]

// Mock data for Opportunities (Kanban)
const mockOpportunities = {
  lead: [
    { id: 1, title: 'Acme - Software Audit', value: 15000, company: 'Acme B.V.', contact: 'Jan de Vries' },
    { id: 2, title: 'TechStart - Consulting', value: 8500, company: 'TechStart B.V.', contact: 'Maria Jansen' },
  ],
  qualified: [
    { id: 3, title: 'GroeiGroep - Strategy', value: 25000, company: 'GroeiGroep', contact: 'Peter Bakker' },
  ],
  proposal: [
    { id: 4, title: 'CloudNine - Migration', value: 45000, company: 'CloudNine', contact: 'Lisa Smit' },
    { id: 5, title: 'SecureFirst - Assessment', value: 12000, company: 'SecureFirst', contact: 'Tom Berg' },
  ],
  negotiation: [
    { id: 6, title: 'DataDriven - Dashboard', value: 18000, company: 'DataDriven', contact: 'Anna Visser' },
  ],
  closed: [
    { id: 7, title: 'InnoTech - Workshop', value: 5500, company: 'InnoTech', contact: 'Mark de Boer', won: true },
  ],
}

// Mock data for Leads
const mockLeads = [
  { id: 1, name: 'John Doe', email: 'john@acme.nl', company: 'Acme B.V.', campaign: 'Q2 SaaS Outreach', status: 'Contacted', score: 85 },
  { id: 2, name: 'Jane Smith', email: 'jane@techstart.nl', company: 'TechStart B.V.', campaign: 'Q2 SaaS Outreach', status: 'Replied', score: 92 },
  { id: 3, name: 'Bob Johnson', email: 'bob@groei.nl', company: 'GroeiGroep', campaign: 'Consulting Warm', status: 'Meeting Booked', score: 78 },
  { id: 4, name: 'Alice Williams', email: 'alice@datadriven.io', company: 'DataDriven', campaign: 'Analytics Cold', status: 'New', score: 65 },
  { id: 5, name: 'Charlie Brown', email: 'charlie@cloudnine.tech', company: 'CloudNine', campaign: 'Enterprise Focus', status: 'Qualified', score: 88 },
]

export default function NocoDBDemoPage() {
  const [selectedView, setSelectedView] = useState('spreadsheet')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">NocoDB Demo</h1>
          <p className="text-muted-foreground">
            Spreadsheet & Kanban interface voor CRM data. Dit is hoe NocoDB eruit zou zien.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-green-600 border-green-600">
            Live Connectie: Supabase
          </Badge>
          <Button variant="outline" onClick={() => window.open('https://railway.com', '_blank')}>
            Open NocoDB
          </Button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Companies</CardDescription>
            <CardTitle className="text-2xl">17,432</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">+234 deze maand</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Opportunities</CardDescription>
            <CardTitle className="text-2xl">23</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">€142K pipeline value</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Leads This Month</CardDescription>
            <CardTitle className="text-2xl">1,847</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">12.3% reply rate</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Meetings Booked</CardDescription>
            <CardTitle className="text-2xl">47</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">+8 deze week</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="companies" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
          <TabsTrigger value="companies">Companies</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
          <TabsTrigger value="kanban">Kanban View</TabsTrigger>
        </TabsList>

        {/* Companies Spreadsheet View */}
        <TabsContent value="companies" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Companies</CardTitle>
                  <CardDescription>Spreadsheet view van alle bedrijven</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">Filter</Button>
                  <Button variant="outline" size="sm">Sort</Button>
                  <Button size="sm">+ Add</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Employees</TableHead>
                    <TableHead>Website</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Contact</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockCompanies.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell className="font-medium">{company.name}</TableCell>
                      <TableCell>{company.industry}</TableCell>
                      <TableCell>{company.employees}</TableCell>
                      <TableCell className="text-blue-600">{company.website}</TableCell>
                      <TableCell>
                        <StatusBadge status={company.status} />
                      </TableCell>
                      <TableCell>{company.lastContact}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Opportunities View */}
        <TabsContent value="opportunities" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Opportunities</CardTitle>
                  <CardDescription>Sales pipeline tracking</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">Filter</Button>
                  <Button size="sm">+ Add Opportunity</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(mockOpportunities).flatMap(([stage, items]) =>
                    items.map((opp) => (
                      <TableRow key={opp.id}>
                        <TableCell className="font-medium">{opp.title}</TableCell>
                        <TableCell>{opp.company}</TableCell>
                        <TableCell>{opp.contact}</TableCell>
                        <TableCell>
                          <StageBadge stage={stage} />
                        </TableCell>
                        <TableCell>€{opp.value.toLocaleString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leads View */}
        <TabsContent value="leads" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Leads</CardTitle>
                  <CardDescription>All campaign leads</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm">Filter</Button>
                  <Button size="sm">+ Import</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mockLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">{lead.name}</TableCell>
                      <TableCell>{lead.email}</TableCell>
                      <TableCell>{lead.company}</TableCell>
                      <TableCell>{lead.campaign}</TableCell>
                      <TableCell>
                        <LeadStatusBadge status={lead.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 rounded-full bg-gray-200">
                            <div
                              className="h-2 rounded-full bg-blue-500"
                              style={{ width: `${lead.score}%` }}
                            />
                          </div>
                          <span className="text-sm">{lead.score}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Kanban View */}
        <TabsContent value="kanban" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Opportunities Kanban</CardTitle>
              <CardDescription>Drag & drop pipeline view (NocoDB heeft dit built-in)</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-4">
                <KanbanColumn title="Lead" count={mockOpportunities.lead.length} color="gray">
                  {mockOpportunities.lead.map((opp) => (
                    <KanbanCard key={opp.id} {...opp} />
                  ))}
                </KanbanColumn>
                <KanbanColumn title="Qualified" count={mockOpportunities.qualified.length} color="blue">
                  {mockOpportunities.qualified.map((opp) => (
                    <KanbanCard key={opp.id} {...opp} />
                  ))}
                </KanbanColumn>
                <KanbanColumn title="Proposal" count={mockOpportunities.proposal.length} color="yellow">
                  {mockOpportunities.proposal.map((opp) => (
                    <KanbanCard key={opp.id} {...opp} />
                  ))}
                </KanbanColumn>
                <KanbanColumn title="Negotiation" count={mockOpportunities.negotiation.length} color="orange">
                  {mockOpportunities.negotiation.map((opp) => (
                    <KanbanCard key={opp.id} {...opp} />
                  ))}
                </KanbanColumn>
                <KanbanColumn title="Closed" count={mockOpportunities.closed.length} color="green">
                  {mockOpportunities.closed.map((opp) => (
                    <KanbanCard key={opp.id} {...opp} won={opp.won} />
                  ))}
                </KanbanColumn>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Integration Info */}
      <Card className="bg-slate-50">
        <CardHeader>
          <CardTitle>Hoe werkt dit in de praktijk?</CardTitle>
          <CardDescription>NocoDB + Supabase + Railway setup</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <h4 className="font-semibold">1. NocoDB op Railway</h4>
              <p className="text-sm text-muted-foreground">
                Deploy NocoDB Starter Pack op Railway ($15-20/maand). Dit geeft je een dedicated
                NocoDB instance met PostgreSQL + Redis.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">2. Connect Supabase</h4>
              <p className="text-sm text-muted-foreground">
                Gebruik je Supabase connection string. NocoDB leest al je bestaande tabellen
                (companies, contacts, leads, opportunities).
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">3. Configureer Views</h4>
              <p className="text-sm text-muted-foreground">
                Maak spreadsheet views voor companies, kanban voor opportunities, formulieren
                voor data entry. Geen code nodig.
              </p>
            </div>
          </div>
          <div className="flex gap-4 pt-4">
            <Button onClick={() => window.open('https://railway.com/deploy/nocodb', '_blank')}>
              Deploy NocoDB op Railway
            </Button>
            <Button variant="outline" onClick={() => window.open('https://nocodb.com', '_blank')}>
              NocoDB Documentatie
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Helper Components
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Active: 'bg-green-100 text-green-800',
    Prospect: 'bg-blue-100 text-blue-800',
    Cold: 'bg-gray-100 text-gray-800',
  }
  return (
    <Badge className={colors[status] || 'bg-gray-100 text-gray-800'} variant="secondary">
      {status}
    </Badge>
  )
}

function StageBadge({ stage }: { stage: string }) {
  const labels: Record<string, string> = {
    lead: 'Lead',
    qualified: 'Qualified',
    proposal: 'Proposal',
    negotiation: 'Negotiation',
    closed: 'Closed',
  }
  const colors: Record<string, string> = {
    lead: 'bg-gray-100 text-gray-800',
    qualified: 'bg-blue-100 text-blue-800',
    proposal: 'bg-yellow-100 text-yellow-800',
    negotiation: 'bg-orange-100 text-orange-800',
    closed: 'bg-green-100 text-green-800',
  }
  return (
    <Badge className={colors[stage]} variant="secondary">
      {labels[stage]}
    </Badge>
  )
}

function LeadStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    New: 'bg-gray-100 text-gray-800',
    Contacted: 'bg-blue-100 text-blue-800',
    Replied: 'bg-yellow-100 text-yellow-800',
    'Meeting Booked': 'bg-green-100 text-green-800',
    Qualified: 'bg-purple-100 text-purple-800',
  }
  return (
    <Badge className={colors[status] || 'bg-gray-100 text-gray-800'} variant="secondary">
      {status}
    </Badge>
  )
}

function KanbanColumn({ title, count, color, children }: { title: string; count: number; color: string; children: React.ReactNode }) {
  const colorClasses: Record<string, string> = {
    gray: 'border-t-gray-400',
    blue: 'border-t-blue-400',
    yellow: 'border-t-yellow-400',
    orange: 'border-t-orange-400',
    green: 'border-t-green-400',
  }
  return (
    <div className={`flex flex-col gap-2 rounded-lg border border-t-4 bg-slate-50 p-3 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">{title}</h4>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="flex flex-col gap-2">
        {children}
      </div>
    </div>
  )
}

function KanbanCard({ title, value, company, contact, won }: { title: string; value: number; company: string; contact: string; won?: boolean }) {
  return (
    <div className={`rounded-md bg-white p-3 shadow-sm border ${won ? 'border-green-300' : 'border-gray-200'}`}>
      <h5 className="font-medium text-sm mb-2">{title}</h5>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>€{value.toLocaleString()}</p>
        <p>{company}</p>
        <p>{contact}</p>
      </div>
      {won && (
        <Badge className="mt-2 bg-green-100 text-green-800" variant="secondary">
          Won
        </Badge>
      )}
    </div>
  )
}
