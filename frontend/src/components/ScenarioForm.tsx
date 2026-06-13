import { useState } from 'react'
import {
  SCENARIO_SEVERITY_OPTIONS,
  SCENARIO_TYPE_OPTIONS,
  type ScenarioFormInput,
} from '../utils/scenarioUtils'

const DEFAULT_FORM: ScenarioFormInput = {
  name: 'Financial District Building Collapse',
  type: 'building collapse',
  location_name: 'Financial District, San Francisco',
  injured: 100,
  critical: 20,
  severity: 'high',
}

interface ScenarioFormProps {
  onSubmit: (form: ScenarioFormInput) => Promise<void>
  isSubmitting?: boolean
}

export default function ScenarioForm({ onSubmit, isSubmitting = false }: ScenarioFormProps) {
  const [form, setForm] = useState<ScenarioFormInput>(DEFAULT_FORM)
  const [error, setError] = useState<string | null>(null)

  const updateField = <K extends keyof ScenarioFormInput>(key: K, value: ScenarioFormInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    if (!form.name.trim() || !form.location_name.trim()) {
      setError('Scenario name and location are required.')
      return
    }

    if (form.injured < 0 || form.critical < 0) {
      setError('Patient counts cannot be negative.')
      return
    }

    try {
      await onSubmit({
        ...form,
        name: form.name.trim(),
        location_name: form.location_name.trim(),
      })
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to start scenario')
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/75 p-5 text-white shadow-2xl backdrop-blur-md">
      <p className="text-xs uppercase tracking-[0.25em] text-sky-300">Emergency Scenario</p>
      <h2 className="mt-1 text-xl font-semibold">Define incident</h2>
      <p className="mt-1 text-sm text-white/70">
        Enter scenario details. Gemini resolves the written location to map coordinates.
      </p>

      <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
        <label className="block text-sm">
          <span className="text-white/70">Scenario name</span>
          <input
            type="text"
            value={form.name}
            onChange={(event) => updateField('name', event.target.value)}
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-white outline-none focus:border-sky-400/60"
            placeholder="Financial District Building Collapse"
            disabled={isSubmitting}
          />
        </label>

        <label className="block text-sm">
          <span className="text-white/70">Incident type</span>
          <select
            value={form.type}
            onChange={(event) => updateField('type', event.target.value)}
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-white outline-none focus:border-sky-400/60"
            disabled={isSubmitting}
          >
            {SCENARIO_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option} className="bg-slate-900 capitalize">
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-white/70">Location (written)</span>
          <input
            type="text"
            value={form.location_name}
            onChange={(event) => updateField('location_name', event.target.value)}
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-white outline-none focus:border-sky-400/60"
            placeholder="Financial District, San Francisco"
            disabled={isSubmitting}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-white/70">Injured (non-critical)</span>
            <input
              type="number"
              min={0}
              value={form.injured}
              onChange={(event) => updateField('injured', Number(event.target.value) || 0)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-white outline-none focus:border-sky-400/60"
              disabled={isSubmitting}
            />
          </label>

          <label className="block text-sm">
            <span className="text-white/70">Critical patients</span>
            <input
              type="number"
              min={0}
              value={form.critical}
              onChange={(event) => updateField('critical', Number(event.target.value) || 0)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-white outline-none focus:border-sky-400/60"
              disabled={isSubmitting}
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-white/70">Severity</span>
          <select
            value={form.severity}
            onChange={(event) => updateField('severity', event.target.value)}
            className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-white outline-none focus:border-sky-400/60"
            disabled={isSubmitting}
          >
            {SCENARIO_SEVERITY_OPTIONS.map((option) => (
              <option key={option} value={option} className="bg-slate-900 capitalize">
                {option}
              </option>
            ))}
          </select>
        </label>

        {error && (
          <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-xl border border-sky-400/50 bg-sky-500/20 px-4 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Starting scenario…' : 'Run scenario on map'}
        </button>
      </form>
    </div>
  )
}
