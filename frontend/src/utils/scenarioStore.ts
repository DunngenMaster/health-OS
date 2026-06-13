import type { HospitalRecommendation } from './scenarioUtils'

const SCENARIO_CONTEXT_KEY = 'active-scenario-context'
const SCENARIO_HOSPITALS_KEY = 'scenario-hospitals-registry'

export interface ScenarioHospitalEntry {
  hospitalId: string
  name: string
  latitude: number
  longitude: number
  criticalAssigned: number
  nonCriticalAssigned: number
  etaMinutes?: number
  impactZone?: string
  scenarioId: string
  scenarioName: string
  updatedAt: string
}

export interface ActiveScenarioContext {
  scenarioId: string
  scenarioName: string
  scenarioType: string
  updatedAt: string
  hospitals: ScenarioHospitalEntry[]
}

export function makeHospitalId(name: string, lat: number, lng: number): string {
  const raw = `${name}|${lat.toFixed(5)}|${lng.toFixed(5)}`.toLowerCase()
  let hash = 0
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i)
    hash |= 0
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0')
  return hex.slice(0, 16)
}

export function saveScenarioContext(
  scenarioId: string,
  scenarioName: string,
  scenarioType: string,
  hospitals: Array<HospitalRecommendation & { impactZone?: string; etaMinutes?: number }>
) {
  const entries: ScenarioHospitalEntry[] = hospitals.map((hospital) => ({
    hospitalId: makeHospitalId(hospital.hospital_name, hospital.latitude, hospital.longitude),
    name: hospital.hospital_name,
    latitude: hospital.latitude,
    longitude: hospital.longitude,
    criticalAssigned: hospital.critical_handled,
    nonCriticalAssigned: hospital.non_critical_handled,
    etaMinutes: hospital.etaMinutes,
    impactZone: hospital.impactZone,
    scenarioId,
    scenarioName,
    updatedAt: new Date().toISOString()
  }))

  const unique = new Map<string, ScenarioHospitalEntry>()
  for (const entry of entries) {
    unique.set(entry.hospitalId, entry)
  }

  const context: ActiveScenarioContext = {
    scenarioId,
    scenarioName,
    scenarioType,
    updatedAt: new Date().toISOString(),
    hospitals: [...unique.values()]
  }

  localStorage.setItem(SCENARIO_CONTEXT_KEY, JSON.stringify(context))
  localStorage.setItem(SCENARIO_HOSPITALS_KEY, JSON.stringify([...unique.values()]))
  window.dispatchEvent(new CustomEvent('healthos-scenario-updated', { detail: context }))
}

export function readScenarioContext(): ActiveScenarioContext | null {
  const raw = localStorage.getItem(SCENARIO_CONTEXT_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ActiveScenarioContext
  } catch {
    return null
  }
}

export function readScenarioHospitals(): ScenarioHospitalEntry[] {
  const raw = localStorage.getItem(SCENARIO_HOSPITALS_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as ScenarioHospitalEntry[]
  } catch {
    return []
  }
}

export function getScenarioAssignmentForHospital(hospitalId: string): ScenarioHospitalEntry | null {
  return readScenarioHospitals().find((h) => h.hospitalId === hospitalId) ?? null
}

export function applyScenarioAssignmentToProfile<T extends { hospital_profile: { hospital_id: string }; capacity: { scenario_assignment: Record<string, { value: unknown; data_source_type: string; source?: string }> } }>(
  profile: T,
  assignment: ScenarioHospitalEntry
): T {
  return {
    ...profile,
    capacity: {
      ...profile.capacity,
      scenario_assignment: {
        ...profile.capacity.scenario_assignment,
        critical_patients: {
          value: assignment.criticalAssigned,
          data_source_type: 'estimated',
          source: `Live scenario replay: ${assignment.scenarioName}`
        },
        non_critical_patients: {
          value: assignment.nonCriticalAssigned,
          data_source_type: 'estimated',
          source: `Live scenario replay: ${assignment.scenarioName}`
        },
        total_patients: {
          value: assignment.criticalAssigned + assignment.nonCriticalAssigned,
          data_source_type: 'estimated',
          source: `Live scenario replay: ${assignment.scenarioName}`
        },
        eta_minutes: {
          value: assignment.etaMinutes ?? null,
          data_source_type: 'estimated',
          source: 'Scenario route estimate'
        },
        impact_zone: {
          value: assignment.impactZone ?? assignment.scenarioName,
          data_source_type: 'estimated',
          source: 'Active scenario impact zone'
        }
      }
    }
  }
}
