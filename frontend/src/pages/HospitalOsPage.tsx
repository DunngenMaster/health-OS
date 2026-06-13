import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ActionPlanTimeline } from '../components/hospital-os/ActionPlanTimeline'
import { AgenticLoader } from '../components/hospital-os/AgenticLoader'
import { ClinicalEvidencePanel } from '../components/hospital-os/ClinicalEvidencePanel'
import { CommandCenterPanel } from '../components/hospital-os/CommandCenterPanel'
import { DoctorSkillPanel } from '../components/hospital-os/DoctorSkillPanel'
import { EquipmentIntelligencePanel } from '../components/hospital-os/EquipmentIntelligencePanel'
import { FacilitySnapshot } from '../components/hospital-os/FacilitySnapshot'
import { MemoryBrainPanel } from '../components/hospital-os/MemoryBrainPanel'
import { ScenarioSimulator } from '../components/hospital-os/ScenarioSimulator'
import { ConfidenceBadge } from '../components/SourceBadge'
import type { HospitalIntelligenceProfile } from '../types/hospitalIntelligence'
import type { HospitalOsMasterReport } from '../types/hospitalOsReport'
import { exportReportAsPdf } from '../utils/exportReportPdf'
import { formatHospitalAddress, formatHospitalSubtitle } from '../utils/formatHospitalAddress'
import {
  normalizeMasterReport,
  readCachedMasterReport,
  regenerateHospitalOsIntelligence,
  urgencyClass
} from '../utils/hospitalOsApi'
import {
  applyScenarioAssignmentToProfile,
  getScenarioAssignmentForHospital,
  readScenarioContext
} from '../utils/scenarioStore'
import {
  cacheHospitalProfile,
  collectDataTransparency,
  fetchHospitalProfileById,
  readCachedHospitalProfile,
} from '../utils/hospitalOsUtils'

const apiBase = import.meta.env.VITE_API_BASE_URL ?? ''

function DataTransparencyBar({ real, estimated, simulated, unavailable }: { real: number; estimated: number; simulated: number; unavailable: number }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
      <span className="font-medium uppercase tracking-widest text-slate-400">Data provenance</span>
      <span><strong className="text-emerald-700">{real}</strong> real</span>
      <span><strong className="text-amber-700">{estimated}</strong> estimated</span>
      <span><strong className="text-violet-700">{simulated}</strong> simulated</span>
      <span><strong className="text-slate-500">{unavailable}</strong> unavailable</span>
    </div>
  )
}

export default function HospitalOsPage() {
  const { hospitalId } = useParams<{ hospitalId: string }>()
  const [profile, setProfile] = useState<HospitalIntelligenceProfile | null>(null)
  const [masterReport, setMasterReport] = useState<HospitalOsMasterReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scenarioNotice, setScenarioNotice] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [activeAgent, setActiveAgent] = useState<string | null>(null)
  const [agentProgress, setAgentProgress] = useState(0)
  const [regenerateError, setRegenerateError] = useState<string | null>(null)

  const applyLiveScenario = useCallback((baseProfile: HospitalIntelligenceProfile) => {
    if (!hospitalId) return baseProfile
    const assignment = getScenarioAssignmentForHospital(hospitalId)
    if (!assignment) return baseProfile
    return applyScenarioAssignmentToProfile(baseProfile, assignment)
  }, [hospitalId])

  useEffect(() => {
    if (!hospitalId) return

    const load = async () => {
      let loaded = readCachedHospitalProfile(hospitalId)
      if (!loaded) {
        try {
          loaded = await fetchHospitalProfileById(apiBase, hospitalId)
          cacheHospitalProfile(loaded)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load hospital profile')
          return
        }
      }

      const withScenario = applyLiveScenario(loaded)
      setProfile(withScenario)
      const cached = readCachedMasterReport(hospitalId, withScenario)
      setMasterReport(cached ? normalizeMasterReport(withScenario, cached) : null)
    }

    void load()
  }, [hospitalId, applyLiveScenario])

  useEffect(() => {
    const onScenarioUpdate = () => {
      if (!profile || !hospitalId) return
      const updated = applyLiveScenario(profile)
      setProfile(updated)
      cacheHospitalProfile(updated)
      const ctx = readScenarioContext()
      setScenarioNotice(ctx ? `Scenario "${ctx.scenarioName}" updated — regenerate intelligence to apply.` : 'Scenario updated — regenerate intelligence.')
    }
    window.addEventListener('healthos-scenario-updated', onScenarioUpdate)
    return () => window.removeEventListener('healthos-scenario-updated', onScenarioUpdate)
  }, [profile, hospitalId, applyLiveScenario])

  const handleRegenerate = async () => {
    if (!profile || !hospitalId) return
    setRegenerating(true)
    setAgentProgress(0)
    setScenarioNotice(null)
    setRegenerateError(null)
    try {
      const report = await regenerateHospitalOsIntelligence(apiBase, profile, (agent, index, total) => {
        setActiveAgent(agent)
        setAgentProgress(Math.round(((index + 1) / total) * 100))
      })
      setAgentProgress(100)
      setMasterReport(normalizeMasterReport(profile, report))
    } catch (err) {
      setRegenerateError(err instanceof Error ? err.message : 'Improvement cycle failed')
      const cached = readCachedMasterReport(hospitalId, profile)
      setMasterReport(normalizeMasterReport(profile, cached))
    } finally {
      setRegenerating(false)
      setActiveAgent(null)
    }
  }

  const transparency = useMemo(() => {
    if (masterReport?.data_transparency) {
      return {
        real: masterReport.data_transparency.real_fields_count,
        estimated: masterReport.data_transparency.estimated_fields_count,
        simulated: masterReport.data_transparency.simulated_fields_count,
        unavailable: masterReport.data_transparency.unavailable_fields_count
      }
    }
    return profile ? collectDataTransparency(profile) : null
  }, [profile, masterReport])

  if (error) {
    return (
      <div className="hospital-os-page min-h-screen w-full bg-[#faf9f7] px-6 py-10 text-slate-800">
        <p className="text-rose-600">{error}</p>
        <Link to="/" className="mt-4 inline-block text-violet-600 hover:underline">Back to command map</Link>
      </div>
    )
  }

  if (!profile || !transparency) {
    return (
      <div className="hospital-os-page flex min-h-screen w-full items-center justify-center bg-[#faf9f7] text-slate-600">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          <p className="mt-4 text-sm">Loading Hospital OS...</p>
        </div>
      </div>
    )
  }

  const staffing = masterReport?.agent_reports.clinical_staffing_report
  const equipmentIntel = masterReport?.agent_reports.equipment_intelligence_report
  const doctorSkill = masterReport?.agent_reports.doctor_skill_report
  const memory = masterReport?.hospital_memory
  const clinicalEvidence = masterReport?.agent_reports.clinical_evidence_report
  const recommendations = masterReport?.recommendations
  const { hospital_profile: hospital } = profile

  return (
    <div className="hospital-os-page min-h-screen w-full bg-[#faf9f7] text-slate-800">
      {regenerating && <AgenticLoader activeAgent={activeAgent} progress={agentProgress} />}

      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div className="min-w-0 flex-1 text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-600">Hospital OS</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight !text-slate-900">{hospital.name}</h1>
            <p className="mt-1.5 text-sm font-medium !text-slate-700">{formatHospitalAddress(hospital.name, hospital.address)}</p>
            <p className="mt-2 text-xs !text-slate-500">{formatHospitalSubtitle()}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2 text-left">
            <ConfidenceBadge level={hospital.data_confidence} />
            {masterReport && (
              <p className="text-xs text-slate-400">
                Generated {new Date(masterReport.generated_at).toLocaleString()}
                {recommendations?.gemini_powered && <span className="ml-2 text-violet-600">· AI-enhanced plan</span>}
              </p>
            )}
            <button
              type="button"
              disabled={regenerating}
              onClick={() => void handleRegenerate()}
              className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-md hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {regenerating ? 'Running agents…' : 'Run improvement cycle'}
            </button>
            {masterReport && (
              <button
                type="button"
                onClick={() => exportReportAsPdf(masterReport, hospital.name)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 hover:border-violet-200"
              >
                Export PDF
              </button>
            )}
            <Link to="/" className="text-sm font-medium text-violet-600 hover:underline">← Command map</Link>
          </div>
        </div>
      </header>

      {scenarioNotice && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-3 text-center text-sm text-amber-800">{scenarioNotice}</div>
      )}
      {regenerateError && (
        <div className="border-b border-rose-200 bg-rose-50 px-6 py-3 text-center text-sm text-rose-700">{regenerateError}</div>
      )}

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <CommandCenterPanel profile={profile} />
        <FacilitySnapshot profile={profile} />

        {!masterReport && !regenerating && (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <p className="text-slate-600">Run an <strong>improvement cycle</strong> to generate staffing, equipment, physician development, and evidence-backed recommendations.</p>
          </div>
        )}

        {masterReport && (
          <div className={`space-y-8 transition-opacity ${regenerating ? 'pointer-events-none opacity-40' : 'opacity-100'}`}>
            {memory && memory.readiness_history.length > 0 && <MemoryBrainPanel memory={memory} />}

            {staffing && staffing.staffing_gaps.length > 0 && (
              <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-xs font-medium uppercase tracking-[0.3em] text-slate-400">Staffing agent</h2>
                <p className="mt-1 mb-4 text-sm text-slate-500">Hiring priorities from verified roster counts and Chroma evidence.</p>
                <div className="space-y-3">
                  {staffing.staffing_gaps.map((gap, index) => (
                    <div key={`${gap.need}-${index}`} className={`rounded-2xl border p-3 text-sm ${urgencyClass(gap.urgency)}`}>
                      <p className="font-medium">{gap.need}</p>
                      <p className="mt-1 opacity-80">{gap.reason}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {equipmentIntel && <EquipmentIntelligencePanel upgrades={equipmentIntel.upgrade_recommendations} />}
            {doctorSkill && memory && <DoctorSkillPanel report={doctorSkill} memory={memory} />}
            {clinicalEvidence && <ClinicalEvidencePanel report={clinicalEvidence} />}
            {recommendations && staffing && equipmentIntel && (
              <ActionPlanTimeline
                recommendations={recommendations}
                profile={profile}
                staffingGaps={staffing.staffing_gaps}
                equipmentUpgrades={equipmentIntel.upgrade_recommendations}
              />
            )}
          </div>
        )}

        <section>
          <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.3em] text-slate-400">Scenario agent</h2>
          <ScenarioSimulator profile={profile} apiBase={apiBase} />
        </section>

        <DataTransparencyBar {...transparency} />
      </main>
    </div>
  )
}
