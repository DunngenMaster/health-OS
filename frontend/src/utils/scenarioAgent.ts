import type { HospitalIntelligenceProfile } from '../types/hospitalIntelligence'
import { fetchHospitalDigest } from './hospitalOsApi'
import type { IncomingPatients } from './hospitalOsUtils'
import { readCachedHospitalMemory } from './hospitalOsUtils'
import type { ScenarioSimulatorResult } from './scenarioSimulator'

export const SCENARIO_AGENT_PIPELINE = [
  'Specification Parser Agent',
  'Capacity & Surge Model Agent',
  'Staffing & Roster Analysis Agent',
  'Clinical Evidence Agent',
  'Gemini Scenario Synthesis Agent',
] as const

export interface ParsedScenarioSpec {
  burn?: number
  cardiac_arrest?: number
  doctors_on_leave?: number
  trauma?: number
  infectious?: number
  notes: string[]
}

export interface ScenarioAgentReport {
  specification: string
  parsed: ParsedScenarioSpec
  incoming: IncomingPatients
  simulation: ScenarioSimulatorResult
  executive_summary: string
  staffing_actions: string[]
  physician_actions: string[]
  equipment_actions: string[]
  immediate_actions: string[]
  routing_summary: string
  partner_routing: string
  clinical_evidence: string[]
  limitations: string[]
  confidence: string
  agent_powered: boolean
  source: string
  agent_pipeline: string[]
  generated_at: string
}

interface ScenarioAgentApiResponse {
  status: string
  generated_at: string
  specification: string
  parsed_specification: ParsedScenarioSpec
  incoming: IncomingPatients
  simulation: ScenarioSimulatorResult
  executive_summary: string
  routing_summary: string
  staffing_actions: string[]
  physician_actions: string[]
  equipment_actions: string[]
  immediate_actions: string[]
  partner_routing?: string
  clinical_evidence: string[]
  limitations: string[]
  confidence: string
  agent_powered: boolean
  source: string
  agent_pipeline: string[]
}

function mapApiResponse(payload: ScenarioAgentApiResponse): ScenarioAgentReport {
  return {
    specification: payload.specification,
    parsed: payload.parsed_specification,
    incoming: payload.incoming,
    simulation: payload.simulation,
    executive_summary: payload.executive_summary,
    staffing_actions: payload.staffing_actions,
    physician_actions: payload.physician_actions,
    equipment_actions: payload.equipment_actions,
    immediate_actions: payload.immediate_actions ?? [],
    routing_summary: payload.routing_summary,
    partner_routing: payload.partner_routing ?? '',
    clinical_evidence: payload.clinical_evidence ?? [],
    limitations: payload.limitations ?? [],
    confidence: payload.confidence,
    agent_powered: payload.agent_powered,
    source: payload.source,
    agent_pipeline: payload.agent_pipeline,
    generated_at: payload.generated_at,
  }
}

async function ensureRagIndexed(
  apiBase: string,
  hospitalId: string,
  profile: HospitalIntelligenceProfile
): Promise<void> {
  const memory = readCachedHospitalMemory(hospitalId)
  const digest = await fetchHospitalDigest(apiBase, profile)
  await fetch(`${apiBase}/api/v1/hospital-os/rag-index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hospital_id: hospitalId,
      profile,
      incident_digest: digest,
      hospital_memory: memory,
    }),
  })
}

export async function runScenarioAgentReportAsync(
  apiBase: string,
  profile: HospitalIntelligenceProfile,
  baseIncoming: IncomingPatients,
  specification: string,
  onAgentProgress?: (agent: string, index: number, total: number) => void
): Promise<ScenarioAgentReport> {
  const hospitalId = profile.hospital_profile.hospital_id

  for (let index = 0; index < SCENARIO_AGENT_PIPELINE.length - 1; index++) {
    onAgentProgress?.(SCENARIO_AGENT_PIPELINE[index], index, SCENARIO_AGENT_PIPELINE.length)
    await new Promise((resolve) => setTimeout(resolve, 280))
  }

  await ensureRagIndexed(apiBase, hospitalId, profile)
  onAgentProgress?.(SCENARIO_AGENT_PIPELINE[3], 3, SCENARIO_AGENT_PIPELINE.length)

  const response = await fetch(`${apiBase}/api/v1/hospital-os/scenario-agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hospital_id: hospitalId,
      profile,
      incoming: baseIncoming,
      specification,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Scenario agent failed (${response.status})`)
  }

  onAgentProgress?.(SCENARIO_AGENT_PIPELINE[4], 4, SCENARIO_AGENT_PIPELINE.length)
  const payload = (await response.json()) as ScenarioAgentApiResponse
  return mapApiResponse(payload)
}

export function formatScenarioAgentReportMarkdown(report: ScenarioAgentReport, hospitalName: string): string {
  const lines = [
    `# Scenario Agent Report — ${hospitalName}`,
    `Generated: ${new Date(report.generated_at).toLocaleString()}`,
    `Source: ${report.source}`,
    `Confidence: ${report.confidence}`,
    '',
    '## Executive summary',
    report.executive_summary,
    '',
    '## Specification',
    report.specification || '(numeric inputs only)',
    ...(report.parsed.notes.length ? ['', '**Parsed:**', ...report.parsed.notes.map((n) => `- ${n}`)] : []),
    '',
    '## Patient load',
    `- Critical: ${report.incoming.critical}`,
    `- Moderate: ${report.incoming.moderate}`,
    `- Minor: ${report.incoming.minor}`,
    `- Pressure: ${report.simulation.pressure_score}%`,
    `- Can handle: ${report.simulation.can_handle ? 'Yes' : 'No'}`,
    '',
    '## Routing',
    report.routing_summary,
    ...(report.partner_routing ? ['', '**Partner routing:**', report.partner_routing] : []),
    '',
    '## Immediate actions',
    ...report.immediate_actions.map((a) => `- ${a}`),
    '',
    '## Staffing actions',
    ...report.staffing_actions.map((a) => `- ${a}`),
    ...(report.staffing_actions.length ? [] : ['- No immediate staffing actions flagged']),
    '',
    '## Physician actions',
    ...report.physician_actions.map((a) => `- ${a}`),
    ...(report.physician_actions.length ? [] : ['- Physician roster sufficient for parsed specification']),
    '',
    '## Equipment actions',
    ...report.equipment_actions.map((a) => `- ${a}`),
    ...(report.equipment_actions.length ? [] : ['- Equipment adequate for parsed load']),
  ]

  if (report.clinical_evidence.length > 0) {
    lines.push('', '## Clinical evidence', ...report.clinical_evidence.map((e) => `- ${e}`))
  }
  if (report.limitations.length > 0) {
    lines.push('', '## Limitations', ...report.limitations.map((l) => `- ${l}`))
  }

  return lines.join('\n')
}
