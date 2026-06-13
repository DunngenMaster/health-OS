import type { HospitalIntelligenceProfile } from '../types/hospitalIntelligence'
import { buildCommandCenterStatus, computePressureScore, computeSurgeCapacity } from './capacityModel'
import { numericField, runReadinessCheck, type IncomingPatients, type ReadinessCheckResult } from './hospitalOsUtils'

export interface ScenarioSimulatorResult extends ReadinessCheckResult {
  total_incoming: number
  capacity: {
    critical: number
    moderate: number
    minor: number
    total: number
  }
  overflow: {
    critical: number
    moderate: number
    minor: number
  }
  routing_advice: string
}

export function getSimulatorDefaults(profile: HospitalIntelligenceProfile): IncomingPatients {
  const assignment = profile.capacity.scenario_assignment
  return {
    critical: Math.max(0, numericField(assignment?.critical_patients, 4)),
    moderate: Math.max(0, numericField(assignment?.non_critical_patients, 12)),
    minor: Math.max(0, numericField(assignment?.total_patients, 16) - numericField(assignment?.critical_patients, 4) - numericField(assignment?.non_critical_patients, 12))
  }
}

export function runScenarioSimulation(
  profile: HospitalIntelligenceProfile,
  incoming: IncomingPatients
): ScenarioSimulatorResult {
  const surge = computeSurgeCapacity(profile)
  const capacity = {
    critical: surge.critical_slots,
    moderate: surge.moderate_slots,
    minor: surge.minor_slots,
    total: surge.critical_slots + surge.moderate_slots + surge.minor_slots
  }

  const base = runReadinessCheck(profile, incoming, surge)

  const overflow = {
    critical: Math.max(0, incoming.critical - capacity.critical),
    moderate: Math.max(0, incoming.moderate - capacity.moderate),
    minor: Math.max(0, incoming.minor - capacity.minor)
  }

  const command = buildCommandCenterStatus(profile)
  let routing_advice = command.routing_advice
  if (!base.can_handle) {
    const parts = []
    if (overflow.critical > 0) parts.push(`${overflow.critical} critical`)
    if (overflow.moderate > 0) parts.push(`${overflow.moderate} moderate`)
    if (overflow.minor > 0) parts.push(`${overflow.minor} minor`)
    routing_advice = `Incoming load exceeds hospital surge capacity (${surge.available_beds} beds available at ${surge.occupancy_pct}% occupancy). Reroute ${parts.join(', ')} patients to partner facilities.`
  } else if (base.pressure_score >= 75) {
    routing_advice = 'Hospital can absorb this load but at high pressure — activate surge staffing and pre-alert ICU.'
  }

  return {
    ...base,
    total_incoming: incoming.critical + incoming.moderate + incoming.minor,
    capacity,
    overflow,
    routing_advice
  }
}

export function pressureTone(score: number): string {
  if (score >= 85) return 'bg-rose-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-emerald-500'
}

export function pressurePercent(incoming: number, capacity: number): number {
  if (capacity <= 0) return incoming > 0 ? 100 : 0
  return Math.min(100, Math.round((incoming / capacity) * 100))
}

export { computePressureScore }
