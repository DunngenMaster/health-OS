import type { DoctorSkillReport } from '../../utils/doctorSkillAgent'
import type { HospitalMemory } from '../../types/hospitalOsReport'
import { SourceBadge } from '../SourceBadge'

interface DoctorSkillPanelProps {
  report: DoctorSkillReport
  memory: HospitalMemory
}

const urgencyStyles: Record<string, string> = {
  high: 'border-violet-200 bg-violet-50/60',
  medium: 'border-sky-100 bg-sky-50/50',
  low: 'border-slate-100 bg-slate-50'
}

export function DoctorSkillPanel({ report, memory }: DoctorSkillPanelProps) {
  const priority = report.physician_recommendations.filter((r) => r.urgency === 'high')

  return (
    <section className="rounded-3xl border border-violet-100 bg-gradient-to-br from-white via-violet-50/30 to-white p-6 shadow-sm">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
            <h2 className="text-xs font-medium uppercase tracking-[0.3em] text-violet-500">✦ Physician development agent</h2>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Continuous improvement for expert physicians</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Real conferences, certifications, and courses from accredited providers — suggestions to strengthen an already strong team.
          </p>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-white px-4 py-3 text-right">
          <p className="text-xs text-slate-400">Physicians reviewed</p>
          <p className="font-mono text-2xl font-bold text-violet-700">{report.physician_recommendations.length}</p>
        </div>
      </div>

      {priority.length > 0 && (
        <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50/80 px-4 py-3 text-sm text-violet-900">
          <strong>{priority.length} specialist(s)</strong> have high-value development opportunities aligned with current regional surge patterns.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {report.physician_recommendations.map((rec) => (
          <div key={rec.npi} className={`rounded-2xl border p-4 ${urgencyStyles[rec.urgency] ?? urgencyStyles.low}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{rec.doctor_name}</p>
                <p className="text-sm text-slate-600">{rec.specialty}</p>
                <p className="text-xs text-slate-400">{rec.organization}</p>
              </div>
              <SourceBadge type={rec.data_source_type} />
            </div>

            <div className="mt-3 rounded-xl bg-white/80 px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Suggested opportunity</p>
              <p className="mt-1 text-sm font-medium text-slate-800">{rec.recommended_training}</p>
              <p className="mt-1 text-xs text-slate-500">
                {rec.training_type} · {rec.provider}
              </p>
              <a
                href={rec.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex text-xs font-medium text-violet-600 hover:underline"
              >
                View program ↗
              </a>
            </div>

            <p className="mt-2 text-xs text-slate-600">
              <span className="font-medium text-slate-700">Focus area:</span> {rec.improvement_focus ?? rec.skill_gap}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">{rec.why_recommended}</p>
            <p className="mt-1 text-[11px] text-slate-400">Source: {rec.evidence_source}</p>
            {rec.times_recommended > 1 && (
              <p className="mt-1 text-xs text-violet-600">Reinforced {rec.times_recommended}× in hospital memory — sustained improvement path</p>
            )}
          </div>
        ))}
      </div>

      {memory.doctor_skill_memory?.skill_improvement_notes?.slice(-1)[0] && (
        <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/50 px-4 py-3 text-sm text-slate-600">
          <span className="font-medium text-violet-700">Memory agent: </span>
          {memory.doctor_skill_memory.skill_improvement_notes.slice(-1)[0].observation}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400">{report.note}</p>
    </section>
  )
}
