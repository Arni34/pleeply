// pleeply Studio engine: иммерсивный 3D-сайт из JSON-сценария (spec). ИИ пишет только сценарий; дизайн, 3D и
// анимации — здесь. Текст из сценария вставляется только через textContent (никакого HTML), ссылки — https,
// mailto, tel и якоря. Three.js r170 с jsDelivr (CORS), чтобы страница работала и в песочнице, и после скачивания.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

import { normalize, fontsFor } from './spec.js';

// ---------- стили ----------
function css(sp) {
  const t = sp.theme;
  const F = fontsFor(sp);
  const f = F[t.font];
  return `
:root{--bg:${t.bg};--fg:${t.fg};--ac:${t.accent};--mute:color-mix(in oklab,var(--fg) 55%,var(--bg));--line:color-mix(in oklab,var(--fg) 14%,transparent);--head:${f.css};--mono:'JetBrains Mono',ui-monospace,Menlo,monospace}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 var(--head);-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit}::selection{background:var(--ac);color:var(--bg)}
.pp-canvas{position:fixed;inset:0;z-index:0;pointer-events:none}
.pp-grid{position:fixed;inset:0;z-index:1;pointer-events:none;background-image:linear-gradient(to right,var(--line) 1px,transparent 1px);background-size:calc(100% / 6) 100%;opacity:.55}
.pp-nav{position:fixed;top:0;left:0;right:0;z-index:5;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:18px clamp(16px,3vw,36px);font:500 11.5px/1 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--fg)}
.pp-brand{font:800 15px/1 var(--head);letter-spacing:-.01em;text-transform:none;text-decoration:none}
.pp-links{display:flex;gap:clamp(12px,2.4vw,32px)}.pp-links a{text-decoration:none;opacity:.85}.pp-links a:hover{opacity:1}
.pp-meta{justify-self:end;display:flex;gap:18px;opacity:.75}
.pp-corner{position:fixed;z-index:5;bottom:16px;font:500 10.5px/1.5 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.pp-corner.l{left:clamp(16px,3vw,36px)}.pp-corner.r{right:clamp(16px,3vw,36px);text-align:right}
main{position:relative;z-index:2}
section{position:relative;padding:clamp(90px,14vh,160px) clamp(16px,3vw,36px)}
.pp-label{display:inline-flex;gap:10px;font:500 11.5px/1 var(--mono);letter-spacing:.08em;text-transform:uppercase;color:var(--mute);margin-bottom:22px}
.pp-label b{color:var(--ac);font-weight:500}
.pp-hero{min-height:100svh;display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:clamp(60px,10vh,110px)}
.pp-hero h1{margin:0;font:${t.font === 'serif' ? '400' : '900'} clamp(56px,13.5vw,240px)/.86 var(--head);letter-spacing:${t.font === 'serif' ? '-.02em' : '-.055em'};text-transform:${t.font === 'display' ? 'uppercase' : 'none'};max-width:12ch}
.pp-hero h1 .w{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.04em}.pp-hero h1 .c{display:inline-block;transform:translateY(105%);transition:transform 1.1s cubic-bezier(.2,.7,0,1);transition-delay:var(--d)}
.pp-ready .pp-hero h1 .c{transform:none}
.pp-hero .pp-sub{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-top:34px;flex-wrap:wrap}
.pp-hero p{max-width:34ch;margin:0;font-size:clamp(16px,1.35vw,20px);color:var(--mute)}
.pp-btn{display:inline-flex;align-items:center;gap:12px;padding:14px 22px;border-radius:999px;background:var(--fg);color:var(--bg);text-decoration:none;font:600 14px/1 var(--head);transition:transform .3s,background .3s}
.pp-btn:hover{background:var(--ac);transform:translateY(-2px)}.pp-btn i{font-style:normal;transition:transform .3s}.pp-btn:hover i{transform:translateX(4px)}
.pp-statement p{margin:0;max-width:22ch;font:${t.font === 'serif' ? '400' : '700'} clamp(30px,5.2vw,86px)/1.04 var(--head);letter-spacing:-.035em}
.pp-statement p span{opacity:.14;transition:opacity .5s}.pp-statement p span.on{opacity:1}
.pp-marquee{padding:28px 0;border-block:1px solid var(--line);overflow:hidden;white-space:nowrap;background:color-mix(in oklab,var(--bg) 70%,transparent);backdrop-filter:blur(6px)}
.pp-marquee .track{display:inline-flex;gap:48px;animation:pp-mq 28s linear infinite;font:800 clamp(34px,6vw,96px)/1 var(--head);letter-spacing:-.04em}
.pp-marquee .track span::after{content:'✳';margin-left:48px;color:var(--ac)}
@keyframes pp-mq{to{transform:translateX(-50%)}}
.pp-index h2,.pp-features h2,.pp-gallery h2{margin:0 0 40px;font:800 clamp(28px,3.4vw,52px)/1 var(--head);letter-spacing:-.035em}
.pp-row{display:grid;grid-template-columns:70px 1fr auto;gap:20px;align-items:baseline;padding:22px 0;border-top:1px solid var(--line);text-decoration:none;transition:padding .35s,color .35s}
.pp-row:last-child{border-bottom:1px solid var(--line)}.pp-row:hover{padding-left:14px;color:var(--ac)}
.pp-row .n{font:500 12px var(--mono);color:var(--mute)}.pp-row .t{font:700 clamp(22px,2.6vw,40px)/1.05 var(--head);letter-spacing:-.03em}
.pp-row .t small{display:block;margin-top:8px;font:400 15px/1.5 var(--head);letter-spacing:0;color:var(--mute);max-width:60ch}
.pp-row .m{font:500 11.5px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.pp-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1px;background:var(--line);border:1px solid var(--line)}
.pp-card{padding:30px 26px 34px;background:color-mix(in oklab,var(--bg) 88%,transparent);backdrop-filter:blur(8px);min-height:240px;display:flex;flex-direction:column;gap:14px}
.pp-card .n{font:500 11.5px var(--mono);color:var(--ac)}.pp-card h3{margin:auto 0 0;font:700 24px/1.1 var(--head);letter-spacing:-.02em}.pp-card p{margin:0;color:var(--mute);font-size:15px}
.pp-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:32px}
.pp-stat b{display:block;font:900 clamp(56px,8vw,128px)/.9 var(--head);letter-spacing:-.05em}.pp-stat span{font:500 12px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.pp-quote blockquote{margin:0;max-width:24ch;font:400 clamp(30px,4.6vw,72px)/1.08 ${F.serif.css};font-style:italic;letter-spacing:-.01em}
.pp-quote cite{display:block;margin-top:24px;font:500 12px var(--mono);font-style:normal;letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
.pp-strip{display:flex;gap:18px;overflow-x:auto;padding-bottom:12px;scroll-snap-type:x mandatory}
.pp-shot{flex:0 0 min(420px,78vw);scroll-snap-align:start}
.pp-art{aspect-ratio:4/5;border-radius:6px;overflow:hidden;background:var(--g);position:relative}
.pp-art img{width:100%;height:100%;object-fit:cover;display:block}
.pp-art::after{content:'';position:absolute;inset:0;background:repeating-linear-gradient(115deg,transparent 0 22px,rgba(255,255,255,.05) 22px 23px);mix-blend-mode:overlay}
.pp-shot h3{margin:14px 0 4px;font:700 19px/1.2 var(--head);letter-spacing:-.02em}.pp-shot p{margin:0;font:500 11.5px var(--mono);letter-spacing:.05em;text-transform:uppercase;color:var(--mute)}
.pp-cta{min-height:80svh;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:28px}
.pp-cta h2{margin:0;font:900 clamp(48px,10vw,170px)/.88 var(--head);letter-spacing:-.055em;max-width:12ch}.pp-cta p{margin:0;max-width:44ch;color:var(--mute);font-size:18px}
footer.pp-foot{display:flex;justify-content:space-between;flex-wrap:wrap;gap:18px;padding:28px clamp(16px,3vw,36px) 60px;border-top:1px solid var(--line);font:500 11.5px/1.6 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--mute)}
footer.pp-foot a{text-decoration:none}footer.pp-foot nav{display:flex;gap:18px}
.pp-made{opacity:.7}
.rv{opacity:0;transform:translateY(40px);transition:opacity 1s cubic-bezier(.2,.7,0,1),transform 1s cubic-bezier(.2,.7,0,1);transition-delay:var(--d,0s)}.rv.in{opacity:1;transform:none}
.pp-dot{position:fixed;z-index:9;left:0;top:0;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:var(--ac);pointer-events:none;mix-blend-mode:difference;opacity:0;transition:width .25s,height .25s,margin .25s,opacity .3s}.pp-dot.on{opacity:1}
.pp-dot.big{width:44px;height:44px;margin:-22px 0 0 -22px}
@media (max-width:760px){.pp-nav{grid-template-columns:1fr auto}.pp-links{display:none}.pp-row{grid-template-columns:44px 1fr}.pp-row .m{grid-column:2}.pp-dot{display:none}.pp-grid{background-size:calc(100% / 3) 100%}}
@media (prefers-reduced-motion:reduce){.rv{opacity:1;transform:none;transition:none}.pp-hero h1 .c{transform:none;transition:none}.pp-marquee .track{animation:none}}
`;
}

// ---------- DOM (только textContent) ----------
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const pad = (n) => String(n).padStart(2, '0');
function label(text, n) { const l = el('div', 'pp-label rv'); if (n) l.append(el('b', '', `(${pad(n)})`)); l.append(el('span', '', text)); return l; }
function anchorId(s, i) { return (s.label || s.title || s.type).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-|-$/g, '') || `s${i}`; }

function build(sp, root) {
  const frag = document.createDocumentFragment();
  if (sp.theme.grid) frag.append(el('div', 'pp-grid'));
  const nav = el('header', 'pp-nav');
  const brand = el('a', 'pp-brand', sp.nav.brand); brand.href = '#top';
  const links = el('nav', 'pp-links');
  for (const l of sp.nav.links) { const a = el('a', '', l.label); a.href = l.href; links.append(a); }
  const meta = el('div', 'pp-meta');
  for (const m of sp.meta.slice(0, 2)) meta.append(el('span', '', m));
  nav.append(brand, links, meta);
  frag.append(nav);
  const cl = el('div', 'pp-corner l', sp.meta.slice(2).join(' · ') || sp.title);
  const cr = el('div', 'pp-corner r', 'Scroll 0%');
  frag.append(cl, cr);

  const main = el('main');
  main.id = 'top';
  let n = 0;
  sp.sections.forEach((s, i) => {
    const sec = el('section', `pp-${s.type}`);
    sec.id = anchorId(s, i);
    if (s.type === 'hero') {
      if (s.label) sec.append(label(s.label, ++n));
      const h = el('h1');
      let d = 0;
      for (const word of (s.title || sp.title).split(' ')) {
        const w = el('span', 'w');
        for (const ch of word) { const c = el('span', 'c', ch); c.style.setProperty('--d', `${(d += 0.035).toFixed(3)}s`); w.append(c); }
        h.append(w, document.createTextNode(' '));
      }
      const sub = el('div', 'pp-sub rv');
      sub.style.setProperty('--d', '.5s');
      if (s.text) sub.append(el('p', '', s.text));
      if (s.cta) { const b = el('a', 'pp-btn', s.cta.label); b.href = s.cta.href; b.append(el('i', '', '→')); sub.append(b); }
      sec.append(h, sub);
    } else if (s.type === 'statement') {
      if (s.label) sec.append(label(s.label, ++n));
      const p = el('p');
      for (const w of (s.text || s.title).split(' ')) { p.append(el('span', '', `${w} `)); }
      sec.append(p);
    } else if (s.type === 'marquee') {
      const words = s.items.map((x) => x.title).filter(Boolean);
      const track = el('div', 'track');
      for (let k = 0; k < 2; k++) for (const w of (words.length ? words : [sp.title])) track.append(el('span', '', w));
      sec.append(track);
    } else if (s.type === 'index') {
      sec.append(label(s.label || 'Index', ++n));
      if (s.title) sec.append(el('h2', 'rv', s.title));
      s.items.forEach((it, k) => {
        const row = el(it.href ? 'a' : 'div', 'pp-row rv');
        if (it.href) row.href = it.href;
        row.style.setProperty('--d', `${k * 0.06}s`);
        const t = el('div', 't', it.title);
        if (it.text) t.append(el('small', '', it.text));
        row.append(el('span', 'n', pad(k + 1)), t, el('span', 'm', it.meta));
        sec.append(row);
      });
    } else if (s.type === 'features') {
      sec.append(label(s.label || 'What we do', ++n));
      if (s.title) sec.append(el('h2', 'rv', s.title));
      const g = el('div', 'pp-cards');
      s.items.forEach((it, k) => {
        const c = el('div', 'pp-card rv');
        c.style.setProperty('--d', `${k * 0.07}s`);
        c.append(el('span', 'n', `${pad(k + 1)} /`), el('h3', '', it.title), el('p', '', it.text));
        g.append(c);
      });
      sec.append(g);
    } else if (s.type === 'stats') {
      if (s.label) sec.append(label(s.label, ++n));
      const g = el('div', 'pp-stats');
      s.items.forEach((it, k) => {
        const st = el('div', 'pp-stat rv');
        st.style.setProperty('--d', `${k * 0.08}s`);
        const b = el('b', '', it.value || it.title);
        b.dataset.count = it.value || '';
        st.append(b, el('span', '', it.value ? it.title : it.text));
        g.append(st);
      });
      sec.append(g);
    } else if (s.type === 'quote') {
      if (s.label) sec.append(label(s.label, ++n));
      const q = el('blockquote', 'rv', `“${s.text || s.title}”`);
      sec.append(q);
      if (s.author) sec.append(el('cite', 'rv', `— ${s.author}`));
    } else if (s.type === 'gallery') {
      sec.append(label(s.label || 'Selected', ++n));
      if (s.title) sec.append(el('h2', 'rv', s.title));
      const strip = el('div', 'pp-strip');
      s.items.forEach((it, k) => {
        const shot = el('div', 'pp-shot rv');
        shot.style.setProperty('--d', `${k * 0.08}s`);
        const art = el('div', 'pp-art');
        const hue = (k * 47) % 360;
        art.style.setProperty('--g', `radial-gradient(120% 90% at ${20 + k * 13}% ${30 + k * 9}%, color-mix(in oklab, var(--ac) 85%, hsl(${hue} 70% 55%)), transparent 60%), linear-gradient(160deg, color-mix(in oklab, var(--fg) 10%, var(--bg)), var(--bg))`);
        if (it.image) { const img = el('img'); img.src = it.image; img.alt = it.title; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; art.append(img); }
        shot.append(art, el('h3', '', it.title), el('p', '', it.meta || it.text));
        strip.append(shot);
      });
      sec.append(strip);
    } else if (s.type === 'cta') {
      if (s.label) sec.append(label(s.label, ++n));
      sec.append(el('h2', 'rv', s.title || 'Let’s talk'));
      if (s.text) sec.append(el('p', 'rv', s.text));
      if (s.cta) { const b = el('a', 'pp-btn rv', s.cta.label); b.href = s.cta.href; b.append(el('i', '', '→')); sec.append(b); }
    } else if (s.type === 'footer') {
      return; // подвал строится ниже
    }
    main.append(sec);
  });
  frag.append(main);

  const fs = sp.sections.find((s) => s.type === 'footer');
  const foot = el('footer', 'pp-foot');
  foot.append(el('span', '', fs?.text || `© ${new Date().getFullYear()} ${sp.title}`));
  const fl = el('nav');
  for (const l of fs?.links || []) { const a = el('a', '', l.label); a.href = l.href; a.rel = 'noopener'; fl.append(a); }
  const made = el('a', 'pp-made', 'Made with pleeply Studio');
  made.href = 'https://pleeply.vercel.app/studio';
  made.target = '_blank';
  made.rel = 'noopener';
  fl.append(made);
  foot.append(fl);
  frag.append(foot);
  // внешние ссылки — в новой вкладке, чтобы превью и опубликованная страница не уходили со своего адреса
  for (const a of frag.querySelectorAll('a[href^="https:"]')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  root.append(frag);
  return { corner: cr };
}

// ---------- 3D ----------
const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
`;

function makeScene(sp, canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 6);
  const C = new THREE.Color(sp.scene.color);
  const A = new THREE.Color(sp.theme.accent);
  const F = new THREE.Color(sp.theme.fg);
  const B = new THREE.Color(sp.theme.bg);
  const k = sp.scene.intensity;
  const U = { uTime: { value: 0 }, uScroll: { value: 0 }, uPointer: { value: new THREE.Vector2() }, uColor: { value: C }, uAccent: { value: A }, uFg: { value: F }, uBg: { value: B }, uK: { value: k } };
  const group = new THREE.Group();
  scene.add(group);
  let update = () => {};
  const type = sp.scene.type;

  if (type === 'blob' || type === 'prism') {
    const geo = type === 'blob' ? new THREE.IcosahedronGeometry(1.35, 96) : new THREE.CylinderGeometry(1.25, 1.25, 2.6, 3, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: `${NOISE}uniform float uTime,uScroll,uK;varying vec3 vN;varying vec3 vV;varying float vD;
void main(){vec3 p=position;float d=0.;
${type === 'blob' ? 'd=snoise(p*1.1+uTime*.22)*(.28+.35*uK)+snoise(p*2.6-uTime*.3)*.08;p+=normal*d*(1.+uScroll*.6);' : ''}
vD=d;vec4 mv=modelViewMatrix*vec4(p,1.);vV=-mv.xyz;vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `uniform float uTime,uScroll,uK;uniform vec3 uColor,uAccent,uFg,uBg;varying vec3 vN;varying vec3 vV;varying float vD;
float bands(vec3 r,float s){return .5+.5*sin((r.x*2.+r.y*3.)*s+uTime*.6);}
void main(){vec3 n=normalize(vN);vec3 v=normalize(vV);float fr=pow(1.-max(dot(n,v),0.),2.2);
${type === 'prism'
    ? 'vec3 rr=refract(-v,n,.62),rg=refract(-v,n,.66),rb=refract(-v,n,.70);float s=7.;vec3 col=vec3(bands(rr,s),bands(rg,s),bands(rb,s));col=mix(uBg,mix(uColor,uFg,.35),col.g)*0.85+vec3(col.r*.25,0.,col.b*.35)*uK;col+=fr*mix(uFg,uAccent,.5)*.9;gl_FragColor=vec4(col,.92);'
    : 'vec3 base=mix(uColor,uAccent,smoothstep(-.25,.35,vD));vec3 col=mix(base*.55,base,dot(n,normalize(vec3(.4,.8,.6)))*.5+.5);col+=fr*mix(uFg,uAccent,.4)*(.7+.3*uK);col=mix(col,uBg,.08);gl_FragColor=vec4(col,1.);'}
}`,
      transparent: type === 'prism',
    });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    if (type === 'prism') {
      // полосы за призмой — её «преломляет» шейдер
      const stripes = new THREE.Mesh(new THREE.PlaneGeometry(30, 18), new THREE.ShaderMaterial({ uniforms: U, transparent: true,
        vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: 'uniform float uTime,uK;uniform vec3 uFg,uBg;varying vec2 vU;void main(){float s=step(.5,fract((vU.x*1.4+vU.y*.8)*28.+uTime*.05));gl_FragColor=vec4(mix(uBg,uFg,.07+.06*uK),s*.55);}' }));
      stripes.position.z = -4;
      scene.add(stripes);
      mesh.rotation.z = Math.PI;
    }
    update = (t, s, p) => {
      mesh.rotation.y = t * 0.18 + s * 2.4 + p.x * 0.35;
      mesh.rotation.x = (type === 'prism' ? 0.25 : 0) + p.y * 0.25 + s * 0.6;
      group.position.x = Math.sin(s * Math.PI) * (innerWidth > 760 ? 1.6 : 0.4);
      group.position.y = s * -0.6;
      const sc = (innerWidth > 760 ? 1 : 0.7) * (1 - s * 0.25);
      group.scale.setScalar(sc);
    };
  } else if (type === 'particles') {
    const N = innerWidth > 760 ? 9000 : 4000;
    const pos = new Float32Array(N * 3);
    const rnd = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = 1.6 + (Math.random() - 0.5) * 0.15;
      const q = Math.sqrt(1 - u * u);
      pos.set([r * q * Math.cos(th), r * u, r * q * Math.sin(th)], i * 3);
      rnd[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aR', new THREE.BufferAttribute(rnd, 1));
    const mat = new THREE.ShaderMaterial({ uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `${NOISE}uniform float uTime,uScroll,uK;attribute float aR;varying float vA;
void main(){vec3 p=position;float n=snoise(p*.8+uTime*.15);p+=normalize(p)*n*(.25+.4*uK);p*=1.+uScroll*(1.2+aR*2.);p+=vec3(snoise(p+uTime*.1),snoise(p.yzx-uTime*.1),0.)*uScroll*.8;
vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=(1.5+aR*2.6)*(6./-mv.z)*${(Math.min(devicePixelRatio || 1, 1.75)).toFixed(2)};vA=.35+.65*aR;gl_Position=projectionMatrix*mv;}`,
      fragmentShader: 'uniform vec3 uColor,uAccent;varying float vA;void main(){vec2 c=gl_PointCoord-.5;float d=length(c);if(d>.5)discard;gl_FragColor=vec4(mix(uColor,uAccent,vA),(1.-d*2.)*vA);}' });
    group.add(new THREE.Points(geo, mat));
    update = (t, s, p) => { group.rotation.y = t * 0.06 + p.x * 0.3; group.rotation.x = p.y * 0.2 + s * 0.5; };
  } else if (type === 'waves') {
    const mat = new THREE.ShaderMaterial({ uniforms: U, depthWrite: false,
      vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `${NOISE}uniform float uTime,uScroll,uK;uniform vec2 uPointer;uniform vec3 uColor,uAccent,uBg;varying vec2 vU;
void main(){vec2 p=vU*vec2(1.8,1.)+uPointer*.05;float n=snoise(vec3(p*1.6,uTime*.08+uScroll*1.5));float m=snoise(vec3(p*3.2+n,uTime*.12));
float f=smoothstep(-.6,.9,n+m*.5);vec3 col=mix(uBg,uColor,f*(.4+.3*uK));col=mix(col,uAccent,smoothstep(.6,1.,m)*.45*uK);
col+=.012*sin((vU.y+n*.2)*90.);col=mix(col,uBg,smoothstep(.55,0.,vU.y)*.35);gl_FragColor=vec4(col,1.);}` });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
    quad.frustumCulled = false;
    scene.add(quad);
  } else if (type === 'rings') {
    const planet = new THREE.Mesh(new THREE.SphereGeometry(0.95, 64, 64), new THREE.ShaderMaterial({ uniforms: U,
      vertexShader: 'varying vec3 vN;varying vec3 vV;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vV=-mv.xyz;vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'uniform vec3 uColor,uAccent,uFg;varying vec3 vN;varying vec3 vV;void main(){vec3 n=normalize(vN);float l=dot(n,normalize(vec3(-.5,.6,.7)))*.5+.5;float fr=pow(1.-max(dot(n,normalize(vV)),0.),3.);gl_FragColor=vec4(mix(uColor*.35,uColor,l)+fr*uAccent*.8,1.);}' }));
    group.add(planet);
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(1.5 + i * 0.32, 0.012 + i * 0.004, 8, 200), new THREE.MeshBasicMaterial({ color: i === 1 ? A : F, transparent: true, opacity: 0.85 - i * 0.2 }));
      r.rotation.x = Math.PI / 2 - 0.35;
      group.add(r);
      rings.push(r);
    }
    group.rotation.z = -0.32;
    update = (t, s, p) => {
      rings.forEach((r, i) => { r.rotation.z = t * (0.1 + i * 0.05); r.rotation.x = Math.PI / 2 - 0.35 + s * (0.6 + i * 0.2); });
      group.rotation.y = p.x * 0.3;
      group.position.x = Math.sin(s * Math.PI) * (innerWidth > 760 ? 1.4 : 0.3);
      group.scale.setScalar((innerWidth > 760 ? 1 : 0.75) * (1 + s * 0.3));
    };
  } else if (type === 'terrain') {
    const geo = new THREE.PlaneGeometry(26, 26, 160, 160);
    const mat = new THREE.ShaderMaterial({ uniforms: U, wireframe: true, transparent: true,
      vertexShader: `${NOISE}uniform float uTime,uScroll,uK;varying float vH;varying float vZ;void main(){vec3 p=position;float off=uScroll*14.+uTime*.25;
float h=snoise(vec3(p.x*.18,(p.y+off)*.18,0.))*1.3+snoise(vec3(p.x*.5,(p.y+off)*.5,1.))*.3;p.z=h*(.8+.8*uK);vH=h;vec4 mv=modelViewMatrix*vec4(p,1.);vZ=-mv.z;gl_Position=projectionMatrix*mv;}`,
      fragmentShader: 'uniform vec3 uColor,uAccent;varying float vH;varying float vZ;void main(){float a=smoothstep(22.,4.,vZ);gl_FragColor=vec4(mix(uColor,uAccent,smoothstep(.2,1.2,vH)),a*.75);}' });
    const plane = new THREE.Mesh(geo, mat);
    plane.rotation.x = -Math.PI / 2.35;
    plane.position.y = -1.6;
    group.add(plane);
    update = (t, s, p) => { camera.position.x = p.x * 0.5; camera.lookAt(0, -0.4, -6); };
  }

  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);
  return {
    frame(t, s, p) {
      U.uTime.value = t;
      U.uScroll.value = s;
      U.uPointer.value.set(p.x, p.y);
      update(t, s, p);
      renderer.render(scene, camera);
    },
    destroy() { removeEventListener('resize', resize); renderer.dispose(); renderer.forceContextLoss(); },
  };
}

// ---------- запуск ----------
export function render(rawSpec, root = document.body) {
  const sp = normalize(rawSpec);
  document.documentElement.lang = sp.lang;
  document.title = sp.title;
  const style = el('style', '', css(sp));
  document.head.append(style);
  const F = fontsFor(sp);
  const fonts = new Set(['JetBrains+Mono:wght@400;500', F[sp.theme.font].family, F.serif.family]);
  const link = el('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${[...fonts].map((f) => `family=${f}`).join('&')}&display=swap`;
  document.head.append(link);

  root.textContent = '';
  const canvas = el('canvas', 'pp-canvas');
  canvas.setAttribute('aria-hidden', 'true');
  root.append(canvas);
  const { corner } = build(sp, root);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let gl = null;
  try { gl = makeScene(sp, canvas); } catch { canvas.remove(); }

  // появление секций
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  root.querySelectorAll('.rv').forEach((x) => io.observe(x));
  // числа считаются вверх
  const cio = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    cio.unobserve(e.target);
    const m = /^([^\d]*)([\d.,]+)(.*)$/.exec(e.target.dataset.count || '');
    if (!m || reduce) return;
    const target = parseFloat(m[2].replace(/,/g, ''));
    const dec = (m[2].split('.')[1] || '').length;
    const t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / 1400); e.target.textContent = `${m[1]}${(target * (1 - Math.pow(1 - k, 3))).toFixed(dec)}${m[3]}`; if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), { threshold: 0.4 });
  root.querySelectorAll('[data-count]').forEach((x) => { if (x.dataset.count) cio.observe(x); });

  // слова заявления проявляются при прокрутке
  const words = [...root.querySelectorAll('.pp-statement p span')];
  const dot = el('div', 'pp-dot');
  if (!reduce && matchMedia('(pointer: fine)').matches) root.append(dot);
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, cx: innerWidth / 2, cy: innerHeight / 2, dx: innerWidth / 2, dy: innerHeight / 2 };
  const onMove = (e) => { pointer.tx = (e.clientX / innerWidth) * 2 - 1; pointer.ty = -((e.clientY / innerHeight) * 2 - 1); pointer.cx = e.clientX; pointer.cy = e.clientY; dot.classList.add('on'); dot.classList.toggle('big', Boolean(e.target.closest?.('a'))); };
  addEventListener('pointermove', onMove);

  let scroll = 0;
  let raf = 0;
  const t0 = performance.now();
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (document.hidden) return;
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const target = Math.min(1, Math.max(0, scrollY / max));
    scroll += (target - scroll) * 0.08;
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    pointer.dx += (pointer.cx - pointer.dx) * 0.2;
    pointer.dy += (pointer.cy - pointer.dy) * 0.2;
    dot.style.transform = `translate(${pointer.dx}px, ${pointer.dy}px)`;
    corner.textContent = `Scroll ${Math.round(target * 100)}%`;
    for (const w of words) { const r = w.getBoundingClientRect(); w.classList.toggle('on', r.top < innerHeight * 0.72); }
    gl?.frame(reduce ? 0 : (now - t0) / 1000, scroll, pointer);
  };
  raf = requestAnimationFrame(loop);
  requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('pp-ready')));

  return {
    spec: sp,
    destroy() {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', onMove);
      io.disconnect();
      cio.disconnect();
      gl?.destroy();
      style.remove();
      link.remove();
      document.documentElement.classList.remove('pp-ready');
      root.textContent = '';
    },
  };
}
