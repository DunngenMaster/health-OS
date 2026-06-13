import type { DataSourceType, FieldValue, HospitalIntelligenceProfile } from '../types/hospitalIntelligence'
import { sourceBadge } from '../types/hospitalIntelligence'

interface HospitalManagementPanelProps {
  hospitalName: string
  isLoading: boolean
  error: string | null
  profile: HospitalIntelligenceProfile | null
  onClose: () => void
}

function Badge({ type }: { type: DataSourceType }) {
  const badge = sourceBadge(type)
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide ${badge.className}`}>
      {badge.label}
    </span>
  )
}

function FieldRow({ label, field }: { label: string; field?: FieldValue }) {
  if (!field) return null
  const display = field.value === null || field.value === undefined || field.value === ''
    ? 'Unavailable'
    : String(field.value)

  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
      <div>
        <p className="text-xs text-white/55">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-white">{display}</p>
        {field.source && <p className="mt-1 text-[11px] text-white/40">{field.source}</p>}
      </div>
      <Badge type={field.data_source_type} />
    </div>
  )
}

export default function HospitalManagementPanel({
  hospitalName,
  isLoading,
  error,
  profile,
  onClose
}: HospitalManagementPanelProps) {
  return (
    <div className="absolute bottom-4 left-4 z-30 flex h-[calc(100vh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/80 shadow-2xl backdrop-blur-xl">
      <div className="flex items-start justify-between border-b border-white/10 px-4 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-sky-300">Hospital Management OS</p>
          <h2 className="mt-1 text-lg font-semibold text-white">{hospitalName}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/70 hover:bg-white/10"
        >
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading && (
          <div className="flex h-full min-h-48 flex-col items-center justify-center text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
            <p className="mt-3 text-sm font-semibold text-sky-100">Collecting hospital intelligence...</p>
            <p className="mt-1 text-xs text-white/60">Orchestrator is querying identity, capacity, physicians, nurses, and equipment agents.</p>
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-100">
            {error}
          </div>
        )}

        {profile && !isLoading && (
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-rose-300">1. Hospital Overview</h3>
              <div className="space-y-2 text-sm">
                <p className="text-white/80">{profile.hospital_profile.address}</p>
                <p className="text-white/70">Phone: {profile.hospital_profile.phone || 'Unavailable'}</p>
                <p className="text-white/70">
                  Website:{' '}
                  {profile.hospital_profile.website ? (
                    <a href={profile.hospital_profile.website} target="_blank" rel="noreferrer" className="text-sky-300 hover:underline">
                      {profile.hospital_profile.website}
                    </a>
                  ) : (
                    'Unavailable'
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
                    Confidence: {profile.hospital_profile.data_confidence}
                  </span>
                  {profile.hospital_profile.sources.map((source) => (
                    <span key={source} className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/60">
                      {source}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-amber-300">2. Estimated Patient Capacity</h3>
              <p className="mb-2 text-[11px] text-white/45">Gemini dispatch estimates for this scenario — not live bed availability.</p>
              <div className="space-y-2">
                <FieldRow label="Critical patients" field={profile.capacity.scenario_assignment?.critical_patients} />
                <FieldRow label="Non-critical patients" field={profile.capacity.scenario_assignment?.non_critical_patients} />
                <FieldRow label="Total assigned" field={profile.capacity.scenario_assignment?.total_patients} />
                <FieldRow label="Route ETA" field={profile.capacity.scenario_assignment?.eta_minutes} />
                <FieldRow label="Route distance (km)" field={profile.capacity.scenario_assignment?.distance_km} />
                <FieldRow label="Traffic" field={profile.capacity.scenario_assignment?.congestion} />
                <FieldRow label="Impact zone" field={profile.capacity.scenario_assignment?.impact_zone} />
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300">3. Doctors</h3>
              <p className="mb-2 text-[11px] text-white/45">
                Physicians listed only if their NPI practice address matches this hospital ZIP or name. On-duty status is not available.
              </p>
              <div className="space-y-2">
                {profile.doctors.length === 0 ? (
                  <p className="text-sm text-white/60">No physicians with a verified practice location at this hospital were found in the public NPI registry.</p>
                ) : (
                  profile.doctors.map((doctor) => (
                    <div key={`${doctor.npi}-${doctor.name}`} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-white">{doctor.name}</p>
                          <p className="text-xs text-white/70">{doctor.specialty}</p>
                          <p className="text-xs text-white/50">{doctor.organization}</p>
                          {doctor.practice_location && (
                            <p className="text-[11px] text-white/40">Practice: {doctor.practice_location}</p>
                          )}
                          {doctor.npi && <p className="text-[11px] text-white/40">NPI: {doctor.npi}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge type={doctor.data_source_type} />
                          {doctor.affiliation_match === 'at_hospital' && (
                            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                              AT HOSPITAL
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-violet-300">4. Nurses</h3>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(profile.nurses).map(([key, nurse]) => (
                  <div key={key} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs capitalize text-white/55">{key.replaceAll('_', ' ')}</p>
                      <Badge type={nurse.data_source_type} />
                    </div>
                    <p className="mt-1 text-lg font-semibold text-white">{nurse.count}</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">5. Equipment</h3>
              <div className="space-y-2">
                {profile.equipment.map((item) => (
                  <div key={item.name} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                    <div>
                      <p className="font-semibold text-white">{item.name}</p>
                      <p className="text-sm text-white/70">Count: {item.count}</p>
                    </div>
                    <Badge type={item.data_source_type} />
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-fuchsia-300">6. AI Recommendation</h3>
              <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-white/6 p-2">
                    <p className="text-white/50">Critical</p>
                    <p className="text-lg font-bold text-rose-200">{profile.ai_recommendation.can_accept.critical_patients}</p>
                  </div>
                  <div className="rounded-lg bg-white/6 p-2">
                    <p className="text-white/50">Non-critical</p>
                    <p className="text-lg font-bold text-emerald-200">{profile.ai_recommendation.can_accept.moderate_patients}</p>
                  </div>
                </div>
                <p className="text-sm text-white/80">{profile.ai_recommendation.routing_advice}</p>
                {profile.ai_recommendation.resource_gaps.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Resource gaps</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-white/70">
                      {profile.ai_recommendation.resource_gaps.map((gap) => (
                        <li key={gap}>{gap}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {profile.ai_recommendation.staffing_recommendations.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Staffing</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-white/70">
                      {profile.ai_recommendation.staffing_recommendations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {profile.ai_recommendation.equipment_recommendations.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/50">Equipment</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-white/70">
                      {profile.ai_recommendation.equipment_recommendations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
