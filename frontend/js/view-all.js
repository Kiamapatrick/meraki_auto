(function () {
  const API_BASE = 'https://meraki-backend-jdl2.onrender.com';

  const PAGE_SIZE = 12;

  const els = {
    status: document.getElementById('marketStatus'),
    grid: document.getElementById('vehiclesGrid'),
    meta: document.getElementById('marketMeta'),
    loadMore: document.getElementById('loadMoreBtn'),

    searchInput: document.getElementById('marketSearchInput'),
    searchBtn: document.getElementById('marketSearchBtn'),
    sort: document.getElementById('sortSelect'),

    filtersToggle: document.getElementById('filtersToggle'),
    filtersSidebar: document.getElementById('filtersSidebar'),

    priceRange: document.getElementById('priceRange'),
    priceRangeValue: document.getElementById('priceRangeValue'),
    transmission: document.getElementById('transmissionSelect'),
    fuel: document.getElementById('fuelSelect'),
    location: document.getElementById('locationInput'),
    clear: document.getElementById('clearFilters'),
  };

  function setStatus(msg, show = true) {
    if (!els.status) return;
    if (!show || !msg) {
      els.status.style.display = 'none';
      els.status.textContent = '';
      return;
    }
    els.status.style.display = 'block';
    els.status.textContent = msg;
  }

  function setMeta(msg) {
    if (!els.meta) return;
    if (!msg) {
      els.meta.style.display = 'none';
      els.meta.textContent = '';
      return;
    }
    els.meta.style.display = 'block';
    els.meta.textContent = msg;
  }

  function safeText(v) {
    return String(v ?? '').trim();
  }

  function normalizeText(v) {
    return safeText(v).toLowerCase();
  }

  function rentalId(r) {
    return r?.id ?? r?._id ?? r?.vehicleId ?? r?.unitId ?? r?.unitId?._id ?? '';
  }

  function rentalTitle(r) {
    return r?.title || r?.name || 'Vehicle';
  }

  function rentalLocation(r) {
    return [r?.area, r?.city, r?.location].filter(Boolean).join(', ');
  }

  function rentalCategory(r) {
    return r?.category || r?.type || '';
  }

  function imageSrc(rental) {
    const isFile = typeof window !== 'undefined' && window.location?.protocol === 'file:';
    const root = isFile ? '' : '/';
    const img = rental?.mainImage || rental?.images?.[0] || rental?.image;
    if (!img) return `${root}img/placeholder.jpg`;
    if (img.startsWith('http')) return img;
    if (img.startsWith('/')) return isFile ? img.slice(1) : img;
    if (img.startsWith('./')) return img;
    return img.startsWith('img/') ? `${root}${img}` : `${root}img/${img}`;
  }

  function formatPriceKES(value) {
    if (value == null || value === '') return '—';
    const n = Number(value);
    if (Number.isNaN(n)) return String(value);
    return n.toLocaleString();
  }

  function numberOrNull(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }

  function createCard(r) {
    const wrap = document.createElement('div');
    wrap.className = 'featured-card';

    const id = rentalId(r);
    const title = rentalTitle(r);
    const location = rentalLocation(r);
    const category = rentalCategory(r);
    const price = r?.dailyPrice ?? r?.price;

    wrap.setAttribute('data-id', safeText(id));
    wrap.setAttribute('data-title', safeText(title));
    wrap.setAttribute('data-location', safeText(location));
    wrap.setAttribute('data-category', safeText(category));
    wrap.setAttribute('data-transmission', safeText(r?.transmission));
    wrap.setAttribute('data-fuel', safeText(r?.fuelType));
    if (price != null && price !== '') wrap.setAttribute('data-price', String(price));
    if (r?.createdAt) wrap.setAttribute('data-created', safeText(r.createdAt));

    const priceLabel = formatPriceKES(price);

    wrap.innerHTML = `
      <img class="featured-card__img" src="${imageSrc(r)}" alt="${title}" loading="lazy" />
      <div class="featured-card__body">
        <div class="featured-card__top">
          <h3 class="featured-name">${title}</h3>
          <span class="featured-tag">Premium</span>
        </div>
        ${location ? `<div class="featured-price" style="opacity:0.9; font-size:0.9rem;">${location}</div>` : ''}
        <div class="featured-price"><strong>KES ${priceLabel}</strong> / day</div>
        <div class="featured-actions">
          <a class="index-btn index-btn--primary" href="booking.html?id=${encodeURIComponent(id)}">View Details</a>
        </div>
      </div>
    `;

    return wrap;
  }

  let allRentals = [];
  let filtered = [];
  let visibleCount = PAGE_SIZE;

  function selectedCategories() {
    const nodes = Array.from(document.querySelectorAll('input[name="category"]:checked'));
    return nodes.map((n) => normalizeText(n.value)).filter(Boolean);
  }

  function getFilters() {
    return {
      q: normalizeText(els.searchInput?.value),
      sort: els.sort?.value || 'newest',
      categories: selectedCategories(),
      maxPrice: numberOrNull(els.priceRange?.value),
      transmission: normalizeText(els.transmission?.value),
      fuel: normalizeText(els.fuel?.value),
      location: normalizeText(els.location?.value),
    };
  }

  function matchesFilters(r, f) {
    const title = normalizeText(rentalTitle(r));
    const loc = normalizeText(rentalLocation(r));
    const cat = normalizeText(rentalCategory(r));
    const transmission = normalizeText(r?.transmission);
    const fuel = normalizeText(r?.fuelType);
    const price = numberOrNull(r?.dailyPrice ?? r?.price);

    const matchesQuery = !f.q || title.includes(f.q) || loc.includes(f.q);
    const matchesCategory = !f.categories.length || f.categories.includes(cat);
    const matchesPrice = f.maxPrice == null || price == null || price <= f.maxPrice;
    const matchesTransmission = !f.transmission || transmission === f.transmission;
    const matchesFuel = !f.fuel || fuel === f.fuel;
    const matchesLocation = !f.location || loc.includes(f.location);

    return matchesQuery && matchesCategory && matchesPrice && matchesTransmission && matchesFuel && matchesLocation;
  }

  function sortRentals(list, sortKey) {
    const arr = list.slice();

    if (sortKey === 'price_low') {
      arr.sort((a, b) => {
        const ap = numberOrNull(a?.dailyPrice ?? a?.price) ?? Number.POSITIVE_INFINITY;
        const bp = numberOrNull(b?.dailyPrice ?? b?.price) ?? Number.POSITIVE_INFINITY;
        return ap - bp;
      });
      return arr;
    }

    if (sortKey === 'price_high') {
      arr.sort((a, b) => {
        const ap = numberOrNull(a?.dailyPrice ?? a?.price) ?? Number.NEGATIVE_INFINITY;
        const bp = numberOrNull(b?.dailyPrice ?? b?.price) ?? Number.NEGATIVE_INFINITY;
        return bp - ap;
      });
      return arr;
    }

    if (sortKey === 'az' || sortKey === 'za') {
      arr.sort((a, b) => {
        const an = normalizeText(rentalTitle(a));
        const bn = normalizeText(rentalTitle(b));
        return an.localeCompare(bn);
      });
      if (sortKey === 'za') arr.reverse();
      return arr;
    }

    // newest (fallback)
    arr.sort((a, b) => {
      const ad = Date.parse(a?.createdAt || '') || 0;
      const bd = Date.parse(b?.createdAt || '') || 0;
      return bd - ad;
    });

    return arr;
  }

  function render() {
    if (!els.grid) return;

    const total = filtered.length;
    const showing = Math.min(visibleCount, total);

    els.grid.innerHTML = '';
    filtered.slice(0, showing).forEach((r) => {
      els.grid.appendChild(createCard(r));
    });

    if (els.loadMore) {
      els.loadMore.style.display = showing < total ? 'inline-flex' : 'none';
    }

    if (total === 0) {
      setStatus('No vehicles match your filters. Try adjusting search or filters.');
    } else {
      setStatus('', false);
    }

    setMeta(`${total} vehicles found. Showing ${showing}.`);
  }

  function apply() {
    const f = getFilters();
    visibleCount = PAGE_SIZE;

    filtered = sortRentals(
      allRentals.filter((r) => matchesFilters(r, f)),
      f.sort
    );

    render();
  }

  function updatePriceLabel() {
    if (!els.priceRange || !els.priceRangeValue) return;
    const v = numberOrNull(els.priceRange.value) ?? 0;
    els.priceRangeValue.textContent = v.toLocaleString();
  }

  function clearFilters() {
    document.querySelectorAll('input[name="category"]').forEach((n) => (n.checked = false));
    if (els.priceRange) els.priceRange.value = String(els.priceRange.max || '300000');
    if (els.transmission) els.transmission.value = '';
    if (els.fuel) els.fuel.value = '';
    if (els.location) els.location.value = '';
    updatePriceLabel();
    apply();
  }

  function wireEvents() {
    els.searchInput?.addEventListener('input', apply);
    els.searchBtn?.addEventListener('click', apply);
    els.sort?.addEventListener('change', apply);

    document.querySelectorAll('input[name="category"]').forEach((n) => n.addEventListener('change', apply));

    els.priceRange?.addEventListener('input', () => {
      updatePriceLabel();
      apply();
    });

    els.transmission?.addEventListener('change', apply);
    els.fuel?.addEventListener('change', apply);
    els.location?.addEventListener('input', apply);

    els.clear?.addEventListener('click', clearFilters);

    els.loadMore?.addEventListener('click', () => {
      visibleCount += PAGE_SIZE;
      render();
    });

    els.filtersToggle?.addEventListener('click', () => {
      if (!els.filtersSidebar) return;
      els.filtersSidebar.classList.toggle('is-collapsed');
    });

    // Default: collapsed on narrow screens
    const mq = window.matchMedia('(max-width: 991px)');
    if (mq.matches) els.filtersSidebar?.classList.add('is-collapsed');
    mq.addEventListener?.('change', (e) => {
      if (e.matches) els.filtersSidebar?.classList.add('is-collapsed');
    });
  }

  async function load() {
    wireEvents();
    updatePriceLabel();

    try {
      setStatus('Loading vehicles…');
      const res = await fetch(`${API_BASE}/api/rentals`);
      if (!res.ok) throw new Error('vehicles fetch failed ' + res.status);
      const rentals = await res.json();

      if (!Array.isArray(rentals) || rentals.length === 0) {
        allRentals = [];
        filtered = [];
        render();
        return;
      }

      allRentals = rentals.filter((r) => r && !r.isComingSoon);
      apply();
    } catch (err) {
      console.error('Failed to load rentals:', err);
      setStatus('Unable to load vehicles right now. Please try again.');
    }
  }

  // Scroll progress (matches index)
  const progressBar = document.getElementById('scrollProgress');
  window.addEventListener('scroll', () => {
    const h = document.documentElement;
    const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
    if (progressBar) progressBar.style.width = pct + '%';
  }, { passive: true });

  document.addEventListener('DOMContentLoaded', load);
})();
