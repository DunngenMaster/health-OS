import type { HospitalIntelligenceProfile } from '../types/hospitalIntelligence'
import type { HospitalAiRecommendation, HospitalMemory, HospitalOsMasterReport, IncidentDigest } from '../types/hospitalOsReport'
import { fetchClinicalEvidence } from './clinicalEvidenceApi'
import { buildDataDrivenActionPlan, planItemsToStrings } from './actionPlanEngine'
import { AGENT_PIPELINE, generateHospitalOsReport } from './hospitalOsEngine'
import { cacheHospitalMemory, readCachedHospitalMemory } from './hospitalOsUtils'

const MASTER_REPORT_PREFIX = 'hospital-os-master-'

type PlanItemInput = string | { action?: string; reasoning?: string; text?: string }

function coerceRecommendationText(item: unknown): string {
  if (typeof item === 'string') return item
  if (item && typeof item === 'object') {
    const obj = item as PlanItemInput & Record<string, unknown>
    if (typeof obj.action === 'string' && typeof obj.reasoning === 'string') {
      return `${obj.action} — ${obj.reasoning}`
    }
    if (typeof obj.action === 'string') return obj.action
    if (typeof obj.reasoning === 'string') return obj.reasoning
    if (typeof obj.text === 'string') return obj.text
  }
  return String(item ?? '')
}

function coerceStringArray(items: unknown[] | undefined): string[] {
  return (items ?? []).map(coerceRecommendationText).filter((line) => line.length > 0)
}

function normalizeRecommendations(rec: Partial<HospitalAiRecommendation> & { readiness_score?: number; risk_score?: number }): HospitalAiRecommendation {
  return {
    readiness_score: rec.readiness_score ?? 0,
    risk_score: rec.risk_score ?? 0,
    immediate_actions: coerceStringArray(rec.immediate_actions as unknown[]),
    hiring_recommendations: coerceStringArray(rec.hiring_recommendations as unknown[]),
    training_recommendations: coerceStringArray(rec.training_recommendations as unknown[]),
    equipment_recommendations: coerceStringArray(rec.equipment_recommendations as unknown[]),
    process_recommendations: coerceStringArray(rec.process_recommendations as unknown[]),
    '30_day_plan': coerceStringArray(rec['30_day_plan'] as unknown[]),
    '60_day_plan': coerceStringArray(rec['60_day_plan'] as unknown[]),
    '90_day_plan': coerceStringArray(rec['90_day_plan'] as unknown[]),
    confidence: rec.confidence ?? 'medium',
    data_source_type: rec.data_source_type ?? 'estimated',
    gemini_powered: rec.gemini_powered,
    source: rec.source
  }
}

/** Fix stale localStorage reports missing new agent fields */
export function normalizeMasterReport(
  profile: HospitalIntelligenceProfile,
  report: HospitalOsMasterReport | null
): HospitalOsMasterReport | null {
  if (!report) return null

  const agents = report.agent_reports as HospitalOsMasterReport['agent_reports'] & {
    rag_research_report?: HospitalOsMasterReport['agent_reports']['clinical_evidence_report']
  }

  const needsRegenerate =
    !agents?.doctor_skill_report ||
    !agents?.clinical_evidence_report && !agents?.rag_research_report ||
    !report.hospital_memory ||
    !report.readiness_dashboard

  if (needsRegenerate) {
    return null
  }

  if (!agents.clinical_evidence_report && agents.rag_research_report) {
    agents.clinical_evidence_report = agents.rag_research_report
  }

  report.recommendations = normalizeRecommendations(report.recommendations)
  if (agents.hospital_ai_recommendation) {
    agents.hospital_ai_recommendation = normalizeRecommendations(agents.hospital_ai_recommendation)
  }

  const staffingGaps = agents.clinical_staffing_report?.staffing_gaps ?? []
  const equipmentUpgrades = agents.equipment_intelligence_report?.upgrade_recommendations ?? []
  const dataPlan = planItemsToStrings(buildDataDrivenActionPlan(profile, staffingGaps, equipmentUpgrades))
  report.recommendations = { ...report.recommendations, ...dataPlan }

  return report
}

export function cacheMasterReport(hospitalId: string, report: HospitalOsMasterReport) {
  localStorage.setItem(`${MASTER_REPORT_PREFIX}${hospitalId}`, JSON.stringify(report))
  cacheHospitalMemory(hospitalId, report.hospital_memory)
}

export function readCachedMasterReport(hospitalId: string, profile?: HospitalIntelligenceProfile | null): HospitalOsMasterReport | null {
  const raw = localStorage.getItem(`${MASTER_REPORT_PREFIX}${hospitalId}`)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as HospitalOsMasterReport
    return profile ? normalizeMasterReport(profile, parsed) : parsed
  } catch {
    return null
  }
}

export async function fetchHospitalDigest(apiBase: string, profile: HospitalIntelligenceProfile): Promise<IncidentDigest> {
  const response = await fetch(`${apiBase}/api/v1/hospital-os/digest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hospital_id: profile.hospital_profile.hospital_id,
      profile,
    }),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Failed to load two-month hospital digest (${response.status})`)
  }
  return (await response.json()) as IncidentDigest
}

export async function generateInstantReportAsync(
  apiBase: string,
  profile: HospitalIntelligenceProfile
): Promise<HospitalOsMasterReport> {
  const hospitalId = hospitalIdFrom(profile)
  const existingMemory = readCachedHospitalMemory(hospitalId) as HospitalMemory | null
  const digest = await fetchHospitalDigest(apiBase, profile)
  const clinicalEvidence = await fetchClinicalEvidence(apiBase, hospitalId, profile, digest, existingMemory)
  const report = generateHospitalOsReport(profile, existingMemory, clinicalEvidence, digest)
  cacheMasterReport(hospitalId, report)
  return report
}

function hospitalIdFrom(profile: HospitalIntelligenceProfile) {
  return profile.hospital_profile.hospital_id
}

export async function fetchGeminiRecommendations(
  apiBase: string,
  hospitalId: string,
  report: HospitalOsMasterReport
): Promise<HospitalOsMasterReport['recommendations']> {
  const digest = report.incident_digest
  const response = await fetch(`${apiBase}/api/v1/hospital-os/enhance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hospital_id: hospitalId,
      context: {
        hospital_name: report.hospital_memory.hospital_name,
        readiness_score: report.readiness_dashboard.readiness_score,
        risk_score: report.readiness_dashboard.risk_score,
        weaknesses: report.hospital_memory.known_weaknesses.map((w) => w.weakness).slice(0, 5),
        hiring: report.agent_reports.clinical_staffing_report.staffing_gaps.map((g) => g.need),
        training: report.agent_reports.doctor_training_report.recommendations.map((t) => t.training),
        equipment: report.agent_reports.equipment_intelligence_report.upgrade_recommendations.map((e) => e.equipment_name),
        process: digest.two_month_learning_summary.recommended_process_changes,
        rag_findings: report.agent_reports.clinical_evidence_report.findings,
        incident_summary: digest.summary,
        patient_flow: digest.patient_flow,
        hospital_log: digest.hospital_log?.slice(0, 10),
      },
    }),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `Gemini recommendation agent failed (${response.status})`)
  }
  const payload = await response.json()
  if (!payload.hospital_ai_recommendation) {
    throw new Error('Gemini recommendation agent returned empty response')
  }
  return payload.hospital_ai_recommendation
}

export async function regenerateHospitalOsIntelligence(
  apiBase: string,
  profile: HospitalIntelligenceProfile,
  onAgentProgress?: (agent: string, index: number, total: number) => void
): Promise<HospitalOsMasterReport> {
  const hospitalId = hospitalIdFrom(profile)

  for (let index = 0; index < AGENT_PIPELINE.length; index++) {
    onAgentProgress?.(AGENT_PIPELINE[index], index, AGENT_PIPELINE.length)
    await new Promise((resolve) => setTimeout(resolve, 320))
  }
  onAgentProgress?.(AGENT_PIPELINE[AGENT_PIPELINE.length - 1], AGENT_PIPELINE.length - 1, AGENT_PIPELINE.length)

  let report = await generateInstantReportAsync(apiBase, profile)

  const geminiRecs = await fetchGeminiRecommendations(apiBase, hospitalId, report)
  const merged = normalizeRecommendations({
    ...report.recommendations,
    ...geminiRecs,
    gemini_powered: true,
    source: 'Gemini AI master recommendation agent',
  })
  report = {
    ...report,
    recommendations: merged,
    agent_reports: {
      ...report.agent_reports,
      hospital_ai_recommendation: merged,
    },
  }
  cacheMasterReport(hospitalId, report)

  report = normalizeMasterReport(profile, report) ?? report
  cacheMasterReport(hospitalId, report)
  void syncReportToBackend(apiBase, hospitalId, profile, report)
  return report
}

export async function syncReportToBackend(apiBase: string, hospitalId: string, profile: HospitalIntelligenceProfile, report: HospitalOsMasterReport) {
  try {
    await fetch(`${apiBase}/api/v1/hospital-os/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospital_id: hospitalId, profile, master_report: report })
    })
  } catch {
    // optional
  }
}

export function urgencyClass(urgency: string) {
  if (urgency === 'critical' || urgency === 'high') return 'border-rose-200 bg-rose-50 text-rose-700'
  if (urgency === 'medium') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

export { AGENT_PIPELINE }
