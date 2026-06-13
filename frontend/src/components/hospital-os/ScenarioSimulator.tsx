import { useEffect, useState } from 'react'
import type { HospitalIntelligenceProfile } from '../../types/hospitalIntelligence'
import {
  formatScenarioAgentReportMarkdown,
  runScenarioAgentReportAsync,
  SCENARIO_AGENT_PIPELINE,
  type ScenarioAgentReport,
} from '../../utils/scenarioAgent'
import {
  getSimulatorDefaults,
  pressurePercent,
  pressureTone,
  type ScenarioSimulatorResult,
} from '../../utils/scenarioSimulator'
import type { IncomingPatients } from '../../utils/hospitalOsUtils'

interface ScenarioSimulatorProps {
  profile: HospitalIntelligenceProfile
  apiBase: string
}

function CapacityBar({ label, incoming, capacity, ok }: { label: string; incoming: number; capacity: number; ok: boolean }) {
  const pct = pressurePercent(incoming, capacity)
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium capitalize text-slate-700">{label}</span>
        <span className={`font-mono text-xs ${ok ? 'text-emerald-600' : 'text-rose-600'}`}>
          {incoming} / {capacity}
        </span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-all duration-500 ${pressureTone(pct)}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-400">{pct}% of modeled capacity</p>
    </div>
  )
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ScenarioSimulator({ profile, apiBase }: ScenarioSimulatorProps) {
  const [incoming, setIncoming] = useState<IncomingPatients>(() => getSimulatorDefaults(profile))
  const [specification, setSpecification] = useState('')
  const [agentReport, setAgentReport] = useState<ScenarioAgentReport | null>(null)
  const [running, setRunning] = useState(false)
  const [activeAgent, setActiveAgent] = useState<string | null>(null)
  const [agentProgress, setAgentProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setIncoming(getSimulatorDefaults(profile))
    setAgentReport(null)
    setError(null)
  }, [profile.hospital_profile.hospital_id, profile.capacity.scenario_assignment])

  const runAgent = async () => {
    setRunning(true)
    setError(null)
    setAgentReport(null)
    setAgentProgress(0)
    try {
      const report = await runScenarioAgentReportAsync(
        apiBase,
        profile,
        incoming,
        specification,
        (agent, index, total) => {
          setActiveAgent(agent)
          setAgentProgress(Math.round(((index + 1) / total) * 100))
        }
      )
      setAgentReport(report)
      setAgentProgress(100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scenario agent failed')
    } finally {
      setRunning(false)
      setActiveAgent(null)
    }
  }

  const result: ScenarioSimulatorResult | null = agentReport?.simulation ?? null
  const displayIncoming = agentReport?.incoming ?? incoming

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-medium uppercase tracking-[0.3em] text-slate-400">Scenario agent</h2>
          <p className="mt-1 text-sm text-slate-500">
            Multi-agent pipeline: parse spec → capacity model → roster analysis → Chroma evidence → Gemini synthesis.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIncoming(getSimulatorDefaults(profile))
            setSpecification('')
            setAgentReport(null)
            setError(null)
          }}
          className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:border-violet-200"
        >
          Reset to scenario assignment
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(['critical', 'moderate', 'minor'] as const).map((key) => (
          <label key={key} className="block text-sm">
            <span className="capitalize text-slate-500">{key} patients</span>
            <input
              type="number"
              min={0}
              max={999}
              value={incoming[key]}
              onChange={(e) => {
                const value = Math.max(0, Number(e.target.value) || 0)
                setIncoming((prev) => ({ ...prev, [key]: value }))
                setAgentReport(null)
              }}
              disabled={running}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-60"
            />
          </label>
        ))}
      </div>

      <label className="mt-4 block text-sm">
        <span className="text-slate-500">Specification (optional)</span>
        <textarea
          rows={3}
          value={specification}
          onChange={(e) => {
            setSpecification(e.target.value)
            setAgentReport(null)
          }}
          disabled={running}
          placeholder="e.g. 10 burn, 2 cardiac arrest patients, 2 doctors on leave"
          className="mt-1 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-slate-900 shadow-sm focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-60"
        />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void runAgent()}
          disabled={running}
          className="rounded-full bg-violet-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {running ? 'Running agents…' : 'Run agent & generate report'}
        </button>
        {agentReport && (
          <button
            type="button"
            onClick={() =>
              downloadText(
                `scenario-report-${profile.hospital_profile.hospital_id}.md`,
                formatScenarioAgentReportMarkdown(agentReport, profile.hospital_profile.name)
              )
            }
            className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm text-slate-700 hover:border-violet-200"
          >
            Download report
          </button>
        )}
      </div>

      {running && (
        <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-left">
          <p className="text-xs font-medium uppercase tracking-wide text-violet-600">Agent pipeline</p>
          <p className="mt-1 text-sm font-medium text-slate-800">{activeAgent ?? SCENARIO_AGENT_PIPELINE[0]}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-violet-100">
            <div className="h-full bg-violet-600 transition-all duration-300" style={{ width: `${agentProgress}%` }} />
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      )}

      {agentReport && (
        <div className="mt-6 space-y-4 border-t border-slate-100 pt-6">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Executive summary</p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${agentReport.agent_powered ? 'bg-violet-100 text-violet-700' : 'bg-amber-100 text-amber-800'}`}>
                {agentReport.agent_powered ? 'Gemini agent' : 'Data-driven rules'}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{agentReport.executive_summary}</p>
            <p className="mt-2 text-xs text-slate-400">{agentReport.source} · confidence {agentReport.confidence}</p>
          </div>

          {agentReport.parsed.notes.length > 0 && (
            <div className="rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3 text-sm text-violet-900">
              <p className="font-medium">Parsed specification</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {agentReport.parsed.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {result && (
            <>
              <div className={`rounded-2xl border p-4 ${result.can_handle ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
                <p className={`text-sm font-semibold ${result.can_handle ? 'text-emerald-800' : 'text-rose-800'}`}>
                  {result.can_handle ? '✓ Hospital can handle this load' : '✗ Capacity exceeded — rerouting advised'}
                </p>
                <p className="mt-1 text-sm text-slate-600">{result.verdict}</p>
                <p className="mt-2 text-xs text-slate-500">{agentReport.routing_summary}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <CapacityBar label="critical" incoming={displayIncoming.critical} capacity={result.capacity.critical} ok={result.critical_ok} />
                <CapacityBar label="moderate" incoming={displayIncoming.moderate} capacity={result.capacity.moderate} ok={result.moderate_ok} />
                <CapacityBar label="minor" incoming={displayIncoming.minor} capacity={result.capacity.minor} ok={result.minor_ok} />
              </div>

              <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div>
                  <p className="text-xs text-slate-400">Overall pressure</p>
                  <p className="font-mono text-3xl font-bold text-slate-900">{result.pressure_score}%</p>
                </div>
                <div className="h-10 flex-1 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className={`h-full transition-all duration-700 ${pressureTone(result.pressure_score)}`}
                    style={{ width: `${Math.min(100, result.pressure_score)}%` }}
                  />
                </div>
              </div>
            </>
          )}

          {agentReport.immediate_actions.length > 0 && (
            <ReportSection title="Immediate actions (0–24h)" items={agentReport.immediate_actions} empty="" />
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <ReportSection title="Staffing actions" items={agentReport.staffing_actions} empty="No staffing actions required for this load." />
            <ReportSection title="Physician actions" items={agentReport.physician_actions} empty="Physician roster sufficient for this specification." />
            <ReportSection title="Equipment actions" items={agentReport.equipment_actions} empty="Equipment adequate for this load." />
          </div>

          {agentReport.clinical_evidence.length > 0 && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-left">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Clinical evidence (Chroma)</p>
              <ul className="mt-2 space-y-2 text-xs text-slate-600">
                {agentReport.clinical_evidence.map((line) => (
                  <li key={line} className="leading-relaxed">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ReportSection({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  if (!items.length && !empty) return null
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-left">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-2 text-sm text-slate-700">
          {items.map((item) => (
            <li key={item} className="leading-snug">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">{empty}</p>
      )}
    </div>
  )
}
