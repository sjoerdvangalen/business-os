'use client'

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface AreaChartData {
  date: string
  booked: number
  qualified: number
}

export default function MeetingsAreaChart({ data }: { data: AreaChartData[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10 }}
            interval={0}
            angle={-30}
            textAnchor="end"
            height={50}
          />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            formatter={(value, name) => [
              typeof value === 'number' ? value.toLocaleString() : String(value),
              String(name)
            ]}
          />
          <Area
            type="monotone"
            dataKey="booked"
            stackId="1"
            stroke="#8b5cf6"
            fill="#8b5cf6"
            fillOpacity={0.6}
            name="Meetings Booked"
          />
          <Area
            type="monotone"
            dataKey="qualified"
            stackId="1"
            stroke="#10b981"
            fill="#10b981"
            fillOpacity={0.6}
            name="Qualified"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
