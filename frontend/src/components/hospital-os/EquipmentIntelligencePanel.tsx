import type { EquipmentUpgrade } from '../../types/hospitalOsReport'
import { SourceBadge } from '../SourceBadge'
import { urgencyClass } from '../../utils/hospitalOsApi'

interface EquipmentIntelligencePanelProps {
  upgrades: EquipmentUpgrade[]
}

const categoryLabels: Record<string, string> = {
  lifecycle: 'Lifecycle replacement',
  market_innovation: 'Market innovation',
  replacement: 'Replacement candidate'
}

export function EquipmentIntelligencePanel({ upgrades }: EquipmentIntelligencePanelProps) {
  if (!upgrades.length) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-xs font-medium uppercase tracking-[0.3em] text-slate-400">Equipment lifecycle & market agent</h2>
        <p className="mt-3 text-sm text-slate-500">No equipment actions flagged — inventory within modeled lifecycle thresholds.</p>
      </section>
    )
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-slate-400">Equipment lifecycle & market agent</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">Replacement & innovation intelligence</h2>
        <p className="mt-1 text-sm text-slate-500">
          Based on equipment age, inventory levels, and verified market products — not tied to individual incidents.
        </p>
      </div>

      <div className="space-y-4">
        {upgrades.map((item, index) => (
          <div
            key={`${item.equipment_name}-${item.action}-${index}`}
            className={`rounded-2xl border p-4 text-sm ${urgencyClass(item.urgency)}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{item.equipment_name}</p>
                <p className="text-xs capitalize text-slate-500">
                  {categoryLabels[item.category ?? 'replacement'] ?? item.action.replaceAll('_', ' ')}
                  {item.agent_source && ` · ${item.agent_source}`}
                </p>
              </div>
              <SourceBadge type={item.data_source_type} />
            </div>

            {item.market_product && (
              <p className="mt-2 font-medium text-slate-800">{item.market_product}</p>
            )}
            <p className="mt-1 text-slate-600">{item.reason}</p>
            <p className="mt-1 text-xs text-slate-500">{item.expected_impact}</p>

            {item.estimated_age_years != null && item.typical_lifespan_years != null && (
              <p className="mt-2 text-xs text-slate-500">
                Estimated age ~{item.estimated_age_years}y · typical lifecycle {item.typical_lifespan_years}y
                {item.current_count != null && item.recommended_count != null && (
                  <span> · inventory {item.current_count} → target {item.recommended_count}</span>
                )}
              </p>
            )}

            {item.evidence_url && (
              <a
                href={item.evidence_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-violet-600 hover:underline"
              >
                {item.evidence_label ?? 'View evidence'} ↗
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
