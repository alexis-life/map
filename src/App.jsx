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

function App() {
  const [activeTrip, setActiveTrip] = useState(null)

  const handleTripClick = (trip) => {
    setActiveTrip((current) => (current === trip ? null : trip))
  }

  const markers = useMemo(
    () =>
      places.map((place) => {
        let highlightState = 'none'
        if (activeTrip) {
          highlightState = place.trip === activeTrip ? 'active' : 'dimmed'
        }
        return { place, icon: makeIcon(place.visited, highlightState) }
      }),
    [activeTrip]
  )

  return (
    <div className="app">
      <header className="app-header">
        <h1>map.alexischao.com</h1>
        <p className="app-subtitle">Places I've been, and places I want to go</p>
      </header>

      <MapContainer center={[20, 20]} zoom={2} className="map-container" scrollWheelZoom>
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <ClickCatcher onBackgroundClick={() => setActiveTrip(null)} />

        {markers.map(({ place, icon }) => (
          <Marker key={place.place_name} position={[place.lat, place.lng]} icon={icon}>
            <Popup>
              <div className="popup">
                <h3 className="popup-title">{place.place_name}</h3>
                {place.note && <p className="popup-note">{place.note}</p>}
                {place.date_visited && (
                  <p className="popup-date">Visited {place.date_visited}</p>
                )}
                {place.trip && (
                  <button
                    type="button"
                    className="popup-trip"
                    onClick={() => handleTripClick(place.trip)}
                  >
                    Part of: {place.trip}
                  </button>
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
