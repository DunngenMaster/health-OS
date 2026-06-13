interface SparklineChartProps {
  data: number[]
  width?: number
  height?: number
  color?: string
  label?: string
}

export function SparklineChart({ data, width = 280, height = 72, color = '#7c3aed', label }: SparklineChartProps) {
  if (data.length < 2) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const padding = 8
  const innerW = width - padding * 2
  const innerH = height - padding * 2

  const points = data.map((value, index) => {
    const x = padding + (index / (data.length - 1)) * innerW
    const y = padding + innerH - ((value - min) / range) * innerH
    return `${x},${y}`
  }).join(' ')

  const last = data[data.length - 1]
  const first = data[0]
  const trend = last >= first ? '↑' : '↓'

  return (
    <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
      {label && (
        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span>{label}</span>
          <span className="font-mono text-violet-600">{trend} {last}</span>
        </div>
      )}
      <svg width={width} height={height} className="overflow-visible">
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon
          points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`}
          fill="url(#sparkFill)"
        />
        <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" points={points} />
        {data.map((value, index) => {
          const x = padding + (index / (data.length - 1)) * innerW
          const y = padding + innerH - ((value - min) / range) * innerH
          return <circle key={index} cx={x} cy={y} r="3" fill={color} opacity={index === data.length - 1 ? 1 : 0.4} />
        })}
      </svg>
    </div>
  )
}
