'use client'

import { cn } from '@/lib/utils'

type ViewType = 'list' | 'board' | 'calendar'

interface ViewSwitcherProps {
  current: ViewType
  onChange: (view: ViewType) => void
}

const views: { key: ViewType; label: string }[] = [
  { key: 'list', label: 'List' },
  { key: 'board', label: 'Board' },
  { key: 'calendar', label: 'Calendar' },
]

export default function ViewSwitcher({ current, onChange }: ViewSwitcherProps) {
  return (
    <div className="flex space-x-1 border rounded-md p-1 bg-muted/50">
      {views.map((v) => (
        <button
          key={v.key}
          onClick={() => onChange(v.key)}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-sm transition-colors',
            current === v.key
              ? 'bg-white text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}
