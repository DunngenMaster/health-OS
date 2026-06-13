import type { DataSourceType } from '../types/hospitalIntelligence'
import { sourceBadge } from '../types/hospitalIntelligence'

export function SourceBadge({ type }: { type: DataSourceType }) {
  const badge = sourceBadge(type)
  const lightStyles: Record<DataSourceType, string> = {
    real: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    estimated: 'bg-amber-50 text-amber-800 border-amber-200',
    simulated: 'bg-violet-50 text-violet-700 border-violet-200',
    unavailable: 'bg-slate-100 text-slate-500 border-slate-200'
  }
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${lightStyles[type]}`}>
      {badge.label}
    </span>
  )
}

export function ConfidenceBadge({ level }: { level: 'high' | 'medium' | 'low' }) {
  const styles = {
    high: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-50 text-amber-800 border-amber-200',
    low: 'bg-rose-50 text-rose-700 border-rose-200'
  }
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-wide ${styles[level]}`}>
      {level} confidence
    </span>
  )
}
