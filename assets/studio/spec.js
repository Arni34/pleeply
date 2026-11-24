// pleeply Studio: сценарий сайта (spec) — значения по умолчанию и проверка. Общий для браузера и сервера:
// движок рисует только то, что прошло normalize(), а сервер хранит только нормализованный сценарий.
export const SCENES = ['prism', 'blob', 'particles', 'waves', 'rings', 'terrain'];
export const FONTS = {
  grotesk: { css: "'Archivo', system-ui, sans-serif", family: 'Archivo:wght@400;600;800;900' },
  sans: { css: "'Inter Tight', system-ui, sans-serif", family: 'Inter+Tight:wght@400;500;700;800' },
  serif: { css: "'Instrument Serif', Georgia, serif", family: 'Instrument+Serif:ital@0;1' },
  display: { css: "'Anton', 'Archivo', sans-serif", family: 'Anton' },
};
// Для кириллицы (русский, казахский) — шрифты с кириллицей того же характера: у Archivo, Anton и Instrument Serif её нет.
export const FONTS_CYR = {
  grotesk: { css: "'Inter Tight', system-ui, sans-serif", family: 'Inter+Tight:wght@500;700;800;900' },
  sans: { css: "'Manrope', system-ui, sans-serif", family: 'Manrope:wght@400;500;700;800' },
  serif: { css: "'Cormorant Garamond', Georgia, serif", family: 'Cormorant+Garamond:ital,wght@0,500;0,600;1,500' },
  display: { css: "'Oswald', 'Arial Narrow', sans-serif", family: 'Oswald:wght@500;700' },
};
export const isCyrillic = (sp) => /[а-яёәғқңөұүһі]/i.test(`${sp.title} ${sp.nav?.brand || ''} ${(sp.sections || []).map((x) => `${x.title} ${x.text} ${x.label}`).join(' ')}`);
export const fontsFor = (sp) => (isCyrillic(sp) ? FONTS_CYR : FONTS);
export const SECTION_TYPES = ['hero', 'statement', 'marquee', 'index', 'features', 'stats', 'quote', 'gallery', 'cta', 'footer'];
const str = (v, n = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '').trim()) ? String(v).trim() : d);
const href = (v) => {
  const s = String(v || '').trim();
  return /^(https:\/\/|mailto:|tel:|#[\w-]*$)/i.test(s) ? s.slice(0, 300) : '#';
};
const list = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);

// Модели иногда называют блоки по-своему: приводим к нашим типам
const ALIAS = {
  header: 'hero', banner: 'hero', intro: 'hero', cover: 'hero',
  about: 'statement', mission: 'statement', manifesto: 'statement', story: 'statement', text: 'statement', philosophy: 'statement',
  ticker: 'marquee', strip: 'marquee', tags: 'marquee', keywords: 'marquee',
  projects: 'index', work: 'index', portfolio: 'index', list: 'index', menu: 'index', products: 'index', catalog: 'index', team: 'index', schedule: 'index', classes: 'index', workshops: 'index',
  services: 'features', benefits: 'features', cards: 'features', offer: 'features', offers: 'features', feature: 'features', steps: 'features', process: 'features',
  numbers: 'stats', metrics: 'stats', stat: 'stats', facts: 'stats', counters: 'stats',
  testimonial: 'quote', testimonials: 'quote', review: 'quote', reviews: 'quote',
  images: 'gallery', photos: 'gallery', showcase: 'gallery', collection: 'gallery',
  contact: 'cta', contacts: 'cta', signup: 'cta', subscribe: 'cta', booking: 'cta', 'call-to-action': 'cta',
};
const typeOf = (t) => { const k = String(t || '').toLowerCase().trim().replace(/[\s_]+/g, '-'); return SECTION_TYPES.includes(k) ? k : ALIAS[k] || ''; };

// Блок может прийти как {"type": "hero", ...}, {"kind"/"section"/"block": "hero", ...} или {"hero": {...}}
function asSection(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const t = [x.type, x.kind, x.section, x.block, x.layout].find((v) => typeof v === 'string' && typeOf(v));
  if (t) return { ...x, type: typeOf(t) };
  const keys = Object.keys(x);
  if (keys.length === 1 && typeOf(keys[0]) && x[keys[0]] && typeof x[keys[0]] === 'object') return { ...x[keys[0]], type: typeOf(keys[0]) };
  return null;
}
function sectionList(v) {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.entries(v).map(([k, x]) => (x && typeof x === 'object' && !Array.isArray(x) ? { type: k, ...x } : null));
  return [];
}

export function normalize(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const t = s.theme || {};
  const mode = t.mode === 'light' ? 'light' : 'dark';
  const theme = {
    mode,
    bg: hex(t.bg, mode === 'light' ? '#f3f1ec' : '#07080a'),
    fg: hex(t.fg, mode === 'light' ? '#0d0d0d' : '#f2f2ee'),
    accent: hex(t.accent, '#3e9b5a'),
    font: FONTS[t.font] ? t.font : 'grotesk',
    grid: t.grid !== false,
  };
  const sc = s.scene || {};
  const sections = sectionList(s.sections).slice(0, 14).map(asSection).filter(Boolean).map((x) => ({
    type: x.type,
    label: str(x.label || x.eyebrow, 40),
    title: str(x.title || x.heading || x.headline, 140),
    text: str(x.text || x.subtitle || x.body || x.quote || x.description || (Array.isArray(x.items) && x.type === 'quote' ? x.items[0]?.text || x.items[0]?.quote : ''), 700),
    author: str(x.author || (Array.isArray(x.items) && x.type === 'quote' ? x.items[0]?.author || x.items[0]?.title : ''), 80),
    cta: x.cta || x.button ? { label: str((x.cta || x.button).label, 40), href: href((x.cta || x.button).href) } : null,
    items: list(x.items || x.cards || x.entries || x.list, 12).map((i) => (typeof i === 'string' ? { title: str(i, 80) } : {
      title: str(i?.title || i?.label, 100), text: str(i?.text || i?.caption, 300), meta: str(i?.meta, 60),
      value: str(i?.value, 16), href: i?.href ? href(i.href) : '', image: /^https:\/\/\S+\.(jpe?g|png|webp|avif|gif)(\?\S*)?$/i.test(String(i?.image || '')) ? String(i.image).slice(0, 400) : '',
    })),
    links: list(x.links, 8).map((l) => ({ label: str(l?.label || l, 40), href: href(l?.href || '#') })),
  }));
  if (!sections.some((x) => x.type === 'hero')) sections.unshift({ type: 'hero', title: str(s.title, 140) || 'Untitled', text: '', items: [], links: [] });
  return {
    title: str(s.title, 80) || 'Untitled',
    description: str(s.description, 200),
    lang: /^[a-z]{2}$/.test(s.lang || '') ? s.lang : 'en',
    theme,
    scene: { type: SCENES.includes(sc.type) ? sc.type : 'blob', color: hex(sc.color, theme.accent), intensity: Math.min(1, Math.max(0, Number(sc.intensity ?? 0.6) || 0.6)) },
    nav: { brand: str(s.nav?.brand || s.title, 40), links: list(s.nav?.links, 5).map((l) => (typeof l === 'string' ? { label: str(l, 24), href: `#${str(l, 24).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-')}` } : { label: str(l?.label, 24), href: href(l?.href) })) },
    meta: list(s.meta, 4).map((m) => str(m, 40)),
    sections,
  };
}

