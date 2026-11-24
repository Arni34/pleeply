// Демо-сайты Studio: открываются мгновенно, без запроса к ИИ. Бренды вымышленные, адреса — example.com.
export const DEMOS = [
  {
    key: 'halden', name: 'Halden', tag: 'Architecture · prism',
    bg: 'radial-gradient(120% 90% at 70% 20%, #9fb4ff55, transparent 60%), linear-gradient(160deg, #15171c, #050506)',
    spec: {
      title: 'Halden', description: 'Halden is an architecture studio in Almaty designing quiet concrete houses in the Tian Shan foothills.', lang: 'en',
      theme: { mode: 'dark', bg: '#07080a', fg: '#f2f2ee', accent: '#c9ff4a', font: 'grotesk', grid: true },
      scene: { type: 'prism', color: '#9fb4ff', intensity: 0.7 },
      nav: { brand: 'Halden', links: [{ label: 'Work', href: '#work' }, { label: 'Studio', href: '#studio' }, { label: 'Contact', href: '#contact' }] },
      meta: ['43.2389° N, 76.8897° E', 'Est. 2016', 'Almaty', 'Taking 3 commissions for 2027'],
      sections: [
        { type: 'hero', label: 'Architecture studio', title: 'Quiet houses for loud mountains', text: 'We design concrete homes that disappear into the Tian Shan foothills and age better every winter.', cta: { label: 'See the houses', href: '#work' } },
        { type: 'statement', label: 'Studio', text: 'Every house starts with a walk across the site at dawn. We measure light, wind and silence before we draw a single wall.' },
        { type: 'marquee', items: [{ title: 'Concrete' }, { title: 'Timber' }, { title: 'Light' }, { title: 'Silence' }, { title: 'Snow load' }] },
        { type: 'index', label: 'Work', title: 'Selected houses', items: [
          { title: 'House on the Ridge', text: 'A cantilevered living room above the mountain trail.', meta: '2025 · 240 m²' },
          { title: 'Winter Pavilion', text: 'A sauna and reading room sunk half into the slope.', meta: '2024 · 60 m²' },
          { title: 'Courtyard House', text: 'Four volumes around a wind-sheltered apple garden.', meta: '2023 · 310 m²' },
          { title: 'Studio Medeu', text: 'Our own office, poured in one week in May.', meta: '2021 · 180 m²' }] },
        { type: 'stats', label: 'In numbers', items: [{ value: '27', title: 'Houses built' }, { value: '1,600 m', title: 'Highest site' }, { value: '9', title: 'Architects' }] },
        { type: 'quote', label: 'Client', text: 'It is the only building I know that sounds different when it snows.', author: 'Aigerim S., House on the Ridge' },
        { type: 'cta', label: 'Contact', title: 'Start with a walk', text: 'Tell us where your land is. We will visit it before we talk about drawings.', cta: { label: 'Write to the studio', href: 'mailto:hello@example.com' } },
        { type: 'footer', text: '© 2026 Halden Architecture, Almaty' },
      ],
    },
  },
  {
    key: 'morrow', name: 'Morrow', tag: 'Biotech · organic',
    bg: 'radial-gradient(70% 70% at 60% 45%, #2b5bff, #1f4dff00 70%), #f2f1ed',
    spec: {
      title: 'Morrow', description: 'Morrow grows living skin grafts from a patient’s own cells.', lang: 'en',
      theme: { mode: 'light', bg: '#f2f1ed', fg: '#0b0b0b', accent: '#1f4dff', font: 'grotesk', grid: true },
      scene: { type: 'blob', color: '#2b5bff', intensity: 0.75 },
      nav: { brand: 'Morrow®', links: [{ label: 'Science', href: '#science' }, { label: 'Pipeline', href: '#pipeline' }, { label: 'Careers', href: '#careers' }] },
      meta: ['Regenerative medicine', 'Basel / Boston', 'Series B'],
      sections: [
        { type: 'hero', label: 'Regenerative medicine', title: 'Skin, grown back', text: 'We grow living grafts from a patient’s own cells, so burns heal without rejection and with far less scarring.', cta: { label: 'Read the science', href: '#science' } },
        { type: 'statement', label: 'Science', text: 'A thumbnail of healthy skin holds everything we need. In 21 days it becomes a graft the size of a hand, matched to one body only.' },
        { type: 'features', label: 'Pipeline', title: 'Three programmes, one platform', items: [
          { title: 'MRW-01 Burns', text: 'Full-thickness burns over a fifth of the body. Phase II in four European centres.' },
          { title: 'MRW-02 Ulcers', text: 'Diabetic foot ulcers that have not closed in twelve weeks.' },
          { title: 'MRW-03 Repair', text: 'Reconstructive surgery after tumour removal. Preclinical.' }] },
        { type: 'stats', label: 'So far', items: [{ value: '21', title: 'Days from biopsy to graft' }, { value: '94%', title: 'Graft take in Phase I' }, { value: '312', title: 'Patients treated' }] },
        { type: 'marquee', items: [{ title: 'Autologous' }, { title: 'No rejection' }, { title: 'Less scarring' }, { title: 'Grown in Basel' }] },
        { type: 'cta', label: 'Careers', title: 'Grow with us', text: 'We are hiring cell biologists, process engineers and one very patient regulatory lead.', cta: { label: 'See open roles', href: 'mailto:jobs@example.com' } },
        { type: 'footer', text: 'Morrow AG · Basel' },
      ],
    },
  },
  {
    key: 'sable', name: 'Maison Sable', tag: 'Fashion · editorial',
    bg: 'radial-gradient(90% 80% at 30% 70%, #c98a6b, transparent 65%), linear-gradient(160deg, #efe7de, #d9c3b0)',
    spec: {
      title: 'Maison Sable', description: 'Wool, silk and undyed cashmere, cut slowly in a Paris atelier.', lang: 'en',
      theme: { mode: 'light', bg: '#efe7de', fg: '#1b1612', accent: '#9a3b25', font: 'serif', grid: false },
      scene: { type: 'waves', color: '#c98a6b', intensity: 0.55 },
      nav: { brand: 'Maison Sable', links: [{ label: 'Collection', href: '#collection' }, { label: 'Atelier', href: '#atelier' }, { label: 'Stores', href: '#stores' }] },
      meta: ['Autumn–Winter 2026', 'Paris', 'Collection N°7'],
      sections: [
        { type: 'hero', label: 'Collection N°7', title: 'The quiet season', text: 'Wool, silk and undyed cashmere, cut slowly in our Paris atelier for people who keep clothes for decades.', cta: { label: 'View the collection', href: '#collection' } },
        { type: 'gallery', label: 'Collection', title: 'Autumn–Winter 2026', items: [
          { title: 'Coat No. 1', meta: 'Double-faced wool' }, { title: 'The Long Shirt', meta: 'Washed silk' }, { title: 'Field Knit', meta: 'Undyed cashmere' },
          { title: 'Evening Trouser', meta: 'Wool crepe' }, { title: 'Scarf 210', meta: 'Mohair blend' }] },
        { type: 'statement', label: 'Atelier', text: 'Twelve people, one floor in the Marais, and no more than forty pieces of each design. When they are gone, they are gone.' },
        { type: 'quote', label: 'Letters', text: 'The kind of coat you hand down, not throw out.', author: 'A customer since 2014' },
        { type: 'index', label: 'Stores', title: 'Find us', items: [
          { title: 'Paris', text: 'Rue Charlot, third arrondissement', meta: 'Tue–Sat' },
          { title: 'Tokyo', text: 'Aoyama, by appointment', meta: 'Thu–Sun' },
          { title: 'Online', text: 'Shipped worldwide in recycled paper', meta: 'Always' }] },
        { type: 'cta', label: 'Appointments', title: 'Come and try it on', text: 'Fittings take an hour. Tea is included, pressure is not.', cta: { label: 'Book a fitting', href: 'mailto:atelier@example.com' } },
        { type: 'footer', text: '© Maison Sable 2026' },
      ],
    },
  },
  {
    key: 'kern', name: 'Kern Bureau', tag: 'Design bureau · particles',
    bg: 'radial-gradient(60% 60% at 50% 45%, #c8ff5a66, transparent 70%), radial-gradient(#ffffff22 1px, transparent 1px) 0 0/10px 10px, #0a0a0a',
    spec: {
      title: 'Kern Bureau', description: 'Interfaces, signage and identities for banks, airports and cities.', lang: 'en',
      theme: { mode: 'dark', bg: '#0a0a0a', fg: '#f4f4f0', accent: '#c8ff5a', font: 'sans', grid: true },
      scene: { type: 'particles', color: '#d8ffe0', intensity: 0.65 },
      nav: { brand: 'KERN', links: [{ label: 'Projects', href: '#projects' }, { label: 'Method', href: '#method' }, { label: 'Contact', href: '#contact' }] },
      meta: ['Design bureau', 'Berlin · Almaty', 'Since 2009', 'Status: 3 slots in Q1'],
      sections: [
        { type: 'hero', label: 'Design bureau', title: 'We design what you use daily', text: 'Interfaces, signage and identities for banks, airports and cities. 140 people, two offices, no templates.', cta: { label: 'How we work', href: '#method' } },
        { type: 'marquee', items: [{ title: 'Identity' }, { title: 'Interfaces' }, { title: 'Wayfinding' }, { title: 'Type' }, { title: 'Systems' }] },
        { type: 'index', label: 'Projects', title: 'Recent projects', items: [
          { title: 'A metro that explains itself', text: 'Wayfinding for 48 stations and one very long tunnel.', meta: 'Signage' },
          { title: 'Pocket bank', text: 'A bank app for people who hate banks.', meta: 'Interface' },
          { title: 'Steppe Airport', text: 'Identity, type and 1,200 signs.', meta: 'Identity' },
          { title: 'Weather typeface', text: 'A variable font that gets bolder as the wind gets stronger.', meta: 'Type' }] },
        { type: 'features', label: 'Method', title: 'How we work', items: [
          { title: 'Look', text: 'We spend the first week watching people use what already exists.' },
          { title: 'Argue', text: 'Three teams design three answers and defend them in public.' },
          { title: 'Ship', text: 'We stay until it is built, printed or released.' }] },
        { type: 'stats', label: 'Since 2009', items: [{ value: '140', title: 'People' }, { value: '612', title: 'Projects shipped' }, { value: '2', title: 'Offices' }] },
        { type: 'cta', label: 'Contact', title: 'Bring us a hard one', text: 'Briefs that start with “it is complicated” are our favourite.', cta: { label: 'Write to the bureau', href: 'mailto:bureau@example.com' } },
        { type: 'footer', text: 'Kern Bureau · Berlin · Almaty' },
      ],
    },
  },
];
