export type DataSourceType = 'real' | 'estimated' | 'simulated' | 'unavailable'

export interface FieldValue {
  value: string | number | boolean | null
  data_source_type: DataSourceType
  source?: string
}

export interface HospitalClickPayload {
  name: string
  latitude: number
  longitude: number
  address?: string
  place_id?: string
  mapbox_id?: string
  patients_assigned?: number
  critical_assigned?: number
  non_critical_assigned?: number
  eta_minutes?: number
  distance_km?: number
  congestion?: string
  impact_zone?: string
}

export interface DoctorRecord {
  name: string
  specialty: string
  organization: string
  practice_location?: string
  affiliation_match?: 'at_hospital' | 'same_city' | 'other_area'
  npi: string
  data_source_type: DataSourceType
  source: string
}

export interface NurseCount {
  count: number
  data_source_type: DataSourceType
  source?: string
}

export interface EquipmentRecord {
  name: string
  count: number
  data_source_type: DataSourceType
  source: string
}

export interface HospitalIntelligenceProfile {
  hospital_profile: {
    hospital_id: string
    name: string
    address: string
    coordinates: { lat: number; lng: number }
    phone: string
    website: string
    hospital_type?: string
    emergency_department?: FieldValue
    data_confidence: 'high' | 'medium' | 'low'
    sources: string[]
  }
  capacity: {
    scenario_assignment: {
      critical_patients: FieldValue
      non_critical_patients: FieldValue
      total_patients: FieldValue
      eta_minutes: FieldValue
      distance_km: FieldValue
      congestion: FieldValue
      impact_zone: FieldValue
    }
    total_beds: FieldValue
    icu_beds: FieldValue
    emergency_services: FieldValue
    trauma_level: FieldValue
    occupancy: FieldValue
  }
  doctors: DoctorRecord[]
  nurses: {
    er_nurses: NurseCount
    icu_nurses: NurseCount
    trauma_nurses: NurseCount
    general_ward_nurses: NurseCount
  }
  equipment: EquipmentRecord[]
  ai_recommendation: {
    can_accept: {
      critical_patients: number
      moderate_patients: number
      minor_patients: number
    }
    resource_gaps: string[]
    routing_advice: string
    staffing_recommendations: string[]
    equipment_recommendations: string[]
  }
  collected_at?: string
  agent_status?: Record<string, string>
}

export function sourceBadge(type: DataSourceType) {
  switch (type) {
    case 'real':
      return { label: 'REAL', className: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30' }
    case 'estimated':
      return { label: 'ESTIMATED', className: 'bg-amber-500/20 text-amber-200 border-amber-400/30' }
    case 'simulated':
      return { label: 'SIMULATED', className: 'bg-violet-500/20 text-violet-200 border-violet-400/30' }
    default:
      return { label: 'UNAVAILABLE', className: 'bg-slate-500/20 text-slate-300 border-slate-400/30' }
  }
}

export async function fetchHospitalIntelligence(
  apiBase: string,
  payload: HospitalClickPayload
): Promise<HospitalIntelligenceProfile> {
  const response = await fetch(`${apiBase}/api/v1/hospital-intelligence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Hospital intelligence failed (${response.status}): ${errorBody}`)
  }

  return response.json()
}
