'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExternalLink, Grid, Kanban, Table } from 'lucide-react'

const NOCODB_URL = 'https://nocodb-production-5aef.up.railway.app'

// Embed URLs for specific views - these need to be created in NocoDB UI first
const EMBED_URLS = {
  companies: `${NOCODB_URL}/#/nc/view/`, // Will be filled after views are created
  contacts: `${NOCODB_URL}/#/nc/view/`,
  opportunities: `${NOCODB_URL}/#/nc/view/`,
  leads: `${NOCODB_URL}/#/nc/view/`,
}

export default function NocoDBPage() {
  const [activeTab, setActiveTab] = useState('companies')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">NocoDB Views</h1>
          <p className="text-muted-foreground">
            Spreadsheet en Kanban views voor CRM data. Powered by NocoDB.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-green-600 border-green-600">
            Connected
          </Badge>
          <Button
            variant="outline"
            onClick={() => window.open(NOCODB_URL, '_blank')}
            className="gap-2"
          >
            <ExternalLink className="h-4 w-4" />
            Open NocoDB
          </Button>
        </div>
      </div>

      {/* Instructions Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-blue-900 text-lg">Setup Instructies</CardTitle>
          <CardDescription className="text-blue-700">
            Maak views aan in NocoDB om ze hier te zien:
          </CardDescription>
        </CardHeader>
        <CardContent className="text-blue-800 text-sm space-y-2">
          <ol className="list-decimal list-inside space-y-1">
            <li>Ga naar <a href={NOCODB_URL} target="_blank" className="underline font-medium">NocoDB</a></li>
            <li>Klik op een tabel (companies, contacts, opportunities, leads)</li>
            <li>Klik "New View" → kies "Grid" (spreadsheet) of "Kanban"</li>
            <li>Configureer kolommen/filters zoals gewenst</li>
            <li>De views verschijnen hier automatisch via iframe</li>
          </ol>
        </CardContent>
      </Card>

      {/* Views Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-[500px]">
          <TabsTrigger value="companies" className="gap-2">
            <Table className="h-4 w-4" />
            Companies
          </TabsTrigger>
          <TabsTrigger value="contacts" className="gap-2">
            <Table className="h-4 w-4" />
            Contacts
          </TabsTrigger>
          <TabsTrigger value="opportunities" className="gap-2">
            <Kanban className="h-4 w-4" />
            Opportunities
          </TabsTrigger>
          <TabsTrigger value="leads" className="gap-2">
            <Grid className="h-4 w-4" />
            Leads
          </TabsTrigger>
        </TabsList>

        {/* Companies View */}
        <TabsContent value="companies" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Companies Spreadsheet</CardTitle>
                  <CardDescription>
                    Alle bedrijven in spreadsheet formaat. Filter, sorteer en exporteer.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`${NOCODB_URL}/#/nc/base/`, '_blank')}
                >
                  Bewerken in NocoDB
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <iframe
                src={`${NOCODB_URL}/#/nc/base/`}
                className="w-full h-[600px] border rounded-lg"
                allow="fullscreen"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contacts View */}
        <TabsContent value="contacts" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Contacts Spreadsheet</CardTitle>
                  <CardDescription>
                    Alle contactpersonen met linked companies.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`${NOCODB_URL}/#/nc/base/`, '_blank')}
                >
                  Bewerken in NocoDB
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <iframe
                src={`${NOCODB_URL}/#/nc/base/`}
                className="w-full h-[600px] border rounded-lg"
                allow="fullscreen"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Opportunities View */}
        <TabsContent value="opportunities" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Opportunities Kanban</CardTitle>
                  <CardDescription>
                    Sales pipeline in Kanban formaat. Sleep deals tussen stages.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`${NOCODB_URL}/#/nc/base/`, '_blank')}
                >
                  Bewerken in NocoDB
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <iframe
                src={`${NOCODB_URL}/#/nc/base/`}
                className="w-full h-[600px] border rounded-lg"
                allow="fullscreen"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leads View */}
        <TabsContent value="leads" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Leads Overview</CardTitle>
                  <CardDescription>
                    Alle leads per campagne met status.
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`${NOCODB_URL}/#/nc/base/`, '_blank')}
                >
                  Bewerken in NocoDB
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <iframe
                src={`${NOCODB_URL}/#/nc/base/`}
                className="w-full h-[600px] border rounded-lg"
                allow="fullscreen"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
