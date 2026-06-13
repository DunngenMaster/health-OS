import type { FieldValue, HospitalIntelligenceProfile } from '../../types/hospitalIntelligence'
import { buildDashboardMetrics, fieldDisplay } from '../../utils/hospitalOsUtils'
import { SourceBadge } from '../SourceBadge'

interface FacilitySnapshotProps {
  profile: HospitalIntelligenceProfile
}

export function FacilitySnapshot({ profile }: FacilitySnapshotProps) {
  const metrics = buildDashboardMetrics(profile)
  const { doctors, nurses, equipment } = profile

  const realDoctorCount = doctors.filter((d) => d.data_source_type === 'real').length

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-slate-400">Hospital data agent</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">Facility snapshot</h2>
        <p className="mt-1 text-sm text-slate-500">Licensed capacity and roster from NPI registry, CMS, and hospital profile.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SnapshotMetric label="Total beds" field={metrics.totalBeds} />
        <SnapshotMetric label="ICU beds" field={metrics.icuBeds} />
        <SnapshotMetric label="Available beds" field={metrics.availableBeds} />
        <SnapshotMetric label="Physicians" value={`${realDoctorCount} verified / ${doctors.length}`} type={realDoctorCount > 0 ? 'real' : 'estimated'} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-400">Nursing</p>
          <div className="space-y-1.5">
            {Object.entries(nurses).map(([dept, nurse]) => (
              <div key={dept} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                <span className="capitalize text-slate-700">{dept.replaceAll('_', ' ')}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">{nurse.count}</span>
                  <SourceBadge type={nurse.data_source_type} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-400">Equipment on hand</p>
          <div className="space-y-1.5">
            {equipment.map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-700">{item.name}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold">{item.count}</span>
                  <SourceBadge type={item.data_source_type} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function SnapshotMetric({
  label,
  field,
  value,
  type
}: {
  label: string
  field?: FieldValue
  value?: string
  type?: 'real' | 'estimated' | 'simulated' | 'unavailable'
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">{label}</p>
        <SourceBadge type={field?.data_source_type ?? type ?? 'estimated'} />
      </div>
      <p className="mt-1 font-mono text-2xl font-bold text-slate-900">{value ?? (field ? fieldDisplay(field) : '—')}</p>
    </div>
  )
}
