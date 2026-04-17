'use client'

import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts'

interface LineChartData {
  date: string
  [key: string]: string | number
}

export default function ClientLineChart({ data, clients }: { data: LineChartData[]; clients: string[] }) {
  const colors = ['hsl(var(--primary))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#64748b']

  return (
    <ResponsiveContainer width="100%" height={256}>
      <LineChart data={data}>
        <XAxis dataKey="date" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => v.toLocaleString()} />
        <Tooltip
          contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
        />
        <Legend wrapperStyle={{ paddingTop: '16px' }} />
        {clients.map((client, index) => (
          <Line
            key={client}
            type="monotone"
            dataKey={client}
            stroke={colors[index % colors.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
