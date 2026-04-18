'use client'

import { useMemo } from 'react'
import type { ProjectEvent } from '@/app/types'
import { Input } from '@/components/ui/input'
import type { ProjectFilters as FilterState } from '@/lib/projects/selectors'

interface ProjectFiltersProps {
  filters: FilterState
  onChange: (filters: FilterState) => void
  events: ProjectEvent[]
}

export default function ProjectFilters({ filters, onChange, events }: ProjectFiltersProps) {
  const projectTypes = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) set.add(e.project_type)
    return Array.from(set).sort()
  }, [events])

  const eventTypes = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) set.add(e.event_type)
    return Array.from(set).sort()
  }, [events])

  const statuses = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) set.add(e.status)
    return Array.from(set).sort()
  }, [events])

  const severities = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) if (e.severity) set.add(e.severity)
    return Array.from(set).sort()
  }, [events])

  const hasOwners = useMemo(() => events.some((e) => e.owner_id), [events])

  const update = (key: keyof FilterState, value: string | undefined) => {
    onChange({ ...filters, [key]: value })
  }

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <Input
        placeholder="Search events..."
        value={filters.search || ''}
        onChange={(e) => update('search', e.target.value || undefined)}
        className="w-48"
      />

      <FilterSelect
        label="Project type"
        options={projectTypes}
        value={filters.projectType}
        onChange={(v) => update('projectType', v)}
      />

      <FilterSelect
        label="Event type"
        options={eventTypes}
        value={filters.eventType}
        onChange={(v) => update('eventType', v)}
      />

      <FilterSelect
        label="Status"
        options={statuses}
        value={filters.status}
        onChange={(v) => update('status', v)}
      />

      {severities.length > 0 && (
        <FilterSelect
          label="Severity"
          options={severities}
          value={filters.severity}
          onChange={(v) => update('severity', v)}
        />
      )}

      {Object.keys(filters).length > 0 && (
        <button
          onClick={() => onChange({})}
          className="text-sm text-muted-foreground hover:text-foreground underline"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}

function FilterSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value?: string
  onChange: (value: string | undefined) => void
}) {
  if (options.length === 0) return null

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors"
    >
      <option value="">{label}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  )
}
