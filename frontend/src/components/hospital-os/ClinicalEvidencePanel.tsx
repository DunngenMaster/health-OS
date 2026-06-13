import type { RagResearchReport } from '../../types/hospitalOsReport'
import { SourceBadge } from '../SourceBadge'

interface ClinicalEvidencePanelProps {
  report: RagResearchReport
}

export function ClinicalEvidencePanel({ report }: ClinicalEvidencePanelProps) {
  const indexed = report.sources_indexed ?? 0
  if (!indexed && !report.findings.length) return null

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-slate-400">Clinical evidence agent</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Retrieved operational evidence</h2>
          <p className="mt-1 text-sm text-slate-500">
            Semantic search over hospital profile, staffing, and scenario context via {report.retrieval_engine ?? 'ChromaDB'}.
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
          {indexed} chunks indexed
        </span>
      </div>

      <div className="space-y-3">
        {report.findings.map((finding) => (
          <div key={finding.query} className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">{finding.query}</p>
              <SourceBadge type={finding.data_source_type} />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{finding.summary}</p>
            <p className="mt-1 text-xs text-slate-400">
              {finding.retrieved_chunks} match{finding.retrieved_chunks === 1 ? '' : 'es'} · confidence {finding.confidence}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
