import { useCallback, useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import ScenarioForm from './ScenarioForm'
import HospitalManagementPanel from './HospitalManagementPanel'
import {
  fetchHospitalIntelligence,
  type HospitalClickPayload,
  type HospitalIntelligenceProfile
} from '../types/hospitalIntelligence'
import { cacheHospitalProfile } from '../utils/hospitalOsUtils'
import { saveScenarioContext } from '../utils/scenarioStore'
import {
  createImpactCircle,
  getImpactColor,
  analyzeScenarioFromForm,
  type HospitalRecommendation,
  type ImpactAnalysisResponse,
  type ScenarioAnalysisResponse,
  type ScenarioFormInput,
  type ScenarioItem
} from '../utils/scenarioUtils'

interface RouteSummary {
  hospital_name: string
  etaMinutes: number
  distanceKm: number
  congestion: string
  alternatives: number
  geometry: GeoJSON.LineString | string
  bestScore: number
}

interface ImpactRenderData {
  analysis: ImpactAnalysisResponse
  color: string
  routes: RouteSummary[]
}

const IMPACT_ZONE_SOURCE = 'impact-zones-source'
const IMPACT_ZONE_FILL = 'impact-zones-fill'
const IMPACT_ZONE_OUTLINE = 'impact-zones-outline'
const ROUTE_SOURCE = 'hospital-routes-source'
const ROUTE_LAYER = 'hospital-routes-layer'

const HOSPITAL_ROUTE_COLORS = ['#38bdf8', '#34d399', '#a78bfa', '#f472b6', '#fbbf24', '#fb7185', '#2dd4bf']

function createHospitalMarkerElement(
  name: string,
  critical: number,
  nonCritical: number,
  etaMinutes: number | null,
  distanceKm: number | null,
  color: string,
  onClick: () => void
) {
  const root = document.createElement('div')
  root.style.display = 'flex'
  root.style.flexDirection = 'column'
  root.style.alignItems = 'center'
  root.style.pointerEvents = 'auto'
  root.style.cursor = 'pointer'

  const label = document.createElement('div')
  label.style.display = 'flex'
  label.style.flexDirection = 'column'
  label.style.alignItems = 'center'
  label.style.gap = '2px'
  label.style.marginBottom = '6px'
  label.style.padding = '6px 10px'
  label.style.borderRadius = '10px'
  label.style.border = `1px solid ${color}66`
  label.style.background = 'rgba(0, 0, 0, 0.78)'
  label.style.backdropFilter = 'blur(8px)'
  label.style.boxShadow = '0 4px 14px rgba(0, 0, 0, 0.45)'
  label.style.maxWidth = '160px'
  label.style.textAlign = 'center'

  const nameEl = document.createElement('span')
  nameEl.textContent = name
  nameEl.style.color = '#ffffff'
  nameEl.style.fontSize = '11px'
  nameEl.style.fontWeight = '600'
  nameEl.style.lineHeight = '1.3'
  nameEl.style.wordBreak = 'break-word'

  const capacityEl = document.createElement('span')
  capacityEl.textContent = `Critical: ${critical} | Non-critical: ${nonCritical}`
  capacityEl.style.color = color
  capacityEl.style.fontSize = '10px'
  capacityEl.style.fontWeight = '700'
  capacityEl.style.letterSpacing = '0.02em'

  const etaEl = document.createElement('span')
  etaEl.textContent = etaMinutes
    ? `${etaMinutes} min${distanceKm ? ` · ${distanceKm} km` : ''}`
    : 'Route ETA unavailable'
  etaEl.style.color = '#bae6fd'
  etaEl.style.fontSize = '10px'
  etaEl.style.fontWeight = '600'

  const pin = document.createElement('div')
  pin.style.width = '14px'
  pin.style.height = '14px'
  pin.style.borderRadius = '50%'
  pin.style.background = color
  pin.style.border = '2px solid #ffffff'
  pin.style.boxShadow = `0 0 0 2px ${color}55`

  label.appendChild(nameEl)
  label.appendChild(etaEl)
  label.appendChild(capacityEl)
  root.appendChild(label)
  root.appendChild(pin)
  root.addEventListener('click', (event) => {
    event.stopPropagation()
    onClick()
  })

  return root
}

function toLineCoordinates(geometry: GeoJSON.LineString | string): [number, number][] {
  if (typeof geometry === 'string') {
    return decodePolyline(geometry)
  }
  return geometry.coordinates as [number, number][]
}

function decodePolyline(polyline: string) {
  const points: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < polyline.length) {
    let b
    let shift = 0
    let result = 0
    do {
      b = polyline.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const deltaLat = ((result & 1) ? ~(result >> 1) : (result >> 1))
    lat += deltaLat

    shift = 0
    result = 0
    do {
      b = polyline.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const deltaLng = ((result & 1) ? ~(result >> 1) : (result >> 1))
    lng += deltaLng

    points.push([lng / 1e5, lat / 1e5])
  }

  return points
}

export default function MapDashboard() {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const impactMarkersRef = useRef<mapboxgl.Marker[]>([])
  const hospitalMarkersRef = useRef<mapboxgl.Marker[]>([])

  const [scenario, setScenario] = useState<ScenarioItem | null>(null)
  const [impactData, setImpactData] = useState<ImpactRenderData[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [isLoadingRoutes, setIsLoadingRoutes] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('Loading hospital routes…')
  const [mapReady, setMapReady] = useState(false)
  const [selectedHospitalName, setSelectedHospitalName] = useState<string | null>(null)
  const [hospitalPanelOpen, setHospitalPanelOpen] = useState(false)
  const [hospitalIntelLoading, setHospitalIntelLoading] = useState(false)
  const [hospitalIntelError, setHospitalIntelError] = useState<string | null>(null)
  const [hospitalProfile, setHospitalProfile] = useState<HospitalIntelligenceProfile | null>(null)

  const hospitalClickRef = useRef<(payload: HospitalClickPayload) => void>(() => {})

  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const apiBase = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? '' : 'http://127.0.0.1:8000')

  const clearMapAnnotations = useCallback(() => {
    if (!map.current) return

    impactMarkersRef.current.forEach((marker) => marker.remove())
    impactMarkersRef.current = []
    hospitalMarkersRef.current.forEach((marker) => marker.remove())
    hospitalMarkersRef.current = []

    for (const layerId of [ROUTE_LAYER, IMPACT_ZONE_FILL, IMPACT_ZONE_OUTLINE]) {
      if (map.current.getLayer(layerId)) map.current.removeLayer(layerId)
    }
    for (const sourceId of [ROUTE_SOURCE, IMPACT_ZONE_SOURCE]) {
      if (map.current.getSource(sourceId)) map.current.removeSource(sourceId)
    }
  }, [])

  const fetchRoutesForImpact = async (
    impact: ImpactAnalysisResponse,
    hospitalList: HospitalRecommendation[]
  ): Promise<RouteSummary[]> => {
    const routeRequests = hospitalList.map(async (item) => {
      const url =
        `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/` +
        `${impact.longitude},${impact.latitude};${item.longitude},${item.latitude}` +
        `?alternatives=true&annotations=duration,congestion&geometries=geojson&overview=full&depart_at=now&access_token=${mapboxToken}`

      const responseRoute = await fetch(url)
      const data = await responseRoute.json()
      const routesForHospital = data.routes || []
      if (!routesForHospital.length) return null

      const rankedRoutes = routesForHospital
        .map((route: {
          duration: number
          distance: number
          geometry: GeoJSON.LineString
          legs?: Array<{
            annotation?: {
              congestion?: boolean[]
              congestion_numeric?: Array<number | null>
            }
          }>
        }) => {
          const congestionList = route.legs?.[0]?.annotation?.congestion || []
          const congestionNumeric = route.legs?.[0]?.annotation?.congestion_numeric || []
          const avgCongestion = congestionNumeric.length
            ? congestionNumeric.reduce((sum: number, value: number | null) => sum + (value ?? 0), 0) / congestionNumeric.length
            : congestionList.length
              ? (congestionList.filter(Boolean).length / Math.max(1, congestionList.length)) * 100
              : 0
          const durationMinutes = route.duration / 60
          const score = durationMinutes * 0.6 + avgCongestion * 0.4
          return { route, score, avgCongestion }
        })
        .sort((a: { score: number }, b: { score: number }) => a.score - b.score)

      const best = rankedRoutes[0].route
      const congestionLevels = best.legs?.[0]?.annotation?.congestion || []
      const congestionValue = best.legs?.[0]?.annotation?.congestion_numeric || []
      const averageCongestion = congestionValue.length
        ? Math.round(congestionValue.reduce((sum: number, value: number | null) => sum + (value ?? 0), 0) / congestionValue.length)
        : Math.round((congestionLevels.filter(Boolean).length / Math.max(1, congestionLevels.length)) * 100)
      const congestionLabel = averageCongestion >= 70 ? 'Heavy' : averageCongestion >= 35 ? 'Moderate' : 'Low'

      return {
        hospital_name: item.hospital_name,
        etaMinutes: Math.max(1, Math.round(best.duration / 60)),
        distanceKm: +(best.distance / 1000).toFixed(1),
        congestion: congestionLabel,
        alternatives: routesForHospital.length,
        geometry: best.geometry,
        bestScore: rankedRoutes[0].score
      }
    })

    return (await Promise.all(routeRequests)).filter(Boolean) as RouteSummary[]
  }

  const handleHospitalClick = useCallback(async (payload: HospitalClickPayload) => {
    setSelectedHospitalName(payload.name)
    setHospitalPanelOpen(true)
    setHospitalIntelLoading(true)
    setHospitalIntelError(null)
    setHospitalProfile(null)

    try {
      const profile = await fetchHospitalIntelligence(apiBase, payload)
      cacheHospitalProfile(profile)
      setHospitalProfile(profile)
    } catch (error) {
      setHospitalIntelError(error instanceof Error ? error.message : 'Failed to collect hospital intelligence')
    } finally {
      setHospitalIntelLoading(false)
    }
  }, [apiBase])

  useEffect(() => {
    hospitalClickRef.current = handleHospitalClick
  }, [handleHospitalClick])

  const applyScenarioAnalysis = async (
    selected: ScenarioItem,
    result: ScenarioAnalysisResponse
  ) => {
    setScenario(selected)
    setIsLoaded(true)
    setImpactData([])
    clearMapAnnotations()

    const analyses = await Promise.all(
      result.impact_analyses.map(async (analysis, index) => ({
        analysis,
        color: getImpactColor(selected.type, index),
        routes: await fetchRoutesForImpact(analysis, analysis.hospitals ?? [])
      }))
    )

    setImpactData(analyses)

    const allHospitals = analyses.flatMap(({ analysis, routes }) =>
      (analysis.hospitals ?? []).map((hospital) => ({
        ...hospital,
        impactZone: analysis.impact_point_name,
        etaMinutes: routes.find((route) => route.hospital_name === hospital.hospital_name)?.etaMinutes
      }))
    )
    saveScenarioContext(result.scenario_id, result.scenario_name, result.scenario_type, allHospitals)
  }

  const loadScenario = async (selected: ScenarioItem) => {
    setIsLoadingRoutes(true)
    setLoadingMessage('Analyzing hospitals and mapping routes…')
    setScenario(null)
    setIsLoaded(false)

    try {
      const response = await fetch(`${apiBase}/api/v1/analyze-scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selected)
      })

      if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`API error (${response.status}): ${errorBody}`)
      }

      const result = await response.json() as ScenarioAnalysisResponse

      if (!Array.isArray(result.impact_analyses) || !result.impact_analyses.length) {
        throw new Error('API returned no impact analyses')
      }

      await applyScenarioAnalysis(selected, result)
    } catch (error) {
      console.error('Failed to load scenario', error)
      setScenario(null)
      setIsLoaded(false)
      setImpactData([])
      alert(error instanceof Error ? error.message : 'Failed to load scenario. Start the backend with: uvicorn app.main:app --reload --port 8000')
    } finally {
      setIsLoadingRoutes(false)
    }
  }

  const handleScenarioFormSubmit = async (form: ScenarioFormInput) => {
    setIsLoadingRoutes(true)
    setLoadingMessage('Resolving incident location with Gemini…')

    try {
      const { scenario, analysis } = await analyzeScenarioFromForm(apiBase, form)
      setLoadingMessage('Mapping hospital routes…')
      await applyScenarioAnalysis(scenario, analysis)
    } catch (error) {
      console.error('Failed to prepare scenario', error)
      setScenario(null)
      setIsLoaded(false)
      setImpactData([])
      throw error
    } finally {
      setIsLoadingRoutes(false)
    }
  }

  const renderMapAnnotations = useCallback(() => {
    if (!map.current || !scenario || !impactData.length) return

    clearMapAnnotations()

    const bounds = new mapboxgl.LngLatBounds()
    const zoneFeatures = impactData.map(({ analysis, color }) => ({
      type: 'Feature' as const,
      properties: {
        impact_point_id: analysis.impact_point_id,
        impact_point_name: analysis.impact_point_name,
        color
      },
      geometry: createImpactCircle(
        [analysis.longitude, analysis.latitude],
        analysis.radius_km
      )
    }))

    map.current.addSource(IMPACT_ZONE_SOURCE, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: zoneFeatures }
    })

    map.current.addLayer({
      id: IMPACT_ZONE_FILL,
      type: 'fill',
      source: IMPACT_ZONE_SOURCE,
      paint: {
        'fill-color': ['get', 'color'],
        'fill-opacity': 0.18
      }
    })

    map.current.addLayer({
      id: IMPACT_ZONE_OUTLINE,
      type: 'line',
      source: IMPACT_ZONE_SOURCE,
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 2,
        'line-opacity': 0.85
      }
    })

    const routeFeatures: Array<GeoJSON.Feature<GeoJSON.LineString>> = []

    impactData.forEach(({ analysis, color, routes }) => {
      const impactLngLat: [number, number] = [analysis.longitude, analysis.latitude]
      bounds.extend(impactLngLat)

      const impactMarker = new mapboxgl.Marker({ color })
        .setLngLat(impactLngLat)
        .setPopup(
          new mapboxgl.Popup({ offset: 25 }).setHTML(
            `<strong>${analysis.impact_point_name}</strong><br/>` +
            `${analysis.total_patients} patients<br/>` +
            `Impact radius: ${analysis.radius_km} km<br/>` +
            `${analysis.hospitals.length} hospitals assigned`
          )
        )
        .addTo(map.current!)
      impactMarkersRef.current.push(impactMarker)

      analysis.hospitals.forEach((hospital, hospitalIndex) => {
        const lngLat: [number, number] = [hospital.longitude, hospital.latitude]
        const route = routes.find((item) => item.hospital_name === hospital.hospital_name)
        const hospitalColor = HOSPITAL_ROUTE_COLORS[hospitalIndex % HOSPITAL_ROUTE_COLORS.length]

        bounds.extend(lngLat)

        const criticalHandled = hospital.critical_handled ?? Math.max(0, Math.round(hospital.patients_handled * 0.2))
        const nonCriticalHandled = hospital.non_critical_handled ?? Math.max(0, hospital.patients_handled - criticalHandled)

        const marker = new mapboxgl.Marker({
          element: createHospitalMarkerElement(
            hospital.hospital_name,
            criticalHandled,
            nonCriticalHandled,
            route?.etaMinutes ?? null,
            route?.distanceKm ?? null,
            hospitalColor,
            () => {
              hospitalClickRef.current({
                name: hospital.hospital_name,
                latitude: hospital.latitude,
                longitude: hospital.longitude,
                patients_assigned: hospital.patients_handled,
                critical_assigned: criticalHandled,
                non_critical_assigned: nonCriticalHandled,
                eta_minutes: route?.etaMinutes,
                distance_km: route?.distanceKm,
                congestion: route?.congestion,
                impact_zone: analysis.impact_point_name
              })
            }
          ),
          anchor: 'bottom'
        })
          .setLngLat(lngLat)
          .addTo(map.current!)

        hospitalMarkersRef.current.push(marker)

        if (route) {
          routeFeatures.push({
            type: 'Feature',
            properties: {
              impact_point_id: analysis.impact_point_id,
              hospital_name: route.hospital_name,
              color: hospitalColor,
              eta_minutes: route.etaMinutes,
              distance_km: route.distanceKm
            },
            geometry: {
              type: 'LineString',
              coordinates: toLineCoordinates(route.geometry)
            }
          })
        }
      })
    })

    if (routeFeatures.length) {
      map.current.addSource(ROUTE_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: routeFeatures }
      })

      map.current.addLayer({
        id: ROUTE_LAYER,
        type: 'line',
        source: ROUTE_SOURCE,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 4,
          'line-opacity': 0.85
        }
      })
    }

    map.current.fitBounds(bounds, { padding: 90, maxZoom: 12, duration: 1200 })
  }, [scenario, impactData, clearMapAnnotations])

  useEffect(() => {
    if (!mapContainer.current || !mapboxToken) return

    mapboxgl.accessToken = mapboxToken

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-122.397, 37.787],
      zoom: 11,
      pitch: 0,
      bearing: 0,
      attributionControl: false
    })

    map.current.on('load', () => {
      map.current?.resize()
      setMapReady(true)
    })

    map.current.on('error', (event) => {
      console.error('Mapbox error', event.error)
    })

    return () => {
      clearMapAnnotations()
      map.current?.remove()
      map.current = null
      setMapReady(false)
    }
  }, [mapboxToken, clearMapAnnotations])

  useEffect(() => {
    if (!mapReady || !isLoaded || isLoadingRoutes) return
    renderMapAnnotations()
  }, [mapReady, isLoaded, isLoadingRoutes, renderMapAnnotations])

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <div className="absolute top-4 right-4 z-10">
        {!isLoaded && (
          <ScenarioForm onSubmit={handleScenarioFormSubmit} isSubmitting={isLoadingRoutes} />
        )}
      </div>

      {isLoadingRoutes && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-white/10 bg-black/80 px-5 py-4 text-center text-white shadow-2xl">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
            <p className="mt-3 text-sm font-semibold text-sky-100">{loadingMessage}</p>
            <p className="text-xs text-white/70">Analyzing the scenario and mapping the best hospital options.</p>
          </div>
        </div>
      )}

      {isLoaded && scenario && (
        <div className="absolute top-4 right-4 z-10 max-w-sm rounded-2xl border border-white/10 bg-black/65 p-4 text-white shadow-2xl backdrop-blur-md">
          <p className="text-xs uppercase tracking-[0.25em] text-rose-300">Live Situation</p>
          <h2 className="mt-1 text-xl font-semibold">{scenario.name}</h2>
          <p className="text-sm text-white/80">
            {scenario.location?.name ?? scenario.impact_points?.[0]?.name ?? 'San Francisco'}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-white/6 p-3">
              <p className="text-white/60">Type</p>
              <p className="font-semibold capitalize">{scenario.type}</p>
            </div>
            <div className="rounded-xl bg-white/6 p-3">
              <p className="text-white/60">Severity</p>
              <p className="font-semibold capitalize">{scenario.summary.severity}</p>
            </div>
            <div className="rounded-xl bg-white/6 p-3 col-span-2">
              <p className="text-white/60">Patients</p>
              <p className="font-semibold">{scenario.summary.injured} injured, {scenario.summary.critical} critical</p>
            </div>
          </div>
        </div>
      )}

      {hospitalPanelOpen && selectedHospitalName && (
        <HospitalManagementPanel
          hospitalName={selectedHospitalName}
          isLoading={hospitalIntelLoading}
          error={hospitalIntelError}
          profile={hospitalProfile}
          onClose={() => {
            setHospitalPanelOpen(false)
            setHospitalIntelError(null)
          }}
        />
      )}

      {hospitalProfile && !hospitalIntelLoading && (
        <div className="absolute bottom-4 left-1/2 z-30 -translate-x-1/2">
          <button
            type="button"
            onClick={() => {
              const hospitalId = hospitalProfile.hospital_profile.hospital_id
              cacheHospitalProfile(hospitalProfile)
              window.open(`/hospital-os/${hospitalId}`, '_blank', 'noopener,noreferrer')
            }}
            className="rounded-2xl border border-sky-400/50 bg-sky-500/20 px-6 py-3 text-sm font-semibold text-sky-100 shadow-2xl backdrop-blur-md transition hover:bg-sky-500/30"
          >
            Open Hospital OS
          </button>
        </div>
      )}

      <div
        className="absolute inset-0"
        ref={mapContainer}
        style={{ width: '100vw', height: '100vh', minHeight: '100vh' }}
      />
    </div>
  )
}
