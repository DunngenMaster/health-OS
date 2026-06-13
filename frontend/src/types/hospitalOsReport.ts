import type { DataSourceType } from './hospitalIntelligence'

import type { DoctorSkillReport } from '../utils/doctorSkillAgent'

export type { DoctorSkillReport }

export interface HospitalOsMasterReport {
  generated_at: string
  hospital_profile: Record<string, unknown>
  capacity: Record<string, unknown>
  doctors: Array<Record<string, unknown>>
  nurses: Record<string, { count: number; data_source_type: DataSourceType }>
  equipment: Array<Record<string, unknown>>
  incident_digest: IncidentDigest
  hospital_memory: HospitalMemory
  agent_reports: {
    hospital_identity_report: Record<string, unknown>
    clinical_staffing_report: ClinicalStaffingReport
    doctor_training_report: DoctorTrainingReport
    doctor_skill_report: DoctorSkillReport
    equipment_intelligence_report: EquipmentIntelligenceReport
    incident_review_report: IncidentReviewReport
    clinical_evidence_report: RagResearchReport
    hospital_ai_recommendation: HospitalAiRecommendation
  }
  readiness_dashboard: ReadinessDashboard
  recommendations: HospitalAiRecommendation
  data_transparency: DataTransparency
}

export interface ReadinessDashboard {
  readiness_score: number
  risk_score: number
  capacity_status: 'stable' | 'strained' | 'critical'
  staffing_status: 'stable' | 'shortage' | 'critical_shortage'
  equipment_status: 'modern' | 'aging' | 'critical_gap'
  training_status: 'up_to_date' | 'needs_update' | 'critical_gap'
}

export interface DataTransparency {
  real_fields_count: number
  estimated_fields_count: number
  simulated_fields_count: number
  unavailable_fields_count: number
  sources: string[]
}

export interface RagCitation {
  chunk_id: string
  excerpt: string
  source: string
  data_source_type: DataSourceType
  score?: number
}

export interface StaffingGap {
  need: string
  urgency: string
  reason: string
  data_source_type: DataSourceType
  confidence: string
  linked_incident_ids?: string[]
  rag_citations?: RagCitation[]
}

export interface ClinicalStaffingReport {
  specialty_breakdown: Record<string, number>
  nurse_counts: Record<string, { count: number; data_source_type: DataSourceType }>
  staffing_gaps: StaffingGap[]
  shift_coverage_recommendations: string[]
  note: string
}

export interface TrainingRecommendation {
  department: string
  training: string
  format: string
  urgency: string
  reason: string
  data_source_type: DataSourceType
  confidence: string
  evidence: string[]
  linked_incident_ids?: string[]
  rag_citations?: RagCitation[]
}

export interface DoctorTrainingReport {
  recommendations: TrainingRecommendation[]
  guideline_updates: string[]
  note: string
}

export interface EquipmentUpgrade {
  equipment_name: string
  action: string
  current_count?: number
  recommended_count?: number
  urgency: string
  expected_impact: string
  data_source_type: DataSourceType
  confidence: string
  reason: string
  linked_incident_ids?: string[]
  rag_citations?: RagCitation[]
  category?: 'lifecycle' | 'market_innovation' | 'replacement'
  market_product?: string
  evidence_url?: string
  evidence_label?: string
  estimated_age_years?: number
  typical_lifespan_years?: number
  agent_source?: string
}

export interface EquipmentIntelligenceReport {
  current_inventory: Array<Record<string, unknown>>
  upgrade_recommendations: EquipmentUpgrade[]
  replacement_candidates: EquipmentUpgrade[]
}

export interface IncidentReview {
  incident_id: string
  date: string
  incident_type: string
  patients: { total: number; critical: number; moderate: number; minor: number }
  deaths: number
  system_analysis: string
  preventable_cases: Array<Record<string, unknown>>
  bottlenecks: Array<{ type: string; description: string; impact: string; delay_minutes: number }>
  lessons_learned: string[]
  recommended_improvements: string[]
  data_source_type: DataSourceType
}

export interface IncidentReviewReport {
  reviews: IncidentReview[]
  summary: Record<string, unknown>
  learning_summary: Record<string, unknown>
  note: string
}

export interface RagFinding {
  query: string
  retrieved_chunks: number
  summary: string
  confidence: string
  data_source_type: DataSourceType
}

export interface RagResearchReport {
  findings: RagFinding[]
  knowledge_updates: string[]
  sources_indexed: number
  retrieval_engine?: string
}

export interface HospitalAiRecommendation {
  readiness_score: number
  risk_score: number
  immediate_actions: string[]
  hiring_recommendations: string[]
  training_recommendations: string[]
  equipment_recommendations: string[]
  process_recommendations: string[]
  '30_day_plan': string[]
  '60_day_plan': string[]
  '90_day_plan': string[]
  confidence: string
  data_source_type: DataSourceType
  gemini_powered?: boolean
  source?: string
}

export interface IncidentDigest {
  digest_metadata: {
    hospital_id: string
    hospital_name: string
    digest_period: { start_date: string; end_date: string }
    data_source_type: DataSourceType
    generated_at: string
    purpose: string
  }
  summary: {
    total_incidents: number
    total_patients: number
    critical_patients: number
    moderate_patients: number
    minor_patients: number
    total_deaths: number
    preventable_deaths_estimate: number
    average_er_wait_time_minutes: number
    average_diagnosis_delay_minutes: number
    most_common_incident_types: string[]
    most_common_resource_gaps: string[]
  }
  incidents: Array<Record<string, unknown>>
  incident_reports?: Array<Record<string, unknown>>
  patient_flow?: {
    period_days: number
    data_source_type: DataSourceType
    ed_arrivals_total: number
    admissions_total: number
    discharges_total: number
    icu_transfers: number
    average_daily_census: number
    peak_occupancy_pct: number
    average_ed_wait_minutes: number
    average_diagnosis_delay_minutes: number
    left_without_being_seen: number
    throughput_by_week: Array<Record<string, unknown>>
    bottleneck_departments: string[]
  }
  hospital_log?: Array<{
    timestamp: string
    category: string
    event: string
    department: string
    severity: string
    hospital: string
    data_source_type: DataSourceType
  }>
  two_month_learning_summary: {
    patterns_detected: string[]
    recurring_failures: string[]
    highest_risk_departments: string[]
    recommended_hires: string[]
    recommended_training: string[]
    recommended_equipment_upgrades: string[]
    recommended_process_changes: string[]
    model_improvement_notes: string[]
  }
}

export interface HospitalMemory {
  hospital_id: string
  hospital_name: string
  last_updated: string
  readiness_history: Array<{
    date: string
    readiness_score: number
    risk_score: number
    major_reason: string
  }>
  known_weaknesses: Array<{
    weakness: string
    category: string
    first_detected: string
    times_observed: number
    severity: string
    status: string
  }>
  successful_improvements: Array<{ improvement: string; date_completed: string; measured_impact: string }>
  staffing_memory: {
    recurring_shortages: string[]
    recommended_hires_history: string[]
    departments_under_pressure: string[]
  }
  training_memory: {
    recommended_trainings: string[]
    completed_trainings: string[]
    training_gaps: string[]
  }
  equipment_memory: {
    outdated_equipment: string[]
    equipment_causing_delays: string[]
    recommended_purchases: string[]
    completed_upgrades: string[]
  }
  incident_learning_memory: {
    common_incident_types: string[]
    common_death_contributing_factors: string[]
    preventable_death_patterns: string[]
    routing_failures: string[]
    triage_failures: string[]
  }
  ai_model_learning_notes: Array<{
    date: string
    observation: string
    old_behavior: string
    new_recommendation_logic: string
    confidence: string
  }>
  doctor_skill_memory?: {
    physicians: Array<{
      npi: string
      name: string
      specialty: string
      skill_gaps: string[]
      recommended_training: string
      training_type: string
      provider: string
      urgency: string
      linked_incident_ids: string[]
      times_recommended: number
      status: string
      last_updated: string
    }>
    specialty_pressure: Record<string, number>
    conferences_catalog_used: string[]
    skill_improvement_notes: Array<{
      date: string
      observation: string
      action: string
    }>
  }
}
