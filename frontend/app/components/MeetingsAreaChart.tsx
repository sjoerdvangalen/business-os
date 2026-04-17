'use client'

import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts'

interface AreaChartData {
  date: string
  meetings: number
  qualified: number
}

export default function MeetingsAreaChart({ data }: { data: AreaChartData[] }) {
  return (
    <ResponsiveContainer width="100%" height={256}>
      <AreaChart data={data}>
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
        />
        <Legend wrapperStyle={{ paddingTop: '16px' }} />
        <Area
          type="monotone"
          dataKey="meetings"
          stroke="hsl(var(--primary))"
          fill="hsl(var(--primary))"
          fillOpacity={0.2}
        />
        <Area
          type="monotone"
          dataKey="qualified"
          stroke="#10b981"
          fill="#10b981"
          fillOpacity={0.2}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
