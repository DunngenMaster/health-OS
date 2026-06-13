import type { HospitalOsMasterReport } from '../types/hospitalOsReport'

export function exportReportAsPdf(report: HospitalOsMasterReport, hospitalName: string) {
  const recs = report.recommendations
  const digest = report.incident_digest.summary
  const memory = report.hospital_memory

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Hospital OS Report — ${hospitalName}</title>
<style>
  body { font-family: Georgia, serif; color: #1e293b; padding: 40px; max-width: 800px; margin: 0 auto; }
  h1 { font-size: 24px; color: #5b21b6; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b; margin-top: 28px; }
  .score { font-size: 36px; font-weight: bold; }
  ul { padding-left: 20px; }
  li { margin: 4px 0; }
  .badge { display: inline-block; background: #f5f3ff; color: #6d28d9; padding: 2px 8px; border-radius: 99px; font-size: 11px; }
  .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; }
</style></head><body>
  <h1>Hospital OS Intelligence Report</h1>
  <p><strong>${hospitalName}</strong></p>
  <p>Generated: ${new Date(report.generated_at).toLocaleString()}</p>
  <span class="badge">SIMULATED DATA — NOT LIVE TELEMETRY</span>

  <h2>Readiness Dashboard</h2>
  <p>Readiness: <span class="score">${report.readiness_dashboard.readiness_score}</span>/100</p>
  <p>Risk: <span class="score">${report.readiness_dashboard.risk_score}</span>/100</p>

  <h2>Two-Month Incident Digest</h2>
  <ul>
    <li>Total incidents: ${digest.total_incidents}</li>
    <li>Total patients: ${digest.total_patients}</li>
    <li>Deaths: ${digest.total_deaths}</li>
    <li>Preventable deaths (est.): ${digest.preventable_deaths_estimate}</li>
  </ul>

  <h2>30-Day Plan</h2>
  <ul>${recs['30_day_plan'].map((i: string) => `<li>${i}</li>`).join('')}</ul>

  <h2>60-Day Plan</h2>
  <ul>${recs['60_day_plan'].map((i: string) => `<li>${i}</li>`).join('')}</ul>

  <h2>90-Day Plan</h2>
  <ul>${recs['90_day_plan'].map((i: string) => `<li>${i}</li>`).join('')}</ul>

  <h2>Hospital Memory</h2>
  <ul>
    <li>Memory cycles: ${memory.readiness_history.length}</li>
    <li>Known weaknesses: ${memory.known_weaknesses.length}</li>
  </ul>

  <div class="footer">HealthOS Hospital OS — Agentic memory & clinical evidence platform</div>
</body></html>`

  const win = window.open('', '_blank', 'noopener,noreferrer')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}
