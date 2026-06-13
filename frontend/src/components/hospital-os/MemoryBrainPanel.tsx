import type { HospitalMemory } from '../../types/hospitalOsReport'
import { SparklineChart } from './SparklineChart'

interface MemoryBrainPanelProps {
  memory: HospitalMemory
}

export function MemoryBrainPanel({ memory }: MemoryBrainPanelProps) {
  const history = memory.readiness_history
  const showTrend = history.length >= 2
  const readinessTrend = history.map((h) => h.readiness_score)
  const riskTrend = history.map((h) => h.risk_score)
  const improvements = memory.successful_improvements.slice(-3)
  const latestNote = memory.ai_model_learning_notes.slice(-1)[0]

  if (history.length === 0) return null

  return (
    <section className="rounded-3xl border border-violet-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-violet-500">Hospital memory agent</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Improvement history</h2>
          <p className="mt-1 text-sm text-slate-500">Tracks prior intelligence cycles for this hospital — not simulated incidents.</p>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-2 text-right">
          <p className="text-xs text-slate-400">Cycles</p>
          <p className="font-mono text-xl font-bold text-violet-700">{history.length}</p>
        </div>
      </div>

      {showTrend && (
        <div className="grid gap-4 lg:grid-cols-2">
          <SparklineChart data={readinessTrend} label="Readiness trend (your runs)" color="#059669" />
          <SparklineChart data={riskTrend} label="Risk trend (your runs)" color="#e11d48" />
        </div>
      )}

      {(improvements.length > 0 || latestNote) && (
        <div className={`grid gap-4 ${showTrend ? 'mt-4' : ''} lg:grid-cols-2`}>
          {improvements.length > 0 && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
              <p className="text-xs font-medium uppercase tracking-widest text-emerald-700">Completed improvements</p>
              <ul className="mt-2 space-y-2">
                {improvements.map((item) => (
                  <li key={item.date_completed} className="text-sm text-slate-700">
                    <span className="font-medium">{item.improvement}</span>
                    <span className="block text-xs text-slate-500">{item.measured_impact}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {latestNote && (
            <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
              <p className="text-xs font-medium uppercase tracking-widest text-violet-600">Latest learning</p>
              <p className="mt-2 text-sm text-slate-700">{latestNote.observation}</p>
              <p className="mt-1 text-xs text-slate-500">{latestNote.new_recommendation_logic}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
