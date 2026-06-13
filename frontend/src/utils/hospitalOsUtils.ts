import type { DataSourceType, FieldValue, HospitalIntelligenceProfile } from '../types/hospitalIntelligence'

const PROFILE_STORAGE_PREFIX = 'hospital-profile-'
const MEMORY_STORAGE_PREFIX = 'hospital-memory-'

export interface IncomingPatients {
  critical: number
  moderate: number
  minor: number
}

export interface ReadinessCheckResult {
  can_handle: boolean
  verdict: string
  critical_ok: boolean
  moderate_ok: boolean
  minor_ok: boolean
  pressure_score: number
}

export interface DashboardMetrics {
  totalBeds: FieldValue
  availableBeds: FieldValue
  icuBeds: FieldValue
  erLoad: FieldValue
  criticalCapacity: FieldValue
  moderateCapacity: FieldValue
  staffShortageCount: FieldValue
  equipmentAlerts: FieldValue
}

export interface ReadinessBreakdown {
  score: number
  factors: Array<{ label: string; score: number; weight: number }>
}

export function cacheHospitalProfile(profile: HospitalIntelligenceProfile) {
  const id = profile.hospital_profile.hospital_id
  localStorage.setItem(`${PROFILE_STORAGE_PREFIX}${id}`, JSON.stringify(profile))
}

export function readCachedHospitalProfile(hospitalId: string): HospitalIntelligenceProfile | null {
  const raw = localStorage.getItem(`${PROFILE_STORAGE_PREFIX}${hospitalId}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as HospitalIntelligenceProfile
  } catch {
    return null
  }
}

export function readCachedHospitalMemory(hospitalId: string) {
  const raw = localStorage.getItem(`${MEMORY_STORAGE_PREFIX}${hospitalId}`)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function cacheHospitalMemory(hospitalId: string, memory: unknown) {
  localStorage.setItem(`${MEMORY_STORAGE_PREFIX}${hospitalId}`, JSON.stringify(memory))
}

export async function fetchHospitalProfileById(
  apiBase: string,
  hospitalId: string
): Promise<HospitalIntelligenceProfile> {
  const response = await fetch(`${apiBase}/api/v1/hospital-intelligence/${hospitalId}`)
  if (!response.ok) {
    throw new Error(`Hospital profile not found (${response.status})`)
  }
  return response.json()
}

export function fieldDisplay(field?: FieldValue, fallback = 'Unavailable') {
  if (!field || field.value === null || field.value === undefined || field.value === '') {
    return fallback
  }
  return String(field.value)
}

export function numericField(field?: FieldValue, fallback = 0) {
  const value = field?.value
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

export function buildDashboardMetrics(profile: HospitalIntelligenceProfile): DashboardMetrics {
  const assignment = profile.capacity.scenario_assignment
  const totalBeds = profile.capacity.total_beds
  const icuBeds = profile.capacity.icu_beds
  const totalBedValue = numericField(totalBeds, numericField(assignment?.total_patients, 0) * 2 || 200)
  const occupancy = numericField(profile.capacity.occupancy, 65)
  const available = Math.max(0, Math.round(totalBedValue * (1 - occupancy / 100)))

  const nurseTotal = Object.values(profile.nurses).reduce((sum, nurse) => sum + nurse.count, 0)
  const simulatedNurseDepts = Object.values(profile.nurses).filter((nurse) => nurse.data_source_type === 'simulated').length
  const equipmentAlerts = profile.equipment.filter((item) => item.count <= 2).length

  return {
    totalBeds: totalBeds.value != null
      ? totalBeds
      : { value: totalBedValue, data_source_type: 'estimated', source: 'Derived from scenario assignment scale' },
    availableBeds: {
      value: available,
      data_source_type: profile.capacity.occupancy.value == null ? 'estimated' : 'real',
      source: profile.capacity.occupancy.value == null
        ? 'Estimated from assumed 65% occupancy'
        : profile.capacity.occupancy.source
    },
    icuBeds: icuBeds.value != null
      ? icuBeds
      : {
          value: numericField(assignment?.critical_patients, profile.ai_recommendation.can_accept.critical_patients),
          data_source_type: 'estimated',
          source: 'Derived from critical patient assignment'
        },
    erLoad: {
      value: `${profile.nurses.er_nurses.count} ER nurses`,
      data_source_type: profile.nurses.er_nurses.data_source_type,
      source: profile.nurses.er_nurses.source || 'Nurse staffing model'
    },
    criticalCapacity: assignment?.critical_patients ?? {
      value: profile.ai_recommendation.can_accept.critical_patients,
      data_source_type: 'estimated',
      source: 'AI recommendation capacity'
    },
    moderateCapacity: assignment?.non_critical_patients ?? {
      value: profile.ai_recommendation.can_accept.moderate_patients,
      data_source_type: 'estimated',
      source: 'AI recommendation capacity'
    },
    staffShortageCount: {
      value: simulatedNurseDepts + (profile.ai_recommendation.staffing_recommendations.length > 0 ? 1 : 0),
      data_source_type: simulatedNurseDepts > 0 ? 'simulated' : 'estimated',
      source: `Modeled from ${nurseTotal} total nurses and staffing recommendations`
    },
    equipmentAlerts: {
      value: equipmentAlerts,
      data_source_type: 'estimated',
      source: 'Equipment items at or below threshold count of 2'
    }
  }
}

export function calculateReadinessScore(profile: HospitalIntelligenceProfile): ReadinessBreakdown {
  const metrics = buildDashboardMetrics(profile)
  const doctors = profile.doctors.length
  const nurseTotal = Object.values(profile.nurses).reduce((sum, nurse) => sum + nurse.count, 0)
  const equipmentTotal = profile.equipment.reduce((sum, item) => sum + item.count, 0)

  const factors = [
    {
      label: 'Bed capacity',
      score: Math.min(100, Math.round((numericField(metrics.availableBeds) / Math.max(1, numericField(metrics.totalBeds))) * 100)),
      weight: 0.2
    },
    {
      label: 'ICU availability',
      score: Math.min(100, numericField(metrics.icuBeds) * 4),
      weight: 0.2
    },
    {
      label: 'Trauma support',
      score: profile.capacity.emergency_services.value ? 85 : 55,
      weight: 0.1
    },
    {
      label: 'Doctor coverage',
      score: Math.min(100, doctors * 12),
      weight: 0.15
    },
    {
      label: 'Nurse coverage',
      score: Math.min(100, nurseTotal * 2),
      weight: 0.2
    },
    {
      label: 'Equipment availability',
      score: Math.min(100, equipmentTotal * 3),
      weight: 0.15
    }
  ]

  const score = Math.round(
    factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0)
  )

  return { score, factors }
}

export function runReadinessCheck(
  profile: HospitalIntelligenceProfile,
  incoming: IncomingPatients,
  surgeOverride?: { critical_slots: number; moderate_slots: number; minor_slots: number }
): ReadinessCheckResult {
  const canAccept = surgeOverride
    ? {
        critical_patients: surgeOverride.critical_slots,
        moderate_patients: surgeOverride.moderate_slots,
        minor_patients: surgeOverride.minor_slots
      }
    : profile.ai_recommendation.can_accept
  const criticalOk = incoming.critical <= canAccept.critical_patients
  const moderateOk = incoming.moderate <= canAccept.moderate_patients
  const minorOk = incoming.minor <= canAccept.minor_patients
  const canHandle = criticalOk && moderateOk && minorOk

  const pressure = (
    (incoming.critical / Math.max(1, canAccept.critical_patients)) +
    (incoming.moderate / Math.max(1, canAccept.moderate_patients)) +
    (incoming.minor / Math.max(1, canAccept.minor_patients || 1))
  ) / 3

  const verdict = canHandle
    ? 'Incoming load fits within modeled hospital surge capacity.'
    : 'Incoming load exceeds modeled surge capacity. Consider rerouting overflow patients.'

  return {
    can_handle: canHandle,
    verdict,
    critical_ok: criticalOk,
    moderate_ok: moderateOk,
    minor_ok: minorOk,
    pressure_score: Math.min(100, Math.round(pressure * 100))
  }
}

export function collectDataTransparency(profile: HospitalIntelligenceProfile) {
  const buckets: Record<DataSourceType, number> = {
    real: 0,
    estimated: 0,
    simulated: 0,
    unavailable: 0
  }

  const visit = (field?: FieldValue) => {
    if (!field) return
    buckets[field.data_source_type] += 1
  }

  visit(profile.capacity.scenario_assignment?.critical_patients)
  visit(profile.capacity.scenario_assignment?.non_critical_patients)
  visit(profile.capacity.scenario_assignment?.total_patients)
  visit(profile.capacity.scenario_assignment?.eta_minutes)
  visit(profile.capacity.total_beds)
  visit(profile.capacity.icu_beds)
  visit(profile.capacity.occupancy)

  profile.doctors.forEach((doctor) => { buckets[doctor.data_source_type] += 1 })
  Object.values(profile.nurses).forEach((nurse) => { buckets[nurse.data_source_type] += 1 })
  profile.equipment.forEach((item) => { buckets[item.data_source_type] += 1 })

  return buckets
}
