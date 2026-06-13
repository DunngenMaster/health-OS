import type { HospitalIntelligenceProfile } from '../types/hospitalIntelligence'
import type { EquipmentUpgrade, StaffingGap } from '../types/hospitalOsReport'
import { numericField } from './hospitalOsUtils'

export interface PlanActionItem {
  title: string
  detail: string
  evidence: string[]
  metric?: string
}

export interface DataDrivenActionPlan {
  '30_day_plan': PlanActionItem[]
  '60_day_plan': PlanActionItem[]
  '90_day_plan': PlanActionItem[]
}

function countSpecialty(profile: HospitalIntelligenceProfile, name: string): number {
  return profile.doctors.filter((d) => d.specialty.toLowerCase().includes(name.toLowerCase())).length
}

export function buildDataDrivenActionPlan(
  profile: HospitalIntelligenceProfile,
  staffingGaps: StaffingGap[],
  equipmentUpgrades: EquipmentUpgrade[]
): DataDrivenActionPlan {
  const beds = numericField(profile.capacity.total_beds, 180)
  const occupancy = numericField(profile.capacity.occupancy, 72)
  const available = Math.max(0, Math.round(beds * (1 - occupancy / 100)))
  const icuNurses = profile.nurses.icu_nurses.count
  const erNurses = profile.nurses.er_nurses.count
  const cardiologists = countSpecialty(profile, 'Cardiology')
  const emergencyMds = countSpecialty(profile, 'Emergency')
  const traumaMds = countSpecialty(profile, 'Trauma')
  const ventilators = profile.equipment.find((e) => /ventilator/i.test(e.name))?.count ?? 0

  const icuGap = Math.max(0, 10 - icuNurses)
  const erGap = Math.max(0, 12 - erNurses)
  const cardioGap = Math.max(0, 4 - cardiologists)
  const erMdGap = Math.max(0, 4 - emergencyMds)

  const plan30: PlanActionItem[] = []

  if (staffingGaps.length > 0 || icuGap > 0 || erGap > 0) {
    plan30.push({
      title: 'Staffing gap mitigation',
      detail: `Within 30 days: add ${icuGap > 0 ? `${icuGap} ICU nurses` : ''}${icuGap > 0 && erGap > 0 ? ' and ' : ''}${erGap > 0 ? `${erGap} ER nurses` : ''} (current ICU ${icuNurses}, ER ${erNurses} vs modeled thresholds).`,
      evidence: [`${beds} licensed beds at ${occupancy}% occupancy → ~${available} beds free`, `${profile.doctors.length} physicians on roster`],
      metric: `${icuGap + erGap} FTE gap (estimated)`
    })
  }

  if (erMdGap > 0 || cardioGap > 0) {
    plan30.push({
      title: 'Physician coverage review',
      detail: `Current roster: ${emergencyMds} emergency physicians, ${cardiologists} cardiologists, ${traumaMds} trauma surgeons. For surge readiness, target ≥4 EM and ≥4 cardiology — shortfall ${erMdGap + cardioGap} FTE (estimated).`,
      evidence: ['NPI registry physician specialties', 'Active scenario critical patient load'],
      metric: `${erMdGap + cardioGap} physician FTE gap`
    })
  }

  plan30.push({
    title: 'Post-incident process review',
    detail: `Activate surge checklist: verify ${ventilators} ventilators on hand, ICU bed clearing protocol, and ER triage lead briefing within 48 hours of scenario assignment.`,
    evidence: [`Equipment inventory: ${ventilators} ventilators`, `ICU nurses: ${icuNurses}`],
  })

  const plan60: PlanActionItem[] = []

  if (cardioGap > 0) {
    plan60.push({
      title: 'Staffing increase',
      detail: `Need ${cardioGap} additional cardiologist${cardioGap === 1 ? '' : 's'} within 60 days to cover cardiac arrest and surge cardiac load (currently ${cardiologists} on staff; target 4 for this bed count).`,
      evidence: [`Cardiology count from NPI: ${cardiologists}`, `${beds} beds · ${occupancy}% occupancy`],
      metric: `${cardioGap} cardiologists by day 60`
    })
  }

  if (traumaMds < 2) {
    plan60.push({
      title: 'Trauma surgical coverage',
      detail: `Recommend ${2 - traumaMds} trauma surgeon${2 - traumaMds === 1 ? '' : 's'} within 60 days — current count ${traumaMds} for a ${beds}-bed facility with active scenario routing.`,
      evidence: ['Trauma surgery specialty count from physician roster'],
      metric: `${2 - traumaMds} trauma surgeons`
    })
  }

  const topEquipment = equipmentUpgrades[0]
  if (topEquipment) {
    plan60.push({
      title: 'Critical equipment deployment',
      detail: `${topEquipment.equipment_name}: ${topEquipment.reason} Target inventory ${topEquipment.recommended_count ?? 'increase'} (currently ${topEquipment.current_count ?? 'low'}).`,
      evidence: [topEquipment.expected_impact, topEquipment.market_product ?? 'Lifecycle review'],
    })
  }

  plan60.push({
    title: 'Workforce flexibility enhancement',
    detail: `Cross-train ${Math.min(6, erNurses)} ER nurses on ICU overflow protocols; establish float pool activation when occupancy exceeds ${Math.min(85, occupancy + 10)}%.`,
    evidence: [`ER nurses: ${erNurses}`, `Current occupancy: ${occupancy}%`],
  })

  const plan90: PlanActionItem[] = [
    {
      title: 'Sustainable staffing',
      detail: `Maintain ICU ≥10 and ER ≥12 nurses; reassess physician mix quarterly — cardiology target 4, emergency medicine target 4 for ${profile.hospital_profile.name}.`,
      evidence: ['Staffing thresholds from facility model', 'NPI physician specialty breakdown'],
    },
    {
      title: 'Program assessment & scale',
      detail: `Re-run Hospital OS intelligence cycle; compare readiness trend against ${available} available beds baseline and scenario assignment load.`,
      evidence: ['Hospital memory improvement cycles', 'Chroma clinical evidence index'],
    },
    {
      title: 'Operational efficiency',
      detail: `Complete equipment lifecycle review for ${equipmentUpgrades.length} flagged items; measure imaging turnaround and ICU boarding time against 60-day targets.`,
      evidence: equipmentUpgrades.slice(0, 2).map((e) => e.equipment_name),
    }
  ]

  return {
    '30_day_plan': plan30,
    '60_day_plan': plan60,
    '90_day_plan': plan90
  }
}

export function findPlanDetail(
  plan: DataDrivenActionPlan,
  phase: keyof DataDrivenActionPlan,
  itemTitle: string
): PlanActionItem | undefined {
  const normalized = itemTitle.toLowerCase()
  return plan[phase].find((item) => item.title.toLowerCase() === normalized || normalized.includes(item.title.toLowerCase().slice(0, 12)))
}

export function planItemsToStrings(plan: DataDrivenActionPlan): {
  '30_day_plan': string[]
  '60_day_plan': string[]
  '90_day_plan': string[]
} {
  return {
    '30_day_plan': plan['30_day_plan'].map((i) => i.title),
    '60_day_plan': plan['60_day_plan'].map((i) => i.title),
    '90_day_plan': plan['90_day_plan'].map((i) => i.title)
  }
}
