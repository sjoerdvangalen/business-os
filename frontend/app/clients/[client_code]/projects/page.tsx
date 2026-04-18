import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getClientByCode } from '@/app/lib/queries/clients'
import { getProjectEvents } from '@/lib/projects/selectors'
import ProjectsShell from './_components/ProjectsShell'
import ProjectsSkeleton from './_components/ProjectsSkeleton'

export const dynamic = 'force-dynamic'

interface ProjectsPageProps {
  params: Promise<{ client_code: string }>
  searchParams: Promise<{ view?: string }>
}

async function ProjectsContent({
  clientCode,
  view,
}: {
  clientCode: string
  view?: string
}) {
  const client = await getClientByCode(clientCode)
  if (!client) {
    notFound()
  }

  const events = await getProjectEvents(client.id)

  return (
    <ProjectsShell
      client={client}
      events={events}
      defaultView={view || 'list'}
    />
  )
}

export default async function ProjectsPage({
  params,
  searchParams,
}: ProjectsPageProps) {
  const { client_code } = await params
  const { view } = await searchParams

  return (
    <Suspense fallback={<ProjectsSkeleton />}>
      <ProjectsContent clientCode={client_code} view={view} />
    </Suspense>
  )
}
