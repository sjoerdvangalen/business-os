'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface PieChartData {
  name: string
  value: number
}

const COLORS = {
  'Positive': '#10b981',
  'Neutral': '#3b82f6',
  'Not Interested': '#f59e0b',
  'Future Request': '#8b5cf6',
  'Info Request': '#06b6d4',
  'Out of Office': '#94a3b8',
  'Blocklist': '#ef4444',
}

export default function ReplyPieChart({ data }: { data: PieChartData[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[entry.name as keyof typeof COLORS] || '#64748b'}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
            formatter={(value, name) => [
              typeof value === 'number' ? `${value.toLocaleString()} (${((value / data.reduce((a, b) => a + b.value, 0)) * 100).toFixed(1)}%)` : String(value),
              name
            ]}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            iconType="circle"
            wrapperStyle={{ fontSize: 11 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
