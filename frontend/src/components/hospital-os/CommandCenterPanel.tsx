import type { FieldValue, HospitalIntelligenceProfile } from '../../types/hospitalIntelligence'
import { buildCommandCenterStatus } from '../../utils/capacityModel'
import { fieldDisplay, numericField } from '../../utils/hospitalOsUtils'
import { SourceBadge } from '../SourceBadge'

interface CommandCenterPanelProps {
  profile: HospitalIntelligenceProfile
}

const statusStyles = {
  open: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  strained: 'border-amber-200 bg-amber-50 text-amber-900',
  saturated: 'border-rose-200 bg-rose-50 text-rose-800'
}

export function CommandCenterPanel({ profile }: CommandCenterPanelProps) {
  const status = buildCommandCenterStatus(profile)
  const { capacity, scenario_load, remaining_slots } = status

  const assignment = profile.capacity.scenario_assignment
  const hasScenario = numericField(assignment?.total_patients, 0) > 0

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-slate-400">Routing & capacity agent</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Live command center</h2>
          <p className="mt-1 text-sm text-slate-500">Surge capacity from beds, occupancy, and staffing — tied to your active map scenario.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase ${statusStyles[status.status]}`}>
          {status.status}
        </span>
      </div>

      {hasScenario && (
        <div className="mb-4 grid gap-2 rounded-2xl border border-violet-100 bg-violet-50/40 p-4 sm:grid-cols-3">
          <ScenarioField label="Inbound moderate" field={assignment.non_critical_patients} />
          <ScenarioField label="ETA (min)" field={assignment.eta_minutes} />
          <ScenarioField label="Impact zone" field={assignment.impact_zone} />
        </div>
      )}

      {!hasScenario && (
        <p className="mb-4 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No active scenario assignment. Upload a scenario on the command map to see routing load here.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-center">
          <p className="text-xs text-rose-600">Critical slots available</p>
          <p className="font-mono text-3xl font-bold text-slate-900">{remaining_slots.critical}</p>
          <p className="mt-1 text-xs text-slate-500">{scenario_load.critical} assigned · {capacity.critical_slots} surge max</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-center">
          <p className="text-xs text-amber-700">Moderate slots available</p>
          <p className="font-mono text-3xl font-bold text-slate-900">{remaining_slots.moderate}</p>
          <p className="mt-1 text-xs text-slate-500">{scenario_load.moderate} assigned · {capacity.moderate_slots} surge max</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-center">
          <p className="text-xs text-emerald-700">Minor slots available</p>
          <p className="font-mono text-3xl font-bold text-slate-900">{remaining_slots.minor}</p>
          <p className="mt-1 text-xs text-slate-500">{scenario_load.minor} assigned · {capacity.minor_slots} surge max</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-slate-700">{status.routing_advice}</p>

      <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-4">
        {status.evidence_notes.map((note) => (
          <li key={note} className="flex items-start gap-2 text-xs text-slate-500">
            <SourceBadge type="estimated" />
            <span>{note}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function ScenarioField({ label, field }: { label: string; field: FieldValue }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <p className="font-mono text-lg font-semibold text-slate-900">{fieldDisplay(field)}</p>
        <SourceBadge type={field.data_source_type} />
      </div>
    </div>
  )
}
