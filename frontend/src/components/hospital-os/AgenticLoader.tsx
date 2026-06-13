import { AGENT_PIPELINE } from '../../utils/hospitalOsEngine'

const AGENT_HINTS: Record<string, string> = {
  'Hospital Data Agent': 'Ingesting NPI registry, bed capacity, and equipment inventory',
  'Clinical Staffing Agent': 'Modeling nurse coverage and hiring priorities',
  'Physician Development Agent': 'Matching specialists to accredited conferences & courses',
  'Equipment Lifecycle & Market Agent': 'Reviewing equipment age vs. market innovations',
  'Incident Review Agent': 'Analyzing two-month incident digest patterns',
  'Clinical Evidence Agent': 'Retrieving indexed clinical & operational evidence',
  'Hospital Memory Agent': 'Updating persistent weakness and improvement memory',
  'Gemini Recommendation Agent': 'Synthesizing 30/60/90-day improvement roadmap'
}

interface AgenticLoaderProps {
  activeAgent: string | null
  progress: number
}

export function AgenticLoader({ activeAgent, progress }: AgenticLoaderProps) {
  const activeIndex = AGENT_PIPELINE.findIndex((a) => a === activeAgent)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-lg rounded-3xl border border-violet-200 bg-white p-8 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-violet-100 border-t-violet-600" />
            <div className="absolute inset-2 animate-pulse rounded-full bg-violet-50" />
          </div>
          <p className="mt-5 text-sm font-medium uppercase tracking-[0.25em] text-violet-600">Improvement cycle</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">Running agentic intelligence</h2>
          <p className="mt-2 text-sm text-slate-500">
            {activeAgent ? `Currently: ${activeAgent}` : 'Initializing agents…'}
          </p>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex justify-between text-xs text-slate-500">
            <span>Progress</span>
            <span className="font-mono font-medium text-violet-700">{progress}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-600 transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <ul className="mt-6 space-y-2">
          {AGENT_PIPELINE.map((agent, index) => {
            const done = activeIndex > index
            const running = activeAgent === agent
            return (
              <li
                key={agent}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                  running ? 'bg-violet-50 text-violet-900' : done ? 'text-emerald-700' : 'text-slate-400'
                }`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  running ? 'bg-violet-600 text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                }`}
                >
                  {done ? '✓' : index + 1}
                </span>
                <div className="min-w-0 text-left">
                  <span className={running ? 'font-medium' : ''}>{agent}</span>
                  {(running || done) && AGENT_HINTS[agent] && (
                    <p className="text-xs text-slate-500">{AGENT_HINTS[agent]}</p>
                  )}
                </div>
                {running && (
                  <span className="ml-auto shrink-0 text-xs text-violet-500 animate-pulse">Running…</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
