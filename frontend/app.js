const $ = id => document.getElementById(id);
const YEAR_MIN = 1976, YEAR_MAX = 2026;

const state = {
    all: [], filtered: [], selected: null,
    mode: 'columns', faults: true,
    playing: false, timer: null, pulse: 0
};
let overlay = null;
let raf = 0;

// ---------- Harita ----------
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [35.2433, 38.9637],
    zoom: 6.2,
    pitch: 50,
    bearing: 0
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

// ---------- Renk: derinliğe göre sürekli skala (sığ = sıcak, derin = soğuk) ----------
const DEPTH_STOPS = [
    [0,   [255, 90, 54]],
    [15,  [255, 166, 61]],
    [40,  [241, 214, 110]],
    [80,  [110, 200, 190]],
    [200, [88, 120, 255]]
];
function depthColor(depth, alpha = 235) {
    const d = Math.max(0, Math.min(200, depth));
    for (let i = 1; i < DEPTH_STOPS.length; i++) {
        const [d1, c1] = DEPTH_STOPS[i];
        if (d <= d1) {
            const [d0, c0] = DEPTH_STOPS[i - 1];
            const t = (d - d0) / (d1 - d0);
            return [0, 1, 2].map(k => Math.round(c0[k] + (c1[k] - c0[k]) * t)).concat(alpha);
        }
    }
    return DEPTH_STOPS[DEPTH_STOPS.length - 1][1].concat(alpha);
}
const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;

// ---------- Fay hatları (şematik, yaklaşık koordinatlar: [boylam, enlem]) ----------
const FAULTS = {
    type: 'FeatureCollection',
    features: [
        { type: 'Feature', properties: { name: 'Kuzey Anadolu Fayı' }, geometry: { type: 'LineString', coordinates: [
            [41.0, 39.3], [39.5, 39.75], [36.95, 40.6], [35.9, 40.9], [33.6, 40.9], [31.6, 40.75],
            [31.0, 40.8], [30.4, 40.7], [29.9, 40.72], [28.9, 40.8], [27.3, 40.7]] } },
        { type: 'Feature', properties: { name: 'Doğu Anadolu Fayı' }, geometry: { type: 'LineString', coordinates: [
            [41.0, 39.3], [40.5, 38.9], [39.9, 38.7], [39.3, 38.45], [38.2, 38.0], [37.1, 37.4], [36.4, 36.5]] } }
    ]
};

// ---------- Tek bir katman fabrikası ----------
// Yükseklik: büyüklüğe göre üstel (M+1 ≈ 2 kat). Renk: derinlik.
const elevation = d => Math.pow(2, d.magnitude) * 90;

function createLayers() {
    const layers = [];

    if (state.faults) {
        layers.push(new deck.GeoJsonLayer({
            id: 'faults',
            data: FAULTS,
            stroked: true, filled: false,
            getLineColor: [255, 255, 255, 150],
            getLineWidth: 2,
            lineWidthUnits: 'pixels'
        }));
    }

    if (state.mode === 'columns') {
        layers.push(new deck.ColumnLayer({
            id: 'quake-columns',
            data: state.filtered,
            diskResolution: 12,
            radius: 4500,
            extruded: true,
            getPosition: d => [d.lng, d.lat],
            getElevation: elevation,
            getFillColor: d => depthColor(d.depth),
            material: { ambient: 0.55, diffuse: 0.6, shininess: 30, specularColor: [255, 255, 255] },
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255, 255],
            onClick: info => info.object && selectQuake(info.object)
        }));
    } else {
        layers.push(new deck.HeatmapLayer({
            id: 'quake-heat',
            data: state.filtered,
            getPosition: d => [d.lng, d.lat],
            getWeight: d => Math.pow(2, d.magnitude - 3),
            radiusPixels: 38,
            intensity: 1.2,
            threshold: 0.04,
            colorRange: [
                [60, 20, 90], [120, 30, 120], [200, 50, 90],
                [255, 90, 54], [255, 166, 61], [255, 235, 160]
            ]
        }));
    }

    if (state.selected) {
        const t = state.pulse;
        layers.push(new deck.ScatterplotLayer({
            id: 'selected-ring',
            data: [state.selected],
            getPosition: d => [d.lng, d.lat],
            radiusUnits: 'meters',
            getRadius: 6000 + t * 30000,
            stroked: true, filled: false,
            lineWidthMinPixels: 2,
            getLineColor: [255, 255, 255, Math.round(255 * (1 - t))],
            updateTriggers: { getRadius: t, getLineColor: t }
        }));
    }
    return layers;
}

function tooltip({ object }) {
    if (!object || state.mode !== 'columns') return null;
    return {
        html: `<div style="font-weight:800;font-size:16px">M ${object.magnitude.toFixed(1)}</div>
               <div>${object.location}</div>
               <div style="opacity:.7">${object.date} · ${object.depth} km</div>`,
        style: {
            background: 'rgba(14,20,27,.92)', color: '#e9edf0', border: '1px solid rgba(255,255,255,.12)',
            borderRadius: '10px', padding: '10px 12px', fontFamily: 'Schibsted Grotesk, system-ui, sans-serif', fontSize: '12px'
        }
    };
}

function render() {
    if (!overlay) return;
    overlay.setProps({ layers: createLayers() });
}
function scheduleRender() {          // slider olaylarını kare başına bire indir
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; render(); });
}

// ---------- Seçim / detay kartı ----------
function selectQuake(eq) {
    state.selected = eq;
    const card = $('detail');
    card.classList.remove('hidden');
    const c = rgb(depthColor(eq.depth));
    card.style.borderLeftColor = c;
    $('detail-mag').innerText = eq.magnitude.toFixed(1);
    $('detail-mag').style.color = c;
    $('detail-loc').innerText = eq.location;
    $('detail-date').innerText = eq.date;
    $('detail-depth').innerText = eq.depth;
    map.flyTo({ center: [eq.lng, eq.lat], zoom: Math.max(map.getZoom(), 7.6), pitch: 58, duration: 1400, essential: true });
    startPulse();
}
function clearSelection() {
    state.selected = null;
    $('detail').classList.add('hidden');
    render();
}
let pulseId = 0;
function startPulse() {
    cancelAnimationFrame(pulseId);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { state.pulse = 0.4; render(); return; }
    const t0 = performance.now();
    const tick = now => {
        if (!state.selected) return;
        state.pulse = ((now - t0) % 1800) / 1800;
        render();
        pulseId = requestAnimationFrame(tick);
    };
    pulseId = requestAnimationFrame(tick);
}

// ---------- İstatistik + histogram ----------
function updateStats(data) {
    $('stat-total').innerText = data.length.toLocaleString('tr-TR');
    if (!data.length) {
        $('stat-max-mag').innerText = '0.0'; $('stat-avg-mag').innerText = '0.0'; $('stat-max-depth').innerText = '0';
        return;
    }
    let max = 0, sum = 0, deep = 0;
    for (const d of data) { if (d.magnitude > max) max = d.magnitude; sum += d.magnitude; if (d.depth > deep) deep = d.depth; }
    $('stat-max-mag').innerText = max.toFixed(1);
    $('stat-avg-mag').innerText = (sum / data.length).toFixed(2);
    $('stat-max-depth').innerText = Math.round(deep);
}

function drawHistogram(minMag, maxDepth, y0, y1) {
    const n = YEAR_MAX - YEAR_MIN + 1;
    const counts = new Array(n).fill(0);
    for (const eq of state.all) {
        if (eq.magnitude >= minMag && eq.depth <= maxDepth) {
            const i = parseInt(eq.date.substring(0, 4)) - YEAR_MIN;
            if (i >= 0 && i < n) counts[i]++;
        }
    }
    const peak = Math.max(1, ...counts), w = 300 / n;
    $('hist').innerHTML = counts.map((c, i) => {
        const h = Math.max(1, (c / peak) * 54), yr = YEAR_MIN + i;
        return `<rect class="${yr >= y0 && yr <= y1 ? 'on' : ''}" x="${i * w + 0.4}" y="${56 - h}" width="${w - 0.8}" height="${h}"></rect>`;
    }).join('');
}

// ---------- Filtreler ----------
function applyFilters() {
    const minMag = parseFloat($('filter-min-mag').value);
    const maxDepth = parseFloat($('filter-max-depth').value);
    let y0 = parseInt($('filter-start-year').value);
    let y1 = parseInt($('filter-end-year').value);
    if (y0 > y1) [y0, y1] = [y1, y0];

    $('val-min-mag').innerText = minMag.toFixed(1);
    $('val-max-depth').innerText = maxDepth + ' km';
    $('val-year-range').innerText = `${y0} – ${y1}`;

    state.filtered = state.all.filter(eq => {
        const y = parseInt(eq.date.substring(0, 4));
        return eq.magnitude >= minMag && eq.depth <= maxDepth && y >= y0 && y <= y1;
    });
    updateStats(state.filtered);
    drawHistogram(minMag, maxDepth, y0, y1);
    scheduleRender();
}

// ---------- Zaman animasyonu ----------
function setPlaying(on) {
    state.playing = on;
    $('play').innerText = on ? '❚❚ Durdur' : '▶ Yılları oynat';
    clearInterval(state.timer);
    if (!on) return;
    const start = $('filter-start-year');
    const end = $('filter-end-year');
    end.value = Math.min(parseInt(start.value) + 1, YEAR_MAX);
    applyFilters();
    state.timer = setInterval(() => {
        const next = parseInt(end.value) + 1;
        if (next > YEAR_MAX) { setPlaying(false); return; }
        end.value = next;
        applyFilters();
    }, 450);
}

// ---------- Olaylar ----------
['filter-min-mag', 'filter-max-depth', 'filter-start-year', 'filter-end-year']
    .forEach(id => $(id).addEventListener('input', () => { if (state.playing) setPlaying(false); applyFilters(); }));

function setMode(mode) {
    state.mode = mode;
    $('mode-columns').setAttribute('aria-pressed', mode === 'columns');
    $('mode-heat').setAttribute('aria-pressed', mode === 'heat');
    map.easeTo({ pitch: mode === 'columns' ? 50 : 0, duration: 800 });
    render();
}
$('mode-columns').addEventListener('click', () => setMode('columns'));
$('mode-heat').addEventListener('click', () => setMode('heat'));
$('toggle-faults').addEventListener('click', e => {
    state.faults = !state.faults;
    e.currentTarget.setAttribute('aria-pressed', state.faults);
    render();
});
$('play').addEventListener('click', () => setPlaying(!state.playing));
$('close-detail').addEventListener('click', clearSelection);

// ---------- Veri yükleme ----------
async function loadEarthquakeData() {
    try {
        const response = await fetch('../data/earthquakes.json');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        state.all = await response.json();

        overlay = new deck.MapboxOverlay({ interleaved: false, layers: [], getTooltip: tooltip });
        map.addControl(overlay);

        applyFilters();
        $('loader').classList.add('done');
    } catch (err) {
        console.error('Deprem verileri yüklenemedi:', err);
        $('loader').innerHTML = '<span>Veri yüklenemedi. <br>Sayfayı bir yerel sunucu üzerinden açtığınızdan ve <code>../data/earthquakes.json</code> dosyasının yerinde olduğundan emin olun.</span>';
    }
}

map.on('load', loadEarthquakeData);