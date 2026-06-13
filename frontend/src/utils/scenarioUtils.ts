export interface ImpactSummary {
  injured: number
  critical: number
}

export interface ImpactPoint {
  id: string
  name: string
  latitude: number
  longitude: number
  radius_km: number
  summary: ImpactSummary
}

export interface ScenarioSummary {
  injured: number
  critical: number
  severity: string
}

export interface ScenarioLocation {
  name: string
  latitude: number
  longitude: number
}

export interface ScenarioItem {
  id: string
  name: string
  type: string
  summary: ScenarioSummary
  location?: ScenarioLocation
  impact_points?: ImpactPoint[]
  timestamp?: string
  status?: string
}

export interface HospitalRecommendation {
  hospital_name: string
  latitude: number
  longitude: number
  patients_handled: number
  critical_handled: number
  non_critical_handled: number
  open_now: boolean
}

export interface ImpactAnalysisResponse {
  impact_point_id: string
  impact_point_name: string
  latitude: number
  longitude: number
  radius_km: number
  hospitals: HospitalRecommendation[]
  total_patients: number
  total_capacity: number
  coverage_status: string
}

export interface ScenarioAnalysisResponse {
  scenario_id: string
  scenario_name: string
  scenario_type: string
  summary: ScenarioSummary
  impact_analyses: ImpactAnalysisResponse[]
}

export function normalizeScenario(raw: ScenarioItem): ScenarioItem {
  if (raw.impact_points?.length) {
    return raw
  }

  if (!raw.location) {
    throw new Error('Scenario must include impact_points or location')
  }

  return {
    ...raw,
    impact_points: [{
      id: 'primary-impact',
      name: raw.location.name,
      latitude: raw.location.latitude,
      longitude: raw.location.longitude,
      radius_km: 1.5,
      summary: {
        injured: raw.summary.injured,
        critical: raw.summary.critical
      }
    }]
  }
}

export interface ScenarioFormInput {
  name: string
  type: string
  location_name: string
  injured: number
  critical: number
  severity: string
}

export const SCENARIO_TYPE_OPTIONS = [
  'building collapse',
  'earthquake',
  'tsunami',
  'outbreak',
  'fire',
  'mass casualty',
  'chemical spill',
] as const

export const SCENARIO_SEVERITY_OPTIONS = ['low', 'medium', 'high', 'critical'] as const

export function parseScenarioJson(text: string): ScenarioItem {
  const parsed = JSON.parse(text) as ScenarioItem | ScenarioItem[]

  if (Array.isArray(parsed)) {
    if (!parsed.length) {
      throw new Error('Scenario JSON must contain at least one scenario object')
    }
    return normalizeScenario(parsed[0])
  }

  return normalizeScenario(parsed)
}

export function parseApiError(detail: string, status: number): string {
  try {
    const parsed = JSON.parse(detail) as { detail?: string | Array<{ msg?: string }> }
    if (typeof parsed.detail === 'string') {
      if (parsed.detail === 'Not Found' || status === 404) {
        return 'Scenario API not found. Restart the backend: uvicorn app.main:app --reload --port 8000'
      }
      return parsed.detail
    }
    if (Array.isArray(parsed.detail) && parsed.detail[0]?.msg) {
      return parsed.detail[0].msg
    }
  } catch {
    // keep raw detail
  }
  return detail || `Request failed (${status})`
}

export async function analyzeScenarioFromForm(
  apiBase: string,
  form: ScenarioFormInput
): Promise<{ scenario: ScenarioItem; analysis: ScenarioAnalysisResponse }> {
  const response = await fetch(`${apiBase}/api/v1/analyze-scenario`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(parseApiError(detail, response.status))
  }

  const analysis = (await response.json()) as ScenarioAnalysisResponse
  const primaryImpact = analysis.impact_analyses[0]
  if (!primaryImpact) {
    throw new Error('API returned no impact analyses')
  }

  const scenario = normalizeScenario({
    id: analysis.scenario_id,
    name: analysis.scenario_name,
    type: analysis.scenario_type,
    summary: analysis.summary,
    location: {
      name: form.location_name,
      latitude: primaryImpact.latitude,
      longitude: primaryImpact.longitude,
    },
    status: 'active',
  })

  return { scenario, analysis }
}

export async function prepareScenarioFromForm(
  apiBase: string,
  form: ScenarioFormInput
): Promise<ScenarioItem> {
  const response = await fetch(`${apiBase}/api/v1/prepare-scenario`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(parseApiError(detail, response.status))
  }

  const prepared = (await response.json()) as ScenarioItem
  return normalizeScenario(prepared)
}

export function createImpactCircle(
  center: [number, number],
  radiusKm: number,
  points = 64
): GeoJSON.Polygon {
  const coords: [number, number][] = []
  const distanceX = radiusKm / (111.32 * Math.cos((center[1] * Math.PI) / 180))
  const distanceY = radiusKm / 110.574

  for (let i = 0; i < points; i += 1) {
    const theta = (i / points) * (2 * Math.PI)
    const x = distanceX * Math.cos(theta)
    const y = distanceY * Math.sin(theta)
    coords.push([center[0] + x, center[1] + y])
  }

  coords.push(coords[0])

  return {
    type: 'Polygon',
    coordinates: [coords]
  }
}

export const IMPACT_COLORS: Record<string, string[]> = {
  earthquake: ['#ef4444', '#f97316', '#fb923c'],
  tsunami: ['#0ea5e9', '#06b6d4', '#38bdf8'],
  outbreak: ['#84cc16', '#a3e635', '#eab308'],
  default: ['#f97316', '#38bdf8', '#a78bfa', '#34d399', '#f472b6']
}

export function getImpactColor(scenarioType: string, index: number) {
  const palette = IMPACT_COLORS[scenarioType] ?? IMPACT_COLORS.default
  return palette[index % palette.length]
}
