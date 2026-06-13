import type { DoctorRecord, HospitalIntelligenceProfile } from '../types/hospitalIntelligence'
import type { HospitalMemory, IncidentDigest } from '../types/hospitalOsReport'

export interface PhysicianDevelopmentRecommendation {
  npi: string
  doctor_name: string
  specialty: string
  organization: string
  improvement_focus: string
  recommended_training: string
  training_type: 'conference' | 'certification' | 'simulation' | 'workshop' | 'course'
  provider: string
  url: string
  evidence_source: string
  why_recommended: string
  urgency: 'low' | 'medium' | 'high'
  data_source_type: 'real' | 'estimated' | 'simulated'
  confidence: string
  times_recommended: number
  status: 'open' | 'scheduled' | 'completed'
  agent_source: string
  /** @deprecated use improvement_focus */
  skill_gap?: string
  linked_incident_ids?: string[]
  linked_incident_type?: string
}

export type DoctorSkillRecommendation = PhysicianDevelopmentRecommendation

export interface DoctorSkillReport {
  physician_recommendations: PhysicianDevelopmentRecommendation[]
  specialty_pressure: Record<string, number>
  conferences_reviewed: string[]
  note: string
}

interface TrainingCatalogEntry {
  training: string
  type: PhysicianDevelopmentRecommendation['training_type']
  provider: string
  url: string
  evidence_source: string
  focus: string
}

const TRAINING_BY_SPECIALTY: Record<string, TrainingCatalogEntry[]> = {
  'Emergency Medicine': [
    {
      training: 'ACEP Scientific Assembly — Innovation & Disaster Medicine Track',
      type: 'conference',
      provider: 'American College of Emergency Physicians',
      url: 'https://www.acep.org/',
      evidence_source: 'ACEP continuing education catalog',
      focus: 'Latest mass-casualty triage protocols and ED throughput innovations'
    },
    {
      training: 'ATLS Provider Renewal — Advanced Trauma Life Support',
      type: 'certification',
      provider: 'American College of Surgeons',
      url: 'https://www.facs.org/for-medical-professionals/education/programs/atls/',
      evidence_source: 'ACS ATLS program (gold standard trauma certification)',
      focus: 'Hands-on trauma resuscitation updates for experienced ED physicians'
    },
    {
      training: 'SAEM Annual Meeting — Simulation & Quality Improvement',
      type: 'conference',
      provider: 'Society for Academic Emergency Medicine',
      url: 'https://www.saem.org/',
      evidence_source: 'SAEM scientific program',
      focus: 'Simulation-based methods for surge readiness without blaming individual performance'
    }
  ],
  'Trauma Surgery': [
    {
      training: 'EAST Annual Scientific Assembly — Trauma & Acute Care Surgery',
      type: 'conference',
      provider: 'Eastern Association for the Surgery of Trauma',
      url: 'https://www.east.org/',
      evidence_source: 'EAST education portal',
      focus: 'Operative decision-making advances in multi-trauma care'
    },
    {
      training: 'ASSET Course — Advanced Surgical Skills for Exposure in Trauma',
      type: 'workshop',
      provider: 'American College of Surgeons',
      url: 'https://www.facs.org/for-medical-professionals/education/programs/asset/',
      evidence_source: 'ACS ASSET curriculum',
      focus: 'Advanced exposure techniques for complex trauma — continuous skill refinement'
    }
  ],
  'Internal Medicine': [
    {
      training: 'SHM Converge — Hospital Medicine & Surge Operations',
      type: 'conference',
      provider: 'Society of Hospital Medicine',
      url: 'https://www.hospitalmedicine.org/',
      evidence_source: 'SHM Converge conference',
      focus: 'ICU handoff optimization and inpatient surge coordination'
    }
  ],
  'Cardiology': [
    {
      training: 'ACC Annual Scientific Session — Acute & Critical Cardiovascular Care',
      type: 'conference',
      provider: 'American College of Cardiology',
      url: 'https://www.acc.org/',
      evidence_source: 'ACC Annual Session',
      focus: 'Breakthroughs in acute cardiac care and cardiogenic shock management'
    }
  ],
  'Neurology': [
    {
      training: 'AAN Annual Meeting — Stroke & Neurocritical Care',
      type: 'conference',
      provider: 'American Academy of Neurology',
      url: 'https://www.aan.com/',
      evidence_source: 'AAN events calendar',
      focus: 'Time-critical neuro intervention methods and thrombectomy updates'
    }
  ],
  'Anesthesiology': [
    {
      training: 'ASA Annual Meeting — Crisis Resource Management',
      type: 'conference',
      provider: 'American Society of Anesthesiologists',
      url: 'https://www.asahq.org/',
      evidence_source: 'ASA annual meeting program',
      focus: 'Team-based crisis management refinements for experienced anesthesiologists'
    }
  ],
  default: [
    {
      training: 'HHS ASPR TRACIE — Healthcare Emergency Preparedness Webinars',
      type: 'course',
      provider: 'HHS ASPR TRACIE',
      url: 'https://asprtracie.hhs.gov/',
      evidence_source: 'HHS ASPR TRACIE federal preparedness library',
      focus: 'Hospital-wide emergency coordination and continuous readiness improvement'
    },
    {
      training: 'Joint Commission — Emergency Management Standards Update',
      type: 'course',
      provider: 'The Joint Commission',
      url: 'https://www.jointcommission.org/resources/patient-safety-topics/emergency-management/',
      evidence_source: 'Joint Commission EM standards',
      focus: 'Regulatory best practices for sustained surge preparedness'
    }
  ]
}

function seedFromNpi(npi: string, salt: string): number {
  let hash = 0
  const raw = `${npi}:${salt}`
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function pickTraining(specialty: string, npi: string): TrainingCatalogEntry {
  const catalog = TRAINING_BY_SPECIALTY[specialty] ?? TRAINING_BY_SPECIALTY.default
  return catalog[seedFromNpi(npi, specialty) % catalog.length]
}

function priorRecommendation(memory: HospitalMemory | null, npi: string) {
  const prior = memory?.doctor_skill_memory?.physicians.find((p) => p.npi === npi)
  if (!prior) return undefined
  return {
    times_recommended: prior.times_recommended,
    status: prior.status as PhysicianDevelopmentRecommendation['status']
  }
}

export function runDoctorSkillAgent(
  profile: HospitalIntelligenceProfile,
  digest: IncidentDigest,
  existingMemory: HospitalMemory | null
): DoctorSkillReport {
  const doctors = profile.doctors.slice(0, 6)
  const specialtyPressure: Record<string, number> = {}

  for (const inc of digest.incidents) {
    const incoming = inc.incoming_patients as { critical: number }
    const weight = incoming?.critical ?? 1
    for (const doctor of doctors) {
      specialtyPressure[doctor.specialty] = (specialtyPressure[doctor.specialty] ?? 0) + weight * 0.15
    }
  }

  const topIncident = digest.summary.most_common_incident_types[0]?.replaceAll('_', ' ') ?? 'regional surge'

  const recommendations: PhysicianDevelopmentRecommendation[] = doctors.map((doctor: DoctorRecord) => {
    const picked = pickTraining(doctor.specialty, doctor.npi)
    const prior = priorRecommendation(existingMemory, doctor.npi)
    const pressure = specialtyPressure[doctor.specialty] ?? 0
    const urgency: PhysicianDevelopmentRecommendation['urgency'] =
      pressure > 18 ? 'high' : pressure > 8 ? 'medium' : 'low'

    return {
      npi: doctor.npi,
      doctor_name: doctor.name,
      specialty: doctor.specialty,
      organization: doctor.organization,
      improvement_focus: picked.focus,
      recommended_training: picked.training,
      training_type: picked.type,
      provider: picked.provider,
      url: picked.url,
      evidence_source: picked.evidence_source,
      why_recommended: `${doctor.name} is an established ${doctor.specialty} specialist. This ${picked.type} supports continuous improvement aligned with ${topIncident} patterns observed regionally — a system-level suggestion, not a performance evaluation.`,
      urgency,
      data_source_type: doctor.data_source_type === 'real' ? 'real' : 'estimated',
      confidence: doctor.data_source_type === 'real' ? 'high' : 'medium',
      times_recommended: (prior?.times_recommended ?? 0) + 1,
      status: prior?.status ?? 'open',
      agent_source: 'Physician Development Agent',
      skill_gap: picked.focus
    }
  })

  return {
    physician_recommendations: recommendations,
    specialty_pressure: specialtyPressure,
    conferences_reviewed: [...new Set(recommendations.map((r) => r.provider))],
    note: 'Suggestions are for continuous professional development of expert physicians. Each recommendation links to a verified conference, certification, or federal education resource.'
  }
}

export function mergeDoctorSkillMemory(
  memory: HospitalMemory,
  report: DoctorSkillReport
): HospitalMemory {
  const existing = memory.doctor_skill_memory?.physicians ?? []
  const merged = report.physician_recommendations.map((rec) => {
    const prior = existing.find((p) => p.npi === rec.npi)
    const topic = rec.improvement_focus
    return {
      npi: rec.npi,
      name: rec.doctor_name,
      specialty: rec.specialty,
      skill_gaps: prior ? [...new Set([...prior.skill_gaps, topic])] : [topic],
      recommended_training: rec.recommended_training,
      training_type: rec.training_type,
      provider: rec.provider,
      urgency: rec.urgency,
      linked_incident_ids: rec.linked_incident_ids ?? [],
      times_recommended: rec.times_recommended,
      status: prior?.status ?? 'open',
      last_updated: new Date().toISOString()
    }
  })

  memory.doctor_skill_memory = {
    physicians: merged,
    specialty_pressure: report.specialty_pressure,
    conferences_catalog_used: report.conferences_reviewed,
    skill_improvement_notes: [
      ...(memory.doctor_skill_memory?.skill_improvement_notes ?? []).slice(-5),
      {
        date: new Date().toISOString(),
        observation: `Physician Development Agent reviewed ${merged.length} profiles against ${report.conferences_reviewed.length} accredited education providers`,
        action: 'Prioritize conference enrollment for specialties under regional surge pressure'
      }
    ]
  }

  memory.training_memory.recommended_trainings = [
    ...new Set(merged.map((p) => p.recommended_training))
  ]
  memory.training_memory.training_gaps = [
    ...new Set(
      merged
        .filter((p) => p.urgency === 'high')
        .map((p) => `${p.specialty}: ${p.recommended_training}`)
    )
  ]

  return memory
}
