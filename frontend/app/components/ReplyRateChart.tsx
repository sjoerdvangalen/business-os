'use client'

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts'

interface ReplyRateData {
  name: string
  rate: number
}

export default function ReplyRateChart({ data }: { data: ReplyRateData[] }) {
  return (
    <ResponsiveContainer width="100%" height={256}>
      <BarChart data={data} layout="vertical">
        <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
        <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={60} />
        <Tooltip
          formatter={(value: number) => `${value.toFixed(1)}%`}
          contentStyle={{ backgroundColor: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }}
        />
        <Bar dataKey="rate" fill="#10b981" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
