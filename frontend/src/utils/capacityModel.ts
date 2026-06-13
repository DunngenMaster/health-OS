import type { HospitalIntelligenceProfile } from '../types/hospitalIntelligence'
import { numericField } from './hospitalOsUtils'

export interface SurgeCapacity {
  critical_slots: number
  moderate_slots: number
  minor_slots: number
  total_beds: number
  icu_beds: number
  available_beds: number
  occupancy_pct: number
  er_nurses: number
  methodology: string
}

export interface CommandCenterStatus {
  capacity: SurgeCapacity
  scenario_load: { critical: number; moderate: number; minor: number; total: number }
  remaining_slots: { critical: number; moderate: number; minor: number }
  status: 'open' | 'strained' | 'saturated'
  routing_advice: string
  evidence_notes: string[]
}

export function computeSurgeCapacity(profile: HospitalIntelligenceProfile): SurgeCapacity {
  const totalBeds = numericField(profile.capacity.total_beds, 180)
  const icuBeds = numericField(profile.capacity.icu_beds, Math.max(12, Math.round(totalBeds * 0.1)))
  const occupancy = numericField(profile.capacity.occupancy, 72)
  const availableBeds = Math.max(0, Math.round(totalBeds * (1 - occupancy / 100)))
  const erNurses = profile.nurses.er_nurses.count
  const icuNurses = profile.nurses.icu_nurses.count

  const criticalSlots = Math.max(
    2,
    Math.round(icuBeds * (1 - occupancy / 100) + icuNurses * 0.4 + erNurses * 0.25)
  )
  const moderateSlots = Math.max(4, Math.round(availableBeds * 0.32))
  const minorSlots = Math.max(8, Math.round(availableBeds * 0.42))

  return {
    critical_slots: criticalSlots,
    moderate_slots: moderateSlots,
    minor_slots: minorSlots,
    total_beds: totalBeds,
    icu_beds: icuBeds,
    available_beds: availableBeds,
    occupancy_pct: occupancy,
    er_nurses: erNurses,
    methodology: 'Derived from licensed bed count, ICU capacity, current occupancy, and nurse staffing — not scenario assignment.'
  }
}

export function buildCommandCenterStatus(profile: HospitalIntelligenceProfile): CommandCenterStatus {
  const capacity = computeSurgeCapacity(profile)
  const assignment = profile.capacity.scenario_assignment
  const scenarioLoad = {
    critical: numericField(assignment?.critical_patients, 0),
    moderate: numericField(assignment?.non_critical_patients, 0),
    minor: Math.max(0, numericField(assignment?.total_patients, 0) - numericField(assignment?.critical_patients, 0) - numericField(assignment?.non_critical_patients, 0)),
    total: numericField(assignment?.total_patients, 0)
  }

  const remaining = {
    critical: Math.max(0, capacity.critical_slots - scenarioLoad.critical),
    moderate: Math.max(0, capacity.moderate_slots - scenarioLoad.moderate),
    minor: Math.max(0, capacity.minor_slots - scenarioLoad.minor)
  }

  const loadRatio =
    (scenarioLoad.critical / Math.max(1, capacity.critical_slots) +
      scenarioLoad.moderate / Math.max(1, capacity.moderate_slots) +
      scenarioLoad.minor / Math.max(1, capacity.minor_slots)) /
    3

  const status: CommandCenterStatus['status'] =
    loadRatio >= 1 ? 'saturated' : loadRatio >= 0.75 ? 'strained' : 'open'

  const eta = numericField(assignment?.eta_minutes, 0)
  const congestion = String(assignment?.congestion?.value ?? '')

  let routing_advice: string
  if (status === 'saturated') {
    routing_advice = `Current scenario load (${scenarioLoad.total} patients) exceeds modeled surge capacity. Reroute new critical patients first; moderate overflow to partner facilities within ${eta || 15} min drive radius.`
  } else if (status === 'strained') {
    routing_advice = `Hospital can absorb assigned load but with limited headroom (${remaining.critical} critical, ${remaining.moderate} moderate slots remaining). Pre-alert ICU and imaging.${congestion ? ` Route congestion: ${congestion}.` : ''}`
  } else {
    routing_advice = `Hospital has capacity for assigned scenario load with ${remaining.critical} critical, ${remaining.moderate} moderate, and ${remaining.minor} minor slots available.`
  }

  return {
    capacity,
    scenario_load: scenarioLoad,
    remaining_slots: remaining,
    status,
    routing_advice,
    evidence_notes: [
      `${capacity.total_beds} licensed beds at ${capacity.occupancy_pct}% occupancy → ~${capacity.available_beds} beds available`,
      `ICU: ${capacity.icu_beds} beds · ER nursing: ${capacity.er_nurses} FTE`,
      'Capacity model follows AHA bed surge planning guidance (not individual patient assignment counts)'
    ]
  }
}

export function computePressureScore(
  incoming: { critical: number; moderate: number; minor: number },
  capacity: SurgeCapacity
): number {
  const ratios = [
    incoming.critical / Math.max(1, capacity.critical_slots),
    incoming.moderate / Math.max(1, capacity.moderate_slots),
    incoming.minor / Math.max(1, capacity.minor_slots)
  ]
  return Math.min(100, Math.round((ratios.reduce((a, b) => a + b, 0) / 3) * 100))
}
