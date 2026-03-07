/* ── Scroll progress bar ── */
const progressBar = document.getElementById('scrollProgress');
window.addEventListener('scroll', () => {
  const h = document.documentElement;
  const pct = (h.scrollTop / (h.scrollHeight - h.clientHeight)) * 100;
  progressBar.style.width = pct + '%';
}, { passive: true });

/* ── Smooth scroll for hero CTA ── */
document.querySelector('.hero-cinema__cta[href="#featured"]')?.addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('featured')?.scrollIntoView({ behavior: 'smooth' });
});

/* ── IntersectionObserver: reveal on scroll ── */
const revealObs = new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (en.isIntersecting) {
      en.target.classList.add('visible');
      revealObs.unobserve(en.target);
    }
  });
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

function safeText(v) {
  return String(v ?? '').trim();
}

function normalizeText(v) {
  return safeText(v).toLowerCase();
}

function rentalId(r) {
  return r?.id ?? r?._id ?? '';
}

function rentalTitle(r) {
  return r?.title || r?.name || '';
}

function rentalLocation(r) {
  return [r?.area, r?.city, r?.location].filter(Boolean).join(', ');
}

function rentalCategory(r) {
  return r?.category || r?.type || '';
}

function setHeroSearchMeta(msg) {
  const el = document.getElementById('heroSearchMeta');
  if (!el) return;
  if (!msg) {
    el.style.display = 'none';
    el.textContent = '';
    return;
  }
  el.style.display = 'block';
  el.textContent = msg;
}

// Required by USER: hide/show existing DOM elements only.
function filterVehicles(searchValue = '', selectedCategory = '') {
  const grid = document.getElementById('featuredVehicles');
  if (!grid) return;

  const q = normalizeText(searchValue);
  const cat = normalizeText(selectedCategory);

  const cards = Array.from(grid.querySelectorAll('.featured-card'));
  let shown = 0;

  cards.forEach((card) => {
    const title = normalizeText(card.getAttribute('data-title'));
    const location = normalizeText(card.getAttribute('data-location'));
    const cardCat = normalizeText(card.getAttribute('data-category'));

    const matchesQuery = !q || title.includes(q) || location.includes(q);
    const matchesCat = !cat || cardCat === cat;
    const ok = matchesQuery && matchesCat;

    card.style.display = ok ? '' : 'none';
    if (ok) shown += 1;
  });

  if (!q && !cat) {
    setHeroSearchMeta('');
  } else {
    setHeroSearchMeta(`${shown} ${shown === 1 ? 'vehicle' : 'vehicles'} match your search.`);
  }
}

const sectionHeader = document.getElementById('sectionHeader');
if (sectionHeader) revealObs.observe(sectionHeader);

const API_BASE = 'http://localhost:5000';
const API_BASE_URL = 'http://localhost:5000';

function imageSrc(rental) {
  const isFile = typeof window !== 'undefined' && window.location?.protocol === 'file:';
  const root = isFile ? '' : '/';
  const img = rental?.mainImage || rental?.image;
  if (!img) return `${root}img/placeholder.jpg`;
  if (img.startsWith('http')) return img;
  if (img.startsWith('/')) return isFile ? img.slice(1) : img;
  if (img.startsWith('./')) return img;
  return img.startsWith('img/') ? `${root}${img}` : `${root}img/${img}`;
}

function slug(str) {
  return String(str || '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/* ── Featured vehicle card (curated grid) ── */
function createFeaturedCard(r) {
  const wrap = document.createElement('div');
  wrap.className = 'featured-card';

  const title = r.title || r.name || 'Premium Vehicle';
  const price = r.dailyPrice ?? r.price;
  const priceLabel = price == null ? '—' : Number(price).toLocaleString();

  // Non-visual attributes used for filtering/sorting; does not change render.
  wrap.setAttribute('data-id', safeText(rentalId(r)));
  wrap.setAttribute('data-title', safeText(rentalTitle(r) || title));
  wrap.setAttribute('data-location', safeText(rentalLocation(r)));
  wrap.setAttribute('data-category', safeText(rentalCategory(r)));
  if (price != null && price !== '') wrap.setAttribute('data-price', String(price));

  wrap.innerHTML = `
    <img class="featured-card__img" src="${imageSrc(r)}" alt="${title}" loading="lazy" />
    <div class="featured-card__body">
      <div class="featured-card__top">
        <h3 class="featured-name">${title}</h3>
        <span class="featured-tag">Premium</span>
      </div>
      <div class="featured-price"><strong>KES ${priceLabel}</strong> / day</div>
      <div class="featured-actions">
        <a class="index-btn index-btn--primary" href="booking.html?id=${r.id}">View Details</a>
      </div>
    </div>
  `;

  return wrap;
}

function wireHeroSearch() {
  const input = document.getElementById('heroSearchInput');
  const sel = document.getElementById('heroCategorySelect');
  const btn = document.getElementById('heroSearchBtn');

  if (!input && !sel && !btn) return;

  const run = () => filterVehicles(input?.value || '', sel?.value || '');

  input?.addEventListener('input', run);
  sel?.addEventListener('change', run);
  btn?.addEventListener('click', run);
}

function curatedFeatured(rentals, limit = 6) {
  const list = Array.isArray(rentals) ? rentals.slice() : [];

  const clean = list
    .filter((r) => r && !r.isComingSoon)
    .filter((r) => (r.title || r.name) && (r.mainImage || r.image))
    .sort((a, b) => {
      const ap = a?.dailyPrice ?? a?.price ?? 0;
      const bp = b?.dailyPrice ?? b?.price ?? 0;
      return Number(bp) - Number(ap);
    });

  if (clean.length) return clean.slice(0, limit);
  return list.filter((r) => r && !r.isComingSoon).slice(0, limit);
}

/* ── Main load: fetch rentals, render curated featured vehicles ── */
async function loadRentals() {
  const featuredEl = document.getElementById('featuredVehicles');
  const emptyEl = document.getElementById('unitsEmpty');

  try {
    const res = await fetch(`${API_BASE}/api/rentals`);
    if (!res.ok) throw new Error('vehicles fetch failed ' + res.status);
    const rentals = await res.json();

    if (!Array.isArray(rentals) || rentals.length === 0) {
      emptyEl.style.display = 'block';
      if (featuredEl) featuredEl.innerHTML = '';
      return;
    }

    emptyEl.style.display = 'none';

    const featured = curatedFeatured(rentals, 6);
    if (featuredEl) {
      featuredEl.innerHTML = '';
      featured.forEach((r, i) => {
        const card = createFeaturedCard(r);
        featuredEl.appendChild(card);
        setTimeout(() => revealObs.observe(card), i * 80);
      });
    }

    // Ensure search wiring works once cards exist.
    wireHeroSearch();
  } catch (err) {
    console.error('Failed to load rentals:', err);
    if (featuredEl) featuredEl.innerHTML = '';
    if (emptyEl) emptyEl.style.display = 'block';
  }
}

document.addEventListener('DOMContentLoaded', loadRentals);
