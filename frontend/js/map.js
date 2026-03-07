(function () {
  const API_BASE = 'http://localhost:5000';
  const API_BASE_URL = 'http://localhost:5000';

  const KENYA_CENTER = [-1.2921, 36.8219];
  const DEFAULT_ZOOM = 6;

  const mapEl = document.getElementById('map');
  const statusEl = document.getElementById('mapStatus');

  if (!mapEl) return;

  const map = L.map('map', {
    center: KENYA_CENTER,
    zoom: DEFAULT_ZOOM,
    zoomControl: true,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);

  L.control.zoom({ position: 'topright' }).addTo(map);

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg;
  }

  function createGreenIcon(isComingSoon) {
    const size = isComingSoon ? 32 : 40;
    const opacity = isComingSoon ? 0.65 : 1;
    const html = `
      <div style="
        width:${size}px; height:${size}px;
        background: rgba(40, 167, 69, ${opacity});
        border: 2px solid rgba(245,243,238,0.9);
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 2px 10px rgba(0,0,0,0.35);
      "></div>
    `;
    return L.divIcon({
      html,
      className: 'alina-marker',
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
    });
  }

  function popupContent(rental) {
    const isComingSoon = rental.isComingSoon;
    const title = isComingSoon ? 'Coming Soon in this Area' : (rental.title || 'Vehicle');
    const areaCity = [rental.area, rental.city].filter(Boolean).join(', ') || (rental.city || rental.area || '');
    const priceLine = !isComingSoon && rental.price != null ? `<p class="map-popup__price">KES ${Number(rental.price).toLocaleString()} / day</p>` : '';
    const viewStayHtml = isComingSoon
      ? ''
      : `<a href="booking.html?id=${encodeURIComponent(rental.id)}" class="map-popup__btn">View Vehicle</a>`;

    return `
      <div class="map-popup ${isComingSoon ? 'map-popup--coming-soon' : ''}">
        <p class="map-popup__title">${title}</p>
        ${areaCity ? `<p class="map-popup__area">${areaCity}</p>` : ''}
        ${priceLine}
        ${viewStayHtml}
      </div>
    `;
  }

  async function loadRentals() {
    setStatus('Loading vehicles…');

    const params = new URLSearchParams(window.location.search);
    const city = params.get('city');
    const area = params.get('area');
    let url = `${API_BASE}/api/rentals`;
    if (city || area) {
      const q = new URLSearchParams();
      if (city) q.set('city', city);
      if (area) q.set('area', area);
      url += '?' + q.toString();
    }

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      const rentals = await res.json();

      if (!Array.isArray(rentals) || rentals.length === 0) {
        setStatus('No vehicles to show on the map.');
        return;
      }

      const bounds = L.latLngBounds();
      const markers = [];

      rentals.forEach((r) => {
        const lat = r.latitude;
        const lng = r.longitude;
        if (lat == null || lng == null) return;

        const marker = L.marker([lat, lng], {
          icon: createGreenIcon(r.isComingSoon),
        })
          .addTo(map)
          .bindPopup(popupContent(r), {
            maxWidth: 280,
            className: 'alina-popup',
          });

        markers.push(marker);
        bounds.extend([lat, lng]);
      });

      if (markers.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      }
      setStatus(`${rentals.length} ${rentals.length === 1 ? 'vehicle' : 'vehicles'} on the map`);
    } catch (err) {
      console.error('Map load error:', err);
      setStatus('Unable to load vehicles. Try again later.');
    }
  }

  loadRentals();
})();
