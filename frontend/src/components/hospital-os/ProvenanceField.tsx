import type { DataSourceType } from '../../types/hospitalIntelligence'
import { SourceBadge } from '../SourceBadge'

export interface ProvenanceInfo {
  label: string
  value: string | number
  data_source_type: DataSourceType
  source?: string
  confidence?: string
}

export function ProvenanceField({ info }: { info: ProvenanceInfo }) {
  return (
    <button
      type="button"
      className="group relative w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-violet-200 hover:shadow-md"
      title="Click for data provenance"
      onClick={(e) => {
        const target = e.currentTarget
        target.classList.toggle('provenance-open')
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-widest text-slate-400">{info.label}</p>
        <SourceBadge type={info.data_source_type} />
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{info.value}</p>

      <div className="provenance-panel pointer-events-none absolute left-0 right-0 top-full z-20 mt-2 hidden rounded-2xl border border-violet-200 bg-white p-4 text-sm shadow-xl group-[.provenance-open]:block">
        <p className="text-xs font-medium uppercase tracking-widest text-violet-500">Data provenance</p>
        <dl className="mt-2 space-y-1 text-slate-600">
          <div className="flex justify-between gap-4"><dt>Source type</dt><dd className="font-medium capitalize">{info.data_source_type}</dd></div>
          {info.source && <div><dt className="text-slate-400">Source</dt><dd>{info.source}</dd></div>}
          {info.confidence && <div className="flex justify-between gap-4"><dt>Confidence</dt><dd className="font-medium">{info.confidence}</dd></div>}
        </dl>
        <p className="mt-2 text-xs text-slate-400">Click again to close</p>
      </div>
    </button>
  )
}

export function fieldToProvenance(label: string, field: { value: string | number | boolean | null; data_source_type: DataSourceType; source?: string }, confidence = 'medium'): ProvenanceInfo {
  return {
    label,
    value: field.value === null || field.value === undefined ? 'Unavailable' : String(field.value),
    data_source_type: field.data_source_type,
    source: field.source,
    confidence
  }
}
