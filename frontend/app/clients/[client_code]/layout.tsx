'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface ClientLayoutProps {
  children: React.ReactNode
  params: Promise<{ client_code: string }>
}

const tabs = [
  { name: 'Overview', href: '' },
  { name: 'Projects', href: '/projects' },
  { name: 'Strategy', href: '/strategy' },
  { name: 'Execution Review', href: '/execution-review' },
  { name: 'Cells', href: '/cells' },
  { name: 'Campaigns', href: '/campaigns' },
  { name: 'Infrastructure', href: '/infrastructure' },
  { name: 'Activity', href: '/activity' },
]

export default function ClientLayout({ children, params }: ClientLayoutProps) {
  const pathname = usePathname()
  const resolvedParams = React.use(params)
  const basePath = `/clients/${resolvedParams.client_code}`

  return (
    <div className="space-y-6">
      {/* Client Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight uppercase">
            {resolvedParams.client_code}
          </h1>
          <p className="text-muted-foreground">
            Client control plane
          </p>
        </div>
      </div>

      {/* Client Navigation */}
      <nav className="flex space-x-1 border-b">
        {tabs.map((tab) => {
          const fullPath = `${basePath}${tab.href}`
          const isActive = pathname === fullPath || (tab.href === '' && pathname === basePath)

          return (
            <Link
              key={tab.name}
              href={fullPath}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300'
              )}
            >
              {tab.name}
            </Link>
          )
        })}
      </nav>

      {/* Page Content */}
      {children}
    </div>
  )
}
