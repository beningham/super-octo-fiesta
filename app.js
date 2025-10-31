/* ---------- Config ---------- */
const FACT_DISPLAY_MS = 5000;         // 5 s per fun fact
const FACTS_PER_SONG  = 3;            // facts per track before next song
const FALLBACK_COVER  = 'assets/logo.png'; // guaranteed present
const LOGO_PATH       = 'assets/logo.png';
const LOGO_HOLD_MS    = 3000;         // show logo between cycles
const SHOW_LOGO_BETWEEN_CYCLES = true;

/* ---------- State ---------- */
let index = 0, data = [];
let factTimer = null, songTimer = null;
let coverInitialised = false;
let activeLayer = 'A';

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;

const FALLBACK_PALETTE = {
  deep: '#0b1120',
  mid: '#1e293b',
  light: '#475569',
  pop: '#f59e0b'
};
let backdropToken = 0;

/* ---------- Boot ---------- */
fetch('songs.json', { cache: 'no-store' })
  .then(r => (r.ok ? r.json() : []))
  .then(json => {
    data = Array.isArray(json) ? json : [];
    showSong();
  })
  .catch(() => {
    data = [];
    showSong();
  });

/* ---------- Utils ---------- */
const preload = (src) => new Promise(resolve => {
  const stampUrl = (value) => {
    const stamp = Date.now();
    const str = String(value);
    const separator = str.includes('?') ? '&' : '?';
    return `${str}${separator}v=${stamp}`;
  };

  if (!src) {
    const fallbackUrl = stampUrl(FALLBACK_COVER);
    resolve({ ok: false, url: fallbackUrl });
    return;
  }

  const stampedSrc = stampUrl(src);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.onload  = () => resolve({ ok: true, url: stampedSrc });
  img.onerror = () => {
    const fallbackUrl = stampUrl(FALLBACK_COVER);
    const fallbackImg = new Image();
    fallbackImg.onload = () => resolve({ ok: false, url: fallbackUrl });
    fallbackImg.onerror = () => resolve({ ok: false, url: fallbackUrl });
    fallbackImg.src = fallbackUrl;
  };
  img.src = stampedSrc;
});

function applyPalette(palette = FALLBACK_PALETTE) {
  const { deep, mid, light, pop } = { ...FALLBACK_PALETTE, ...palette };
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--bg-color-deep', deep);
  rootStyle.setProperty('--bg-color-mid', mid);
  rootStyle.setProperty('--bg-color-light', light);
  rootStyle.setProperty('--bg-color-pop', pop);
}

function updateBackdrop(imageUrl) {
  const token = ++backdropToken;
  const texture = imageUrl ? `url("${imageUrl}")` : 'none';
  document.documentElement.style.setProperty('--bg-texture', texture);
  applyPalette();

  extractPalette(imageUrl).then(palette => {
    if (token !== backdropToken) return;
    if (palette) applyPalette(palette);
  });
}

function extractPalette(imageUrl) {
  return new Promise(resolve => {
    if (!imageUrl) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const sampleWidth = 96;
        const ratio = img.height / (img.width || 1);
        const sampleHeight = Math.max(1, Math.round(sampleWidth * ratio));
        canvas.width = sampleWidth;
        canvas.height = sampleHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight);
        const { data } = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
        if (!data || !data.length) {
          resolve(null);
          return;
        }
        const buckets = new Map();
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 220) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const key = `${Math.round(r / 24)}-${Math.round(g / 24)}-${Math.round(b / 24)}`;
          let bucket = buckets.get(key);
          if (!bucket) {
            bucket = { count: 0, r: 0, g: 0, b: 0 };
            buckets.set(key, bucket);
          }
          bucket.count++;
          bucket.r += r;
          bucket.g += g;
          bucket.b += b;
        }
        const colors = Array.from(buckets.values())
          .map(bucket => {
            const r = bucket.r / bucket.count;
            const g = bucket.g / bucket.count;
            const b = bucket.b / bucket.count;
            const { s, l } = rgbToHsl(r, g, b);
            return { r, g, b, s, l, count: bucket.count };
          })
          .sort((a, b) => b.count - a.count)
          .slice(0, 12);

        if (!colors.length) {
          resolve(null);
          return;
        }

        const byLight = [...colors].sort((a, b) => a.l - b.l);
        const deep = byLight[0] || colors[0];
        const bright = byLight[byLight.length - 1] || colors[0];
        const mid = byLight[Math.max(0, Math.min(byLight.length - 1, Math.floor(byLight.length / 2)))] || colors[0];
        const bySaturation = [...colors].sort((a, b) => (b.s - a.s) || (b.count - a.count));
        const vibrant = bySaturation.find(col => col.l > 0.25) || bySaturation[0] || bright;

        resolve({
          deep: colorToCss(deep, FALLBACK_PALETTE.deep),
          mid: colorToCss(mid, FALLBACK_PALETTE.mid),
          light: colorToCss(bright, FALLBACK_PALETTE.light),
          pop: colorToCss(vibrant, FALLBACK_PALETTE.pop)
        });
      } catch (err) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

function colorToCss(entry, fallback) {
  if (!entry) return fallback;
  const clamp = (value) => Math.max(0, Math.min(255, Math.round(value)));
  const r = clamp(entry.r);
  const g = clamp(entry.g);
  const b = clamp(entry.b);
  return `rgb(${r}, ${g}, ${b})`;
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  }

  return { s, l };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ---------- Cover swap ---------- */
function swapCoverInstant(newUrl) {
  const a = document.getElementById('albumA');
  const b = document.getElementById('albumB');
  const current  = activeLayer === 'A' ? a : b;
  const incoming = activeLayer === 'A' ? b : a;

  incoming.src = newUrl;
  incoming.classList.add('visible');
  current.classList.remove('visible');
  activeLayer = (incoming === a) ? 'A' : 'B';
}

/* ---------- Idle / Logo ---------- */
async function showLogoHold() {
  const logoLayer = document.getElementById('logoLayer');
  const logo = document.getElementById('logoImg');
  const fun = document.getElementById('funfact');

  if (fun) fun.toggleAttribute('hidden', true);

  logo.src = `${LOGO_PATH}?v=${Date.now()}`;
  logoLayer.classList.add('show');
  logoLayer.setAttribute('aria-hidden', 'false');

  await sleep(LOGO_HOLD_MS);

  logoLayer.classList.remove('show');
  logoLayer.setAttribute('aria-hidden', 'true');
}
window.showIdleLogo = async () => {
  await showLogoHold();
};

/* ---------- Screen mode indicator ---------- */
function reduceRatio(width, height) {
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const divisor = gcd(width, height) || 1;
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function describeMode(width, height) {
  const steps = [
    { label: '4K', height: 2160 },
    { label: '1440p', height: 1440 },
    { label: '1080p', height: 1080 },
    { label: '720p', height: 720 },
    { label: 'SD', height: 0 }
  ];
  const match = steps.find(step => height >= step.height) || steps[steps.length - 1];
  const aspect = reduceRatio(width, height);
  const isSixteenNine = Math.abs(width / height - 16 / 9) < 0.02;
  return {
    label: match.label,
    aspect: isSixteenNine ? '16:9' : aspect,
    isDesign: width === DESIGN_WIDTH && height === DESIGN_HEIGHT
  };
}

function updateScreenMode() {
  const indicator = document.getElementById('modeIndicator');
  if (!indicator) return;
  const width = Math.round(window.innerWidth);
  const height = Math.round(window.innerHeight);
  const { label, aspect, isDesign } = describeMode(width, height);
  indicator.dataset.design = isDesign ? 'true' : 'false';
  indicator.innerHTML = `<strong>${label}</strong> · ${width}×${height} · ${aspect}`;
}

window.addEventListener('resize', updateScreenMode);
window.addEventListener('orientationchange', updateScreenMode);
updateScreenMode();

/* ---------- Main flow ---------- */
async function showSong() {
  const fun  = document.getElementById('funfact');
  const artist = document.getElementById('artist');
  const title  = document.getElementById('title');
  const logoLayer = document.getElementById('logoLayer');

  clearInterval(factTimer);
  factTimer = null;
  clearTimeout(songTimer);
  songTimer = null;

  if (logoLayer) {
    logoLayer.classList.remove('show');
    logoLayer.setAttribute('aria-hidden', 'true');
  }

  const song = data[index];
  if (!song) {
    await showLogoHold();
    return;
  }

  const coverImg = await preload(song.image);

  artist.textContent = String(song.artist || '').toUpperCase();
  title.textContent  = [song.title || '', song.year ? `(${song.year})` : '']
    .filter(Boolean)
    .join(' ');

  updateBackdrop(coverImg.url);

  if (!coverInitialised) {
    const a = document.getElementById('albumA');
    a.src = coverImg.url;
    a.classList.add('visible');
    activeLayer = 'A';
    coverInitialised = true;
  } else {
    swapCoverInstant(coverImg.url);
  }

  const factsArr = Array.isArray(song.funfacts) && song.funfacts.length ? song.funfacts : [''];
  let factIndex = 0;
  const updateFact = () => {
    if (!fun) return;
    const nextFact = factsArr[factIndex] || '';
    fun.textContent = nextFact;
    fun.toggleAttribute('hidden', !nextFact.trim());
  };
  updateFact();

  if (factsArr.length > 1) {
    factTimer = setInterval(() => {
      factIndex = (factIndex + 1) % factsArr.length;
      updateFact();
    }, FACT_DISPLAY_MS);
  }

  const totalCycles = Math.max(1, FACTS_PER_SONG);
  songTimer = setTimeout(async () => {
    if (factTimer) {
      clearInterval(factTimer);
      factTimer = null;
    }

    const endOfCycle = index === data.length - 1;
    if (endOfCycle && SHOW_LOGO_BETWEEN_CYCLES) {
      await showLogoHold();
      index = 0;
      showSong();
    } else {
      nextSong();
    }
  }, FACT_DISPLAY_MS * totalCycles);
}

function nextSong() {
  if (!data.length) return;
  index = (index + 1) % data.length;
  showSong();
}
