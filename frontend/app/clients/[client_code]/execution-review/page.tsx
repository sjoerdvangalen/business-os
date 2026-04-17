'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle2, XCircle, Clock, MessageSquare, ThumbsUp, ThumbsDown } from 'lucide-react'

interface ExecutionReviewPageProps {
  params: { client_code: string }
}

export default function ExecutionReviewPage({ params }: ExecutionReviewPageProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Execution Review</h2>
          <p className="text-muted-foreground">
            Review campaigns, leads, and meetings awaiting approval
          </p>
        </div>
        <Badge variant="outline" className="text-blue-600">
          <Clock className="mr-1 h-3 w-3" />
          0 Pending
        </Badge>
      </div>

      <Tabs defaultValue="campaigns" className="space-y-4">
        <TabsList>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="leads">Lead Quality</TabsTrigger>
          <TabsTrigger value="meetings">Meetings</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Campaigns Awaiting Approval</CardTitle>
              <CardDescription>
                Campaigns ready for final review before launch
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle2 className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No campaigns awaiting approval</p>
                <p className="text-sm mt-2">
                  Campaigns will appear here when ready for review
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leads" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Lead Quality Review</CardTitle>
              <CardDescription>
                Review lead quality and flag issues
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No lead quality flags</p>
                <p className="text-sm mt-2">
                  Flagged leads will appear here for review
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="meetings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Meeting Quality Review</CardTitle>
              <CardDescription>
                Review booked meetings and provide feedback
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <ThumbsUp className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No meetings to review</p>
                <p className="text-sm mt-2">
                  Meetings will appear here for quality feedback
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
