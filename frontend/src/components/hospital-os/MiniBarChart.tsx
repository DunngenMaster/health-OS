interface BarItem {
  label: string
  value: number
  color?: string
}

interface MiniBarChartProps {
  title: string
  items: BarItem[]
}

export function MiniBarChart({ title, items }: MiniBarChartProps) {
  const max = Math.max(...items.map((item) => item.value), 1)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="mb-4 text-xs font-medium uppercase tracking-widest text-slate-400">{title}</p>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="text-slate-600">{item.label}</span>
              <span className="font-mono text-slate-800">{item.value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${(item.value / max) * 100}%`,
                  background: item.color ?? 'linear-gradient(90deg, #a78bfa, #7c3aed)'
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
