import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import places from './data/places.json'
import './App.css'

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

const PLACE_ZOOM = 13

function makeIcon(visited, highlightState) {
  const classes = ['pin', visited ? 'pin-visited' : 'pin-want']
  if (highlightState === 'active') classes.push('pin-highlight')
  if (highlightState === 'dimmed') classes.push('pin-dimmed')

  return L.divIcon({
    className: '',
    html: `<span class="${classes.join(' ')}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
  })
}

function makeHighlightIcon(favorite) {
  const classes = ['highlight-dot', favorite ? 'highlight-dot-favorite' : 'highlight-dot-plain']
  return L.divIcon({
    className: '',
    html: `<span class="${classes.join(' ')}"></span>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, -6],
  })
}

// Deterministic small lat/lng offset so a place's highlights fan out around
// its pin instead of stacking exactly on top of it or on top of each other.
function jitterOffset(seed) {
  let hash = 0
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  const angle = (Math.abs(hash) % 360) * (Math.PI / 180)
  const dist = 0.0025 + (Math.abs(hash >> 8) % 100 / 100) * 0.003
  return { dLat: Math.cos(angle) * dist, dLng: Math.sin(angle) * dist }
}

function ClickCatcher({ onBackgroundClick }) {
  useMapEvents({
    click() {
      onBackgroundClick()
    },
  })
  return null
}

// Exposes the underlying Leaflet map instance to the rest of the app via a ref,
// since App itself renders outside the MapContainer's Leaflet context.
function MapRefSetter({ mapRef }) {
  const map = useMap()
  useEffect(() => {
    mapRef.current = map
  }, [map, mapRef])
  return null
}

// Smoothly pans/zooms to fit whichever locations belong to the active trip.
function FlyToActiveTrip({ activeTrip, locations, mapRef }) {
  useEffect(() => {
    const map = mapRef.current
    if (!map || !activeTrip) return
    const matching = locations.filter((location) =>
      location.visits.some((visit) => visit.trip === activeTrip)
    )
    if (matching.length === 0) return

    if (matching.length === 1) {
      const [{ lat, lng }] = matching
      map.flyTo([lat, lng], Math.max(map.getZoom(), 6), { duration: 1 })
    } else {
      const bounds = L.latLngBounds(matching.map((location) => [location.lat, location.lng]))
      map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 9, duration: 1 })
    }
  }, [activeTrip, locations, mapRef])

  return null
}

// Group individual place-visit records by location so a place visited on
// multiple trips renders as a single pin whose popup lists every visit.
function groupByLocation(records) {
  const groups = new Map()
  for (const record of records) {
    const key = record.place_name.trim().toLowerCase()
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        place_name: record.place_name,
        lat: record.lat,
        lng: record.lng,
        visited: false,
        visits: [],
      })
    }
    const group = groups.get(key)
    if (record.visited) group.visited = true
    group.visits.push({
      trip: record.trip || null,
      note: record.note || null,
      date_start: record.date_start || null,
      date_end: record.date_end || null,
      visited: record.visited,
      highlights: record.highlights || [],
    })
  }
  return [...groups.values()]
}

function App() {
  const [activeTrip, setActiveTrip] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [focusedPlaceKey, setFocusedPlaceKey] = useState(null)
  const [panel, setPanel] = useState({ mode: 'trips' })
  const mapRef = useRef(null)

  const locations = useMemo(() => groupByLocation(places), [])
  const locationsByKey = useMemo(() => new Map(locations.map((l) => [l.key, l])), [locations])

  const flyToPlace = (location) => {
    const map = mapRef.current
    if (map) {
      map.flyTo([location.lat, location.lng], Math.max(map.getZoom(), PLACE_ZOOM), {
        duration: 0.8,
      })
    }
  }

  const handleTripClick = (trip) => {
    if (activeTrip === trip) {
      setActiveTrip(null)
      setPanel({ mode: 'trips' })
      return
    }
    setActiveTrip(trip)
    setFocusedPlaceKey(null)
    setPanel({ mode: 'trip', trip })
    setMenuOpen(true)
  }

  const handlePlaceClick = (location, explicitTrip) => {
    const fromTrip =
      explicitTrip !== undefined
        ? explicitTrip
        : panel.mode === 'trip' && location.visits.some((v) => v.trip === panel.trip)
          ? panel.trip
          : null
    setFocusedPlaceKey(location.key)
    setPanel({ mode: 'place', placeKey: location.key, fromTrip })
    setMenuOpen(true)
    flyToPlace(location)
  }

  const handleBack = () => {
    if (panel.mode === 'place' && panel.fromTrip) {
      setPanel({ mode: 'trip', trip: panel.fromTrip })
      setFocusedPlaceKey(null)
      return
    }
    setActiveTrip(null)
    setFocusedPlaceKey(null)
    setPanel({ mode: 'trips' })
  }

  const trips = useMemo(() => {
    const info = new Map()
    for (const location of locations) {
      const visitsByTrip = new Map()
      for (const visit of location.visits) {
        if (!visit.trip) continue
        if (!visitsByTrip.has(visit.trip)) visitsByTrip.set(visit.trip, [])
        visitsByTrip.get(visit.trip).push(visit.date_start, visit.date_end)
      }
      for (const [trip, dates] of visitsByTrip) {
        if (!info.has(trip)) info.set(trip, { count: 0, dates: [] })
        const entry = info.get(trip)
        entry.count += 1
        entry.dates.push(...dates.filter(Boolean))
      }
    }
    return [...info.entries()]
      .map(([trip, { count, dates }]) => {
        const sortedDates = [...dates].sort()
        const earliest = sortedDates[0] || null
        const latest = sortedDates[sortedDates.length - 1] || null
        return { trip, count, earliest, latest }
      })
      .sort((a, b) => {
        if (a.latest && b.latest) return b.latest.localeCompare(a.latest)
        if (a.latest) return -1
        if (b.latest) return 1
        return a.trip.localeCompare(b.trip)
      })
  }, [locations])

  // Places belonging to the trip currently shown in the sidebar, each paired
  // with just the highlights from their visit(s) on that trip.
  const tripPlaces = useMemo(() => {
    if (panel.mode !== 'trip') return []
    return locations
      .map((location) => {
        const visits = location.visits.filter((v) => v.trip === panel.trip)
        if (visits.length === 0) return null
        const highlights = visits.flatMap((v) => v.highlights)
        return { location, highlights }
      })
      .filter(Boolean)
  }, [panel, locations])

  const formatMonthYear = (dateStr) => {
    const [year, month] = dateStr.split('-')
    const date = new Date(Number(year), Number(month) - 1)
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  const formatVisitDateRange = (dateStart, dateEnd) => {
    if (!dateStart) return null
    if (!dateEnd || dateEnd === dateStart) return dateStart
    return `${dateStart} – ${dateEnd}`
  }

  const formatTripDateRange = ({ earliest, latest }) => {
    if (!earliest) return null
    const start = formatMonthYear(earliest)
    const end = formatMonthYear(latest)
    return start === end ? start : `${start} – ${end}`
  }

  const focusedPlace = panel.mode === 'place' ? locationsByKey.get(panel.placeKey) : null

  // If we arrived at this place via a specific trip, scope everything (list
  // + map dots) to that trip's visit. Otherwise (a direct pin click) fall
  // back to every visit, grouped so a place visited on multiple trips never
  // merges their highlights into one undifferentiated list.
  const focusedVisits = useMemo(() => {
    if (!focusedPlace) return []
    if (panel.mode === 'place' && panel.fromTrip) {
      return focusedPlace.visits.filter((v) => v.trip === panel.fromTrip)
    }
    return focusedPlace.visits
  }, [focusedPlace, panel])

  const focusedHighlightGroups = useMemo(
    () =>
      focusedVisits
        .map((visit) => ({
          trip: visit.trip,
          dateRange: formatVisitDateRange(visit.date_start, visit.date_end),
          highlights: visit.highlights,
        }))
        .filter((group) => group.highlights.length > 0),
    [focusedVisits]
  )

  const markers = useMemo(
    () =>
      locations.map((location) => {
        let highlightState = 'none'
        if (activeTrip) {
          const matches = location.visits.some((v) => v.trip === activeTrip)
          highlightState = matches ? 'active' : 'dimmed'
        }
        return { location, icon: makeIcon(location.visited, highlightState) }
      }),
    [locations, activeTrip]
  )

  // Small dots fanned out around the focused place's pin, one per highlight,
  // only rendered once you're zoomed into that specific place. Scoped to
  // focusedVisits, so a place visited on multiple trips only shows dots for
  // every trip's highlights when opened via a direct pin click, or just the
  // one trip's when opened via that trip's sidebar view.
  const highlightMarkers = useMemo(() => {
    if (!focusedPlace) return []
    return focusedVisits.flatMap((visit, vi) =>
      visit.highlights.map((highlight, hi) => {
        const { dLat, dLng } = jitterOffset(`${focusedPlace.key}:${vi}:${hi}:${highlight.name}`)
        return {
          highlight,
          trip: visit.trip,
          dateRange: formatVisitDateRange(visit.date_start, visit.date_end),
          position: [focusedPlace.lat + dLat, focusedPlace.lng + dLng],
          icon: makeHighlightIcon(highlight.favorite),
          key: `${vi}-${hi}`,
        }
      })
    )
  }, [focusedPlace, focusedVisits])

  const renderHighlightList = (highlights) => (
    <ul className="highlight-list">
      {highlights.map((highlight, i) => (
        <li key={i} className="highlight-list-item">
          {highlight.favorite && <span className="highlight-star">★</span>}
          <span className="highlight-name">{highlight.name}</span>
          {highlight.category && <span className="highlight-category">{highlight.category}</span>}
          {highlight.note && <p className="highlight-note">{highlight.note}</p>}
        </li>
      ))}
    </ul>
  )

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-text">
          <h1>Passport</h1>
          <p className="app-subtitle">Places I've been, and places I want to go</p>
        </div>
        <button
          type="button"
          className="menu-toggle"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
        >
          Trips
        </button>
      </header>

      <aside className={`trips-panel ${menuOpen ? 'trips-panel-open' : ''}`}>
        {panel.mode === 'trips' && (
          <>
            <div className="trips-panel-header">
              <h2>Trips</h2>
              <button
                type="button"
                className="trips-panel-close"
                onClick={() => setMenuOpen(false)}
                aria-label="Close trips menu"
              >
                &times;
              </button>
            </div>
            {trips.length === 0 && <p className="trips-empty">No trips tagged yet.</p>}
            <ul className="trips-list">
              {trips.map((tripInfo) => (
                <li key={tripInfo.trip}>
                  <button
                    type="button"
                    className={`trips-list-item ${activeTrip === tripInfo.trip ? 'trips-list-item-active' : ''}`}
                    onClick={() => handleTripClick(tripInfo.trip)}
                  >
                    <span className="trips-list-text">
                      <span className="trips-list-name">{tripInfo.trip}</span>
                      {formatTripDateRange(tripInfo) && (
                        <span className="trips-list-date">{formatTripDateRange(tripInfo)}</span>
                      )}
                    </span>
                    <span className="trips-list-count">{tripInfo.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {panel.mode === 'trip' && (
          <>
            <div className="trips-panel-header">
              <button type="button" className="panel-back" onClick={handleBack}>
                ← Trips
              </button>
              <button
                type="button"
                className="trips-panel-close"
                onClick={() => setMenuOpen(false)}
                aria-label="Close trips menu"
              >
                &times;
              </button>
            </div>
            <h2 className="panel-title">{panel.trip}</h2>
            {tripPlaces.length === 0 && <p className="trips-empty">No places tagged yet.</p>}
            <ul className="place-group-list">
              {tripPlaces.map(({ location, highlights }) => (
                <li key={location.key} className="place-group">
                  <button
                    type="button"
                    className="place-group-header"
                    onClick={() => handlePlaceClick(location, panel.trip)}
                  >
                    {location.place_name}
                  </button>
                  {highlights.length > 0 ? (
                    renderHighlightList(highlights)
                  ) : (
                    <p className="place-group-empty">No highlights yet.</p>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        {panel.mode === 'place' && focusedPlace && (
          <>
            <div className="trips-panel-header">
              <button type="button" className="panel-back" onClick={handleBack}>
                ← {panel.fromTrip || 'Trips'}
              </button>
              <button
                type="button"
                className="trips-panel-close"
                onClick={() => setMenuOpen(false)}
                aria-label="Close trips menu"
              >
                &times;
              </button>
            </div>
            <h2 className="panel-title">{focusedPlace.place_name}</h2>
            {focusedHighlightGroups.length === 0 && (
              <p className="place-group-empty">No highlights yet.</p>
            )}
            {focusedHighlightGroups.length === 1 &&
              renderHighlightList(focusedHighlightGroups[0].highlights)}
            {focusedHighlightGroups.length > 1 &&
              focusedHighlightGroups.map((group, i) => (
                <div key={i} className="highlight-group">
                  <p className="highlight-group-label">
                    {group.trip || 'Untagged visit'}
                    {group.dateRange ? ` · ${group.dateRange}` : ''}
                  </p>
                  {renderHighlightList(group.highlights)}
                </div>
              ))}
          </>
        )}
      </aside>

      <MapContainer center={[20, 20]} zoom={2} className="map-container" scrollWheelZoom>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <ClickCatcher
          onBackgroundClick={() => {
            setActiveTrip(null)
            setFocusedPlaceKey(null)
          }}
        />
        <MapRefSetter mapRef={mapRef} />
        <FlyToActiveTrip activeTrip={activeTrip} locations={locations} mapRef={mapRef} />

        {markers.map(({ location, icon }) => (
          <Marker
            key={location.key}
            position={[location.lat, location.lng]}
            icon={icon}
            eventHandlers={{ click: () => handlePlaceClick(location) }}
          >
            <Popup>
              <div className="popup">
                <h3 className="popup-title">{location.place_name}</h3>
                {location.visits.map((visit, i) => (
                  <div className="popup-visit" key={i}>
                    {visit.note && <p className="popup-note">{visit.note}</p>}
                    {formatVisitDateRange(visit.date_start, visit.date_end) && (
                      <p className="popup-date">
                        Visited {formatVisitDateRange(visit.date_start, visit.date_end)}
                      </p>
                    )}
                    {visit.trip && (
                      <button
                        type="button"
                        className="popup-trip"
                        onClick={() => handleTripClick(visit.trip)}
                      >
                        Part of: {visit.trip}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Popup>
          </Marker>
        ))}

        {highlightMarkers.map(({ highlight, trip, dateRange, position, icon, key }) => (
            <Marker key={key} position={position} icon={icon}>
              <Popup>
                <div className="popup">
                  {highlight.favorite && <span className="highlight-star">★</span>}
                  <h3 className="popup-title popup-title-inline">{highlight.name}</h3>
                  {highlight.category && (
                    <p className="popup-date">{highlight.category}</p>
                  )}
                  {highlight.note && <p className="popup-note">{highlight.note}</p>}
                  {(trip || dateRange) && (
                    <p className="popup-date">
                      {[trip, dateRange].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>

      <div className="legend">
        <div className="legend-item">
          <span className="pin pin-visited legend-swatch" />
          <span>Visited</span>
        </div>
        <div className="legend-item">
          <span className="pin pin-want legend-swatch" />
          <span>Want to go</span>
        </div>
      </div>
    </div>
  )
}

export default App
