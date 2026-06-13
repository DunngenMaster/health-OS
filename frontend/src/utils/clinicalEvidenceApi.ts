import type { HospitalIntelligenceProfile } from '../types/hospitalIntelligence'
import type { HospitalMemory, IncidentDigest, RagFinding } from '../types/hospitalOsReport'

export interface RagHit {
  chunk_id: string
  content: string
  metadata: Record<string, string>
  score?: number
}

export interface ClinicalEvidenceContext {
  chunkCount: number
  defaultHits: RagHit[]
  queryHits: Record<string, RagHit[]>
  findings: RagFinding[]
  retrieval_engine: string
}

const CLINICAL_QUERIES = [
  'staffing shortages occurred in the last two months',
  'equipment caused diagnosis delays',
  'training should trauma doctors complete',
  'equipment upgrades reduce emergency response delay',
  'ICU bed capacity surge bottlenecks',
] as const

const DEFAULT_QUERY = 'staffing shortages equipment delays training trauma ICU ventilator triage'

async function queryRag(apiBase: string, hospitalId: string, query: string, topK: number): Promise<RagHit[]> {
  const response = await fetch(`${apiBase}/api/v1/hospital-os/rag-query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospital_id: hospitalId, query, top_k: topK }),
  })
  if (!response.ok) return []
  const payload = await response.json()
  return (payload.citations ?? []) as RagHit[]
}

function buildFindings(queryHits: Record<string, RagHit[]>): RagFinding[] {
  return CLINICAL_QUERIES.map((query) => {
    const hits = queryHits[query] ?? []
    const top = hits[0]
    return {
      query,
      retrieved_chunks: hits.length,
      summary: top ? top.content.slice(0, 280) : 'No direct evidence found.',
      confidence: top && (top.score ?? 0) >= 0.5 ? 'high' : top ? 'medium' : 'low',
      data_source_type: (top?.metadata?.data_source_type ?? 'unavailable') as RagFinding['data_source_type'],
    }
  })
}

export async function fetchClinicalEvidence(
  apiBase: string,
  hospitalId: string,
  profile: HospitalIntelligenceProfile,
  digest: IncidentDigest,
  memory: HospitalMemory | null
): Promise<ClinicalEvidenceContext | null> {
  try {
    const indexResponse = await fetch(`${apiBase}/api/v1/hospital-os/rag-index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hospital_id: hospitalId,
        profile,
        incident_digest: digest,
        hospital_memory: memory,
      }),
    })
    if (!indexResponse.ok) return null

    const indexPayload = await indexResponse.json()
    const defaultHits = await queryRag(apiBase, hospitalId, DEFAULT_QUERY, 8)

    const queryResults = await Promise.all(
      CLINICAL_QUERIES.map((query) => queryRag(apiBase, hospitalId, query, 3))
    )
    const queryHits = Object.fromEntries(
      CLINICAL_QUERIES.map((query, index) => [query, queryResults[index]])
    ) as Record<string, RagHit[]>

    return {
      chunkCount: indexPayload.chunks_indexed ?? 0,
      defaultHits,
      queryHits,
      findings: buildFindings(queryHits),
      retrieval_engine: indexPayload.retrieval_engine ?? 'chromadb',
    }
  } catch {
    return null
  }
}

export function queryHitsFor(clinical: ClinicalEvidenceContext | null | undefined, query: string): RagHit[] {
  if (!clinical) return []
  return clinical.queryHits[query] ?? clinical.defaultHits
}
