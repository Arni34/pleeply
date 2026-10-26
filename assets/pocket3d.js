// 3D-витрина pleeply Pocket на главной (в духе lusion.co): модель из CAD (assets/pocket.glb), глянцевый пластик,
// вокруг медленно плавают мелкие детали, а прокрутка раскрывает корпус и в конце переворачивает его дном с надписью «pleeply.».
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const stage = document.querySelector('[data-stage]');
const pin = document.querySelector('[data-pin]');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// Цвета деталей (только белый, графит и металл; зелёная — одна кнопка, как точка в логотипе)
// и куда каждая уходит при раскрытии (мм, в координатах CAD: Z — вверх)
export const PARTS = {
  front: { color: 0xf1efe8, explode: [0, 0, 64] },
  back: { color: 0xdfddd5, explode: [0, 0, -58] },
  door: { color: 0x161714, explode: [-62, 0, -4] },
  ptt: { color: 0x75a24c, explode: [0, 0, -72] },
  ptt_plate: { color: 0xdfddd5, explode: [0, 0, -42] },
  ptt_switch: { color: 0x2a2b28, explode: [0, 0, -30] },
  rocker: { color: 0x161714, explode: [0, 48, -8] },
  rocker_switches: { color: 0x2a2b28, explode: [0, 32, -8] },
  lever: { color: 0x161714, explode: [42, 0, -8] },
  switch: { color: 0x232421, explode: [32, 0, -8] },
  tp4056: { color: 0x3a3b38, explode: [26, 0, -12] },
  pi_pcb: { color: 0x2b2c29, rough: 0.55, explode: [0, -6, 30] },
  pi_usb: { color: 0xc9ccd1, metal: true, explode: [-10, -6, 30] },
  pi_cooler: { color: 0x3a3d42, metal: true, explode: [0, -6, 21] },
  pi_gpio: { color: 0x111111, explode: [0, -6, 30] },
  battery: { color: 0xc9c7c0, rough: 0.45, explode: [0, 16, 42] },
  boost: { color: 0x34352f, explode: [14, -4, 42] },
  amp: { color: 0x2f302c, explode: [20, -12, 42] },
  speaker: { color: 0x1d1e1c, rough: 0.5, explode: [0, 16, -28] },
  mic: { color: 0x3d3e3a, explode: [-10, 16, -28] },
  magnets: { color: 0xb9bcc2, metal: true, explode: [-44, 0, -4] },
};

export function material({ color, metal, rough }) {
  return metal
    ? new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: 0.28 })
    : new THREE.MeshPhysicalMaterial({ color, roughness: rough ?? 0.36, clearcoat: 0.75, clearcoatRoughness: 0.16 });
}

function init() {
  const canvas = stage.querySelector('canvas');
  const bar = stage.querySelector('[data-progress]');
  const caps = [...stage.querySelectorAll('[data-cap]')].map((el) => {
    const [a, b] = el.dataset.cap.split(',').map(Number);
    return { el, a, b };
  });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = matchMedia('(max-width: 640px)').matches;
  const wideQuery = matchMedia('(min-width: 900px)');
  let wide = wideQuery.matches;
  wideQuery.addEventListener('change', (e) => { wide = e.matches; });

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    stage.classList.add('no-gl');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.75 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 4, 5);
  const rim = new THREE.DirectionalLight(0xe9ece6, 1.1);
  rim.position.set(-4, 1.5, -3);
  scene.add(key, rim, new THREE.HemisphereLight(0xffffff, 0x1a1c18, 0.35));

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const baseDistance = 4.5;

  // world — наклон за курсором; pocket — повороты по прокрутке и перетаскиванию; model — CAD (мм, Z-вверх) → сцена (Y-вверх)
  const world = new THREE.Group();
  const pocket = new THREE.Group();
  const model = new THREE.Group();
  model.rotation.x = -Math.PI / 2;
  model.scale.setScalar(0.01);
  pocket.add(model);
  world.add(pocket);
  scene.add(world);

  const parts = [];

  new GLTFLoader().load('/assets/pocket.glb', (gltf) => {
    const meshes = {};
    gltf.scene.traverse((o) => { if (o.isMesh) meshes[o.name] = o; });
    const crease = THREE.MathUtils.degToRad(35);

    // Центр — по корпусу (верх + поддон), чтобы модель вращалась вокруг своей середины
    const box = new THREE.Box3();
    for (const name of ['front', 'back']) {
      if (!meshes[name]) continue;
      meshes[name].geometry.computeBoundingBox();
      box.union(meshes[name].geometry.boundingBox);
    }
    const center = box.getCenter(new THREE.Vector3());

    for (const [name, spec] of Object.entries(PARTS)) {
      const src = meshes[name];
      if (!src) continue;
      const geometry = toCreasedNormals(src.geometry, crease);
      const mesh = new THREE.Mesh(geometry, material(spec));
      mesh.userData.base = center.clone().negate();
      mesh.userData.explode = new THREE.Vector3(...spec.explode);
      mesh.position.copy(mesh.userData.base);
      model.add(mesh);
      parts.push(mesh);
    }
    stage.classList.add('ready');
  }, undefined, () => stage.classList.add('no-gl'));

  // Перетаскивание по горизонтали — поворот; вертикаль оставляем прокрутке страницы
  let drag = 0, dragVel = 0, dragging = false, lastX = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = (e.clientX - lastX) / canvas.clientWidth;
    lastX = e.clientX;
    dragVel = dx * 5;
    drag += dragVel;
  });
  const stop = () => { dragging = false; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  const pointer = { x: 0, y: 0 };
  window.addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(0, 0.28, baseDistance * Math.max(1, 1.05 / camera.aspect));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  const progress = () => {
    const r = pin.getBoundingClientRect();
    return clamp(-r.top / Math.max(1, r.height - window.innerHeight), 0, 1);
  };

  let p = progress();
  let running = false;
  let lastCap = null;
  const clock = new THREE.Clock();

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const t = reduce ? 0 : clock.getElapsedTime();
    p = lerp(p, progress(), reduce ? 1 : 0.09);

    const open = smooth(0.12, 0.42, p) * (1 - smooth(0.74, 0.86, p)); // раскрытие и обратная сборка
    const flip = smooth(0.8, 0.95, p);                                  // в конце показываем дно
    for (const mesh of parts) mesh.position.copy(mesh.userData.base).addScaledVector(mesh.userData.explode, open);

    if (!dragging) { drag += dragVel; dragVel *= 0.92; }
    pocket.rotation.set(
      lerp(0.62, 0.42, open) - flip * 0.25,
      -0.5 + Math.sin(t * 0.35) * 0.28 * (1 - open) + drag + open * 0.25,
      flip * Math.PI,
    );
    pocket.position.y = Math.sin(t * 0.9) * 0.04 * (1 - open) - open * 0.05;
    // Первый экран: текст слева (широкий) или сверху (узкий), модель рядом с ним.
    // Дальше подпись справа или снизу — модель уходит от неё.
    const hero = 1 - smooth(0, 0.12, p);
    const shown = Math.max(open, flip);
    pocket.position.x = wide ? 0.72 * hero - 0.32 * shown : 0;
    if (!wide) pocket.position.y += 0.2 * shown - 0.42 * hero;
    pocket.scale.setScalar(wide ? 1 + 0.08 * hero : 1 - 0.14 * shown);
    world.rotation.x = lerp(world.rotation.x, pointer.y * 0.1, 0.05);
    world.rotation.y = lerp(world.rotation.y, pointer.x * 0.16, 0.05);


    stage.classList.toggle('opened', p > 0.1);
    if (bar) bar.style.width = `${(p * 100).toFixed(1)}%`;
    const active = caps.find((c) => p >= c.a && p < c.b) || null;
    if (active !== lastCap) {
      caps.forEach((c) => c.el.classList.toggle('on', c === active));
      lastCap = active;
    }
    renderer.render(scene, camera);
  }

  // Рисуем только пока сцена на экране
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !running) { running = true; clock.start(); frame(); }
    else if (!entry.isIntersecting) running = false;
  }, { rootMargin: '100px' }).observe(pin);
}

// Текст первого экрана гаснет, как только начинается прокрутка сцены (и без WebGL тоже)
function heroFade() {
  let queued = false;
  const update = () => {
    queued = false;
    const r = pin.getBoundingClientRect();
    const p = clamp(-r.top / Math.max(1, r.height - window.innerHeight), 0, 1);
    stage.style.setProperty('--hero', (1 - smooth(0, 0.07, p)).toFixed(3));
    stage.classList.toggle('past-hero', p > 0.07);
  };
  window.addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

// Запуск — после объявления всех констант выше
if (stage && pin) { heroFade(); init(); }
