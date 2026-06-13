import { useMemo, useState } from 'react'
import type { HospitalIntelligenceProfile } from '../../types/hospitalIntelligence'
import type { EquipmentUpgrade, HospitalAiRecommendation, StaffingGap } from '../../types/hospitalOsReport'
import {
  buildDataDrivenActionPlan,
  type PlanActionItem
} from '../../utils/actionPlanEngine'
import { SourceBadge } from '../SourceBadge'

const PLAN_META = {
  '30_day_plan': {
    label: '30 days',
    title: 'Immediate response',
    subtitle: 'Stabilize staffing, run drills, close urgent gaps',
    accent: 'border-violet-200 bg-violet-50',
    badge: 'bg-violet-600 text-white'
  },
  '60_day_plan': {
    label: '60 days',
    title: 'Build capacity',
    subtitle: 'Training, workflow upgrades, department alignment',
    accent: 'border-sky-200 bg-sky-50',
    badge: 'bg-sky-600 text-white'
  },
  '90_day_plan': {
    label: '90 days',
    title: 'Sustain improvement',
    subtitle: 'Track trends, resolve weaknesses, re-assess readiness',
    accent: 'border-emerald-200 bg-emerald-50',
    badge: 'bg-emerald-600 text-white'
  }
} as const

type PlanKey = keyof typeof PLAN_META

interface SelectedItem {
  phase: PlanKey
  item: PlanActionItem
}

interface ActionPlanTimelineProps {
  recommendations: HospitalAiRecommendation
  profile: HospitalIntelligenceProfile
  staffingGaps: StaffingGap[]
  equipmentUpgrades: EquipmentUpgrade[]
}

export function ActionPlanTimeline({ recommendations, profile, staffingGaps, equipmentUpgrades }: ActionPlanTimelineProps) {
  const dataPlan = useMemo(
    () => buildDataDrivenActionPlan(profile, staffingGaps, equipmentUpgrades),
    [profile, staffingGaps, equipmentUpgrades]
  )
  const [selected, setSelected] = useState<SelectedItem | null>(null)

  const plans = (['30_day_plan', '60_day_plan', '90_day_plan'] as const).map((key) => ({
    key,
    items: dataPlan[key],
    meta: PLAN_META[key]
  }))

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xs font-medium uppercase tracking-[0.3em] text-slate-400">Improvement roadmap</h2>
        <p className="mt-1 text-sm text-slate-500">
          Data-driven 30 · 60 · 90 day actions from roster, beds, and scenario load — tap any item for specifics
        </p>
      </div>

      <div className="relative grid gap-6 md:grid-cols-3">
        <div className="absolute left-0 right-0 top-8 hidden h-0.5 bg-gradient-to-r from-violet-200 via-sky-200 to-emerald-200 md:block" />

        {plans.map(({ key, items, meta }, phaseIndex) => (
          <div key={key} className={`relative rounded-2xl border p-5 ${meta.accent}`}>
            <div className="mb-4 flex items-center gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${meta.badge}`}>
                {meta.label.split(' ')[0]}
              </span>
              <div className="text-left">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{meta.label}</p>
                <p className="font-semibold text-slate-900">{meta.title}</p>
              </div>
            </div>
            <p className="mb-4 text-left text-xs leading-relaxed text-slate-600">{meta.subtitle}</p>
            <ol className="space-y-3 text-left">
              {items.map((item, index) => {
                const isActive = selected?.phase === key && selected.item.title === item.title
                return (
                  <li key={`${key}-${item.title}`}>
                    <button
                      type="button"
                      onClick={() => setSelected(isActive ? null : { phase: key, item })}
                      className={`flex w-full gap-3 rounded-xl p-3 text-left text-sm shadow-sm transition ${
                        isActive
                          ? 'bg-white ring-2 ring-violet-300'
                          : 'bg-white/80 text-slate-700 hover:bg-white hover:ring-1 hover:ring-slate-200'
                      }`}
                    >
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${meta.badge}`}>
                        {phaseIndex * 3 + index + 1}
                      </span>
                      <span className="leading-snug">
                        <span className="font-medium text-slate-900">{item.title}</span>
                        {item.metric && <span className="mt-0.5 block text-xs text-violet-600">{item.metric}</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        ))}
      </div>

      {selected && (
        <div className="mt-6 rounded-2xl border border-violet-200 bg-violet-50/50 p-5 text-left">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-violet-600">{PLAN_META[selected.phase].label} · detail</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{selected.item.title}</h3>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-500 hover:border-violet-200"
            >
              Close
            </button>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">{selected.item.detail}</p>
          {selected.item.evidence.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-violet-100 pt-4">
              {selected.item.evidence.map((line) => (
                <li key={line} className="flex items-start gap-2 text-xs text-slate-600">
                  <SourceBadge type="estimated" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-4 text-center text-xs text-slate-500">
        Estimates derived from NPI physician roster, nurse counts, bed occupancy, and active scenario assignment
        {recommendations.gemini_powered && <span className="text-violet-600"> · AI cycle completed</span>}
      </p>
    </section>
  )
}
