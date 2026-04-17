'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { createClient } from '@/lib/supabase/client'

interface Company {
  id: string
  name: string
  industry: string | null
  size: string | null
  website: string | null
  city: string | null
  country: string | null
  status: string | null
  created_at: string
}

interface Contact {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  title: string | null
  company_id: string | null
  created_at: string
}

interface Opportunity {
  id: string
  title: string | null
  value: number | null
  stage: string | null
  company_id: string | null
  contact_id: string | null
  created_at: string
}

interface Lead {
  id: string
  contact_id: string | null
  campaign_id: string | null
  status: string | null
  created_at: string
}

export default function DataPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [counts, setCounts] = useState({
    companies: 0,
    contacts: 0,
    opportunities: 0,
    leads: 0
  })

  const supabase = createClient()

  useEffect(() => {
    fetchData()
    fetchCounts()
  }, [])

  async function fetchData() {
    setLoading(true)

    // Fetch companies
    const { data: companiesData } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    // Fetch contacts
    const { data: contactsData } = await supabase
      .from('contacts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    // Fetch opportunities
    const { data: opportunitiesData } = await supabase
      .from('opportunities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    // Fetch leads
    const { data: leadsData } = await supabase
      .from('leads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (companiesData) setCompanies(companiesData)
    if (contactsData) setContacts(contactsData)
    if (opportunitiesData) setOpportunities(opportunitiesData)
    if (leadsData) setLeads(leadsData)

    setLoading(false)
  }

  async function fetchCounts() {
    const { count: companiesCount } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true })

    const { count: contactsCount } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true })

    const { count: opportunitiesCount } = await supabase
      .from('opportunities')
      .select('*', { count: 'exact', head: true })

    const { count: leadsCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })

    setCounts({
      companies: companiesCount || 0,
      contacts: contactsCount || 0,
      opportunities: opportunitiesCount || 0,
      leads: leadsCount || 0
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">CRM Data</h1>
          <p className="text-muted-foreground">
            Live data uit Supabase. Beheer in NocoDB voor geavanceerde views.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-green-600 border-green-600">
            Live: Supabase
          </Badge>
          <Button variant="outline" onClick={() => window.open('https://nocodb-production-5aef.up.railway.app', '_blank')}>
            Open in NocoDB
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Companies</CardDescription>
            <CardTitle className="text-2xl">{counts.companies.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{companies.length} geladen</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Contacts</CardDescription>
            <CardTitle className="text-2xl">{counts.contacts.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{contacts.length} geladen</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Opportunities</CardDescription>
            <CardTitle className="text-2xl">{counts.opportunities.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Pipeline value</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Leads</CardDescription>
            <CardTitle className="text-2xl">{counts.leads.toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Campaign leads</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="companies" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-[400px]">
          <TabsTrigger value="companies">Companies</TabsTrigger>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="leads">Leads</TabsTrigger>
        </TabsList>

        {/* Companies */}
        <TabsContent value="companies" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Companies</CardTitle>
                  <CardDescription>Bedrijven uit database ({companies.length} getoond)</CardDescription>
                </div>
                <Button size="sm" onClick={fetchData} disabled={loading}>
                  {loading ? 'Laden...' : 'Refresh'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Website</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {companies.map((company) => (
                    <TableRow key={company.id}>
                      <TableCell className="font-medium">{company.name}</TableCell>
                      <TableCell>{company.industry || '-'}</TableCell>
                      <TableCell>{company.size || '-'}</TableCell>
                      <TableCell>{company.city || '-'}</TableCell>
                      <TableCell>{company.country || '-'}</TableCell>
                      <TableCell className="text-blue-600">
                        {company.website ? (
                          <a href={`https://${company.website}`} target="_blank" rel="noopener noreferrer">
                            {company.website}
                          </a>
                        ) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contacts */}
        <TabsContent value="contacts" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Contacts</CardTitle>
                  <CardDescription>Contactpersonen ({contacts.length} getoond)</CardDescription>
                </div>
                <Button size="sm" onClick={fetchData} disabled={loading}>
                  {loading ? 'Laden...' : 'Refresh'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Company ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">
                        {contact.first_name} {contact.last_name}
                      </TableCell>
                      <TableCell>{contact.email || '-'}</TableCell>
                      <TableCell>{contact.title || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{contact.company_id?.slice(0, 8)}...</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Opportunities */}
        <TabsContent value="opportunities" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Opportunities</CardTitle>
                  <CardDescription>Sales pipeline ({opportunities.length} getoond)</CardDescription>
                </div>
                <Button size="sm" onClick={fetchData} disabled={loading}>
                  {loading ? 'Laden...' : 'Refresh'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Company ID</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opportunities.map((opp) => (
                    <TableRow key={opp.id}>
                      <TableCell className="font-medium">{opp.title || '-'}</TableCell>
                      <TableCell>
                        <StageBadge stage={opp.stage || 'new'} />
                      </TableCell>
                      <TableCell>{opp.value ? `€${opp.value.toLocaleString()}` : '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{opp.company_id?.slice(0, 8)}...</TableCell>
                      <TableCell>{new Date(opp.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leads */}
        <TabsContent value="leads" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Leads</CardTitle>
                  <CardDescription>Campaign leads ({leads.length} getoond)</CardDescription>
                </div>
                <Button size="sm" onClick={fetchData} disabled={loading}>
                  {loading ? 'Laden...' : 'Refresh'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Contact ID</TableHead>
                    <TableHead>Campaign ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-mono text-xs">{lead.id.slice(0, 8)}...</TableCell>
                      <TableCell className="font-mono text-xs">{lead.contact_id?.slice(0, 8)}...</TableCell>
                      <TableCell className="font-mono text-xs">{lead.campaign_id?.slice(0, 8)}...</TableCell>
                      <TableCell>
                        <LeadStatusBadge status={lead.status || 'new'} />
                      </TableCell>
                      <TableCell>{new Date(lead.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function StageBadge({ stage }: { stage: string }) {
  const labels: Record<string, string> = {
    new: 'New',
    qualified: 'Qualified',
    proposal: 'Proposal',
    negotiation: 'Negotiation',
    closed_won: 'Closed Won',
    closed_lost: 'Closed Lost',
  }
  const colors: Record<string, string> = {
    new: 'bg-gray-100 text-gray-800',
    qualified: 'bg-blue-100 text-blue-800',
    proposal: 'bg-yellow-100 text-yellow-800',
    negotiation: 'bg-orange-100 text-orange-800',
    closed_won: 'bg-green-100 text-green-800',
    closed_lost: 'bg-red-100 text-red-800',
  }
  return (
    <Badge className={colors[stage] || 'bg-gray-100 text-gray-800'} variant="secondary">
      {labels[stage] || stage}
    </Badge>
  )
}

function LeadStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    new: 'bg-gray-100 text-gray-800',
    contacted: 'bg-blue-100 text-blue-800',
    replied: 'bg-yellow-100 text-yellow-800',
    meeting_booked: 'bg-green-100 text-green-800',
    qualified: 'bg-purple-100 text-purple-800',
    converted: 'bg-green-100 text-green-800',
    unresponsive: 'bg-red-100 text-red-800',
  }
  return (
    <Badge className={colors[status] || 'bg-gray-100 text-gray-800'} variant="secondary">
      {status.replace('_', ' ')}
    </Badge>
  )
}
