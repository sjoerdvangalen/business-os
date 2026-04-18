'use client'

import { useState, useEffect } from 'react'
import { createClient } from './client'

function getKey(obj: unknown, key: string): unknown {
  if (obj && typeof obj === 'object') {
    return (obj as Record<string, unknown>)[key]
  }
  return undefined
}

export function useRealtimeTable<T>(
  initial: T[],
  tableName: string,
  primaryKey: string = 'id'
): T[] {
  const [data, setData] = useState<T[]>(initial)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`${tableName}-changes`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName },
        (payload) => {
          setData((prev) => {
            if (payload.eventType === 'INSERT') {
              const newRow = payload.new as T
              if (prev.find((r) => getKey(r, primaryKey) === getKey(newRow, primaryKey))) return prev
              return [newRow, ...prev]
            }
            if (payload.eventType === 'UPDATE') {
              const newRow = payload.new as T
              return prev.map((r) =>
                getKey(r, primaryKey) === getKey(newRow, primaryKey) ? newRow : r
              )
            }
            if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as Record<string, unknown>
              return prev.filter((r) => getKey(r, primaryKey) !== oldRow[primaryKey])
            }
            return prev
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tableName, primaryKey])

  return data
}
