import { mergeDoctorSkillMemory, runDoctorSkillAgent } from './doctorSkillAgent'
import { runEquipmentIntelligenceAgent } from './equipmentIntelligenceAgent'
import { buildDataDrivenActionPlan, planItemsToStrings } from './actionPlanEngine'
import type { ClinicalEvidenceContext, RagHit } from './clinicalEvidenceApi'
import { queryHitsFor } from './clinicalEvidenceApi'
import type { HospitalIntelligenceProfile } from '../types/hospitalIntelligence'
import type {
  HospitalAiRecommendation,
  HospitalMemory,
  HospitalOsMasterReport,
  IncidentDigest,
  IncidentReview,
  RagCitation,
  StaffingGap
} from '../types/hospitalOsReport'


function numericField(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'value' in value) {
    const inner = (value as { value: unknown }).value
    if (typeof inner === 'number') return inner
    if (typeof inner === 'string' && inner.trim()) {
      const parsed = Number(inner)
      return Number.isFinite(parsed) ? parsed : fallback
    }
  }
  return fallback
}

function toCitations(hits: RagHit[]): RagCitation[] {
  return hits.map((hit) => ({
    chunk_id: hit.chunk_id,
    excerpt: hit.content.slice(0, 160),
    source: String(hit.metadata.source ?? 'chromadb'),
    data_source_type: (hit.metadata.data_source_type ?? 'simulated') as RagCitation['data_source_type'],
    score: hit.score
  }))
}

function linkIncidentsForCategory(digest: IncidentDigest, categories: string[]): string[] {
  const incidents = digest.incident_reports ?? digest.incidents
  return incidents
    .filter((incident) => {
      const bottlenecks = incident.bottlenecks as Array<{ type: string }>
      return bottlenecks.some((b) => categories.some((cat) => b.type.includes(cat) || cat.includes(b.type)))
    })
    .map((incident) => String(incident.incident_id))
    .slice(0, 3)
}

export const AGENT_PIPELINE = [
  'Hospital Data Agent',
  'Clinical Staffing Agent',
  'Physician Development Agent',
  'Equipment Lifecycle & Market Agent',
  'Incident Review Agent',
  'Clinical Evidence Agent',
  'Hospital Memory Agent',
  'Gemini Recommendation Agent'
] as const

function utcNow(): string {
  return new Date().toISOString()
}

function computeScores(profile: HospitalIntelligenceProfile, digest: IncidentDigest) {
  const beds = numericField(profile.capacity.total_beds, 100)
  const occupancy = numericField(profile.capacity.occupancy, 72)
  const available = Math.max(1, beds * (1 - occupancy / 100))
  const inbound = digest.summary.total_patients

  let readiness = 50
  if (beds >= 100) readiness += 10
  if (profile.nurses.icu_nurses.count >= 10) readiness += 10
  if (profile.doctors.filter((d) => d.data_source_type === 'real').length >= 6) readiness += 10
  if (profile.equipment.some((item) => item.name === 'Ventilator' && item.count >= 6)) readiness += 5

  const loadRatio = inbound / available
  const gapCount = digest.summary.most_common_resource_gaps.length
  const risk = Math.min(95, Math.round(20 + loadRatio * 35 + gapCount * 8))
  readiness = Math.max(20, Math.min(92, readiness - Math.round(loadRatio * 15)))

  return { readiness, risk }
}

function buildMemory(
  profile: HospitalIntelligenceProfile,
  digest: IncidentDigest,
  readiness: number,
  risk: number,
  existing: HospitalMemory | null
): HospitalMemory {
  const hospital = profile.hospital_profile
  const memory: HospitalMemory = existing ?? {
    hospital_id: hospital.hospital_id,
    hospital_name: hospital.name,
    last_updated: utcNow(),
    readiness_history: [],
    known_weaknesses: [],
    successful_improvements: [],
    staffing_memory: { recurring_shortages: [], recommended_hires_history: [], departments_under_pressure: [] },
    training_memory: { recommended_trainings: [], completed_trainings: [], training_gaps: [] },
    equipment_memory: { outdated_equipment: [], equipment_causing_delays: [], recommended_purchases: [], completed_upgrades: [] },
    incident_learning_memory: {
      common_incident_types: [],
      common_death_contributing_factors: [],
      preventable_death_patterns: [],
      routing_failures: [],
      triage_failures: []
    },
    ai_model_learning_notes: []
  }

  memory.readiness_history.push({
    date: utcNow(),
    readiness_score: readiness,
    risk_score: risk,
    major_reason: 'Hospital OS intelligence cycle completed'
  })
  memory.readiness_history = memory.readiness_history.slice(-12)

  memory.staffing_memory.recurring_shortages = digest.two_month_learning_summary.recommended_hires
  memory.training_memory.recommended_trainings = []
  memory.equipment_memory.recommended_purchases = digest.two_month_learning_summary.recommended_equipment_upgrades
  memory.incident_learning_memory.common_incident_types = digest.summary.most_common_incident_types
  memory.ai_model_learning_notes.push({
    date: utcNow(),
    observation: 'Intelligence cycle completed using facility profile and active scenario context',
    old_behavior: 'Prior cycle recommendations',
    new_recommendation_logic: 'Weight surge capacity against inbound scenario assignment',
    confidence: 'medium'
  })
  memory.ai_model_learning_notes = memory.ai_model_learning_notes.slice(-8)
  memory.last_updated = utcNow()
  return memory
}

export function generateHospitalOsReport(
  profile: HospitalIntelligenceProfile,
  existingMemory: HospitalMemory | null = null,
  clinicalEvidence: ClinicalEvidenceContext | null = null,
  digestOverride?: IncidentDigest
): HospitalOsMasterReport {
  if (!digestOverride) {
    throw new Error('Two-month hospital digest is required — fetch via fetchHospitalDigest()')
  }
  const digest = digestOverride
  const ragHits = clinicalEvidence?.defaultHits ?? []

  const specialties: Record<string, number> = {}
  for (const doctor of profile.doctors) {
    specialties[doctor.specialty] = (specialties[doctor.specialty] ?? 0) + 1
  }

  const staffingGaps: StaffingGap[] = []
  if ((specialties['Emergency Medicine'] ?? 0) < 4) {
    staffingGaps.push({
      need: '2 emergency physicians for high-risk hours',
      urgency: 'high',
      reason: 'Emergency coverage below modeled surge threshold',
      data_source_type: 'estimated',
      confidence: 'medium',
      linked_incident_ids: [],
      rag_citations: toCitations(ragHits.slice(0, 2))
    })
  }
  if (profile.nurses.icu_nurses.count < 10) {
    staffingGaps.push({
      need: '4 ICU nurses',
      urgency: 'critical',
      reason: 'ICU nurse count below modeled threshold for licensed bed capacity',
      data_source_type: profile.nurses.icu_nurses.data_source_type,
      confidence: 'high',
      rag_citations: toCitations(queryHitsFor(clinicalEvidence, 'ICU bed capacity surge bottlenecks').slice(0, 2))
    })
  }

  const trainingRecs = digest.two_month_learning_summary.recommended_training.slice(0, 4).map((trainingName) => {
    const department =
      /triage|casualty/i.test(trainingName) ? 'Emergency Medicine'
      : /imaging/i.test(trainingName) ? 'Imaging'
      : /trauma|disaster/i.test(trainingName) ? 'Trauma'
      : 'ICU'
    return {
      department,
      training: trainingName,
      format: 'Workshop or certification',
      urgency: (digest.patient_flow?.average_ed_wait_minutes ?? 0) > 60 ? 'high' as const : 'medium' as const,
      reason: 'From two-month digest patient flow and incident patterns',
      data_source_type: 'simulated' as const,
      confidence: 'medium',
      evidence: ragHits.slice(0, 2).map((h) => h.content.slice(0, 100)),
      linked_incident_ids: linkIncidentsForCategory(digest, ['triage', 'staffing']),
      rag_citations: toCitations(queryHitsFor(clinicalEvidence, 'training should trauma doctors complete').slice(0, 2)),
    }
  })

  const equipmentUpgrades = runEquipmentIntelligenceAgent(profile)

  const incidentList = digest.incident_reports ?? digest.incidents
  const incidentReviews: IncidentReview[] = incidentList.map((incident) => {
    const outcomes = incident.outcomes as { deaths: number; death_details: Array<{ could_potentially_be_prevented: boolean }> }
    const incoming = incident.incoming_patients as { total: number; critical: number; moderate: number; minor: number }
    return {
      incident_id: String(incident.incident_id),
      date: String(incident.date),
      incident_type: String(incident.incident_type),
      patients: incoming,
      deaths: outcomes.deaths,
      system_analysis: 'System-level strain contributed to throughput delays; no individual clinician attribution.',
      preventable_cases: outcomes.death_details.filter((d) => d.could_potentially_be_prevented),
      bottlenecks: incident.bottlenecks as IncidentReview['bottlenecks'],
      lessons_learned: incident.lessons_learned as string[],
      recommended_improvements: incident.recommended_improvements as string[],
      data_source_type: (String(incident.data_source_type ?? 'simulated') as 'simulated' | 'estimated' | 'real'),
    }
  })

  const ragFindings = clinicalEvidence?.findings ?? []
  const sourcesIndexed = clinicalEvidence?.chunkCount ?? 0

  const { readiness, risk } = computeScores(profile, digest)
  const doctorSkillReport = runDoctorSkillAgent(profile, digest, existingMemory)
  let memory = buildMemory(profile, digest, readiness, risk, existingMemory)
  memory = mergeDoctorSkillMemory(memory, doctorSkillReport)

  const recommendations: HospitalAiRecommendation = {
    readiness_score: readiness,
    risk_score: risk,
    immediate_actions: [
      'Activate surge staffing checklist',
      'Verify ventilator reserve and imaging turnaround',
      'Brief trauma and ER leads on current readiness status'
    ],
    hiring_recommendations: staffingGaps.map((g) => g.need),
    training_recommendations: doctorSkillReport.physician_recommendations.map((p) => `${p.doctor_name}: ${p.recommended_training}`),
    equipment_recommendations: equipmentUpgrades.map((e) => e.equipment_name),
    process_recommendations: digest.two_month_learning_summary.recommended_process_changes,
    ...planItemsToStrings(buildDataDrivenActionPlan(profile, staffingGaps, equipmentUpgrades)),
    confidence: 'medium',
    data_source_type: 'estimated'
  }

  return {
    generated_at: utcNow(),
    hospital_profile: profile.hospital_profile as unknown as Record<string, unknown>,
    capacity: profile.capacity as unknown as Record<string, unknown>,
    doctors: profile.doctors as unknown as Array<Record<string, unknown>>,
    nurses: profile.nurses,
    equipment: profile.equipment as unknown as Array<Record<string, unknown>>,
    incident_digest: digest,
    hospital_memory: memory,
    agent_reports: {
      hospital_identity_report: {
        hospital_id: profile.hospital_profile.hospital_id,
        name: profile.hospital_profile.name,
        address: profile.hospital_profile.address,
        data_source_type: 'real'
      },
      clinical_staffing_report: {
        specialty_breakdown: specialties,
        nurse_counts: profile.nurses,
        staffing_gaps: staffingGaps,
        shift_coverage_recommendations: [
          'Add evening ER nurse overlap during weekend surge windows',
          'Pre-alert ICU float pool when regional incident score exceeds threshold'
        ],
        note: 'No on-duty schedule data available; recommendations are system-level only.'
      },
      doctor_training_report: { recommendations: trainingRecs, guideline_updates: ['Review latest cardiac arrest response protocol', 'Update trauma activation checklist'], note: 'Department-level training summary.' },
      doctor_skill_report: doctorSkillReport,
      equipment_intelligence_report: {
        current_inventory: profile.equipment as unknown as Array<Record<string, unknown>>,
        upgrade_recommendations: equipmentUpgrades,
        replacement_candidates: equipmentUpgrades.filter((e) => e.category === 'lifecycle' || e.action === 'replace_aging_unit')
      },
      incident_review_report: {
        reviews: incidentReviews,
        summary: digest.summary,
        learning_summary: digest.two_month_learning_summary,
        note: 'Covers incident reports, patient flow, and hospital log from two-month digest.',
      },
      clinical_evidence_report: {
        findings: ragFindings,
        knowledge_updates: ['Maintain early ICU bed clearing during regional alerts', 'Use portable ultrasound to reduce trauma triage delay'],
        sources_indexed: sourcesIndexed,
        retrieval_engine: clinicalEvidence?.retrieval_engine ?? 'chromadb'
      },
      hospital_ai_recommendation: recommendations
    },
    readiness_dashboard: {
      readiness_score: readiness,
      risk_score: risk,
      capacity_status: risk >= 70 ? 'critical' : risk >= 45 ? 'strained' : 'stable',
      staffing_status: readiness < 45 ? 'critical_shortage' : readiness < 65 ? 'shortage' : 'stable',
      equipment_status: risk >= 65 ? 'critical_gap' : risk >= 40 ? 'aging' : 'modern',
      training_status: risk >= 60 ? 'critical_gap' : readiness < 70 ? 'needs_update' : 'up_to_date'
    },
    recommendations,
    data_transparency: {
      real_fields_count: profile.doctors.filter((d) => d.data_source_type === 'real').length + 3,
      estimated_fields_count: 12,
      simulated_fields_count: digest.incidents.length + staffingGaps.length + trainingRecs.length,
      unavailable_fields_count: 2,
      sources: ['hospital_profile', 'incident_digest', 'hospital_memory', 'physician_development_agent', 'equipment_lifecycle_agent', 'chromadb', 'npi_registry']
    }
  }
}
