import { useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import places from './data/places.json'
import './App.css'

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

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

function ClickCatcher({ onBackgroundClick }) {
  useMapEvents({
    click() {
      onBackgroundClick()
    },
  })
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
      date_visited: record.date_visited || null,
      visited: record.visited,
    })
  }
  return [...groups.values()]
}

function App() {
  const [activeTrip, setActiveTrip] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const handleTripClick = (trip) => {
    setActiveTrip((current) => (current === trip ? null : trip))
  }

  const locations = useMemo(() => groupByLocation(places), [])

  const trips = useMemo(() => {
    const info = new Map()
    for (const location of locations) {
      const visitsByTrip = new Map()
      for (const visit of location.visits) {
        if (!visit.trip) continue
        if (!visitsByTrip.has(visit.trip)) visitsByTrip.set(visit.trip, [])
        visitsByTrip.get(visit.trip).push(visit.date_visited)
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

  const formatMonthYear = (dateStr) => {
    const [year, month] = dateStr.split('-')
    const date = new Date(Number(year), Number(month) - 1)
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  const formatTripDateRange = ({ earliest, latest }) => {
    if (!earliest) return null
    const start = formatMonthYear(earliest)
    const end = formatMonthYear(latest)
    return start === end ? start : `${start} – ${end}`
  }

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

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-text">
          <h1>map.alexischao.com</h1>
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
      </aside>

      <MapContainer center={[20, 20]} zoom={2} className="map-container" scrollWheelZoom>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <ClickCatcher onBackgroundClick={() => setActiveTrip(null)} />

        {markers.map(({ location, icon }) => (
          <Marker key={location.place_name} position={[location.lat, location.lng]} icon={icon}>
            <Popup>
              <div className="popup">
                <h3 className="popup-title">{location.place_name}</h3>
                {location.visits.map((visit, i) => (
                  <div className="popup-visit" key={i}>
                    {visit.note && <p className="popup-note">{visit.note}</p>}
                    {visit.date_visited && (
                      <p className="popup-date">Visited {visit.date_visited}</p>
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
