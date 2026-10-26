// Собирает STL-детали pleeply Pocket в один pocket.glb: вершины склеены (индексированная геометрия), у каждой детали своё имя.
// Нормали не храним — сайт считает их сам (toCreasedNormals), так файл меньше.
// node stl2glb.mjs <папка со stl> <выходной .glb>
import fs from 'node:fs';
import path from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';

const [, , srcDir, outFile] = process.argv;
const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.stl')).sort();

function readStl(file) {
  const buf = fs.readFileSync(file);
  const count = buf.readUInt32LE(80);
  const positions = [];
  const indices = [];
  const seen = new Map();
  for (let t = 0; t < count; t++) {
    const base = 84 + t * 50 + 12; // пропускаем нормаль грани
    for (let v = 0; v < 3; v++) {
      const o = base + v * 12;
      const x = buf.readFloatLE(o), y = buf.readFloatLE(o + 4), z = buf.readFloatLE(o + 8);
      const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
      let idx = seen.get(key);
      if (idx === undefined) {
        idx = positions.length / 3;
        positions.push(x, y, z);
        seen.set(key, idx);
      }
      indices.push(idx);
    }
  }
  return { positions: new Float32Array(positions), indices: positions.length / 3 > 65535 ? new Uint32Array(indices) : new Uint16Array(indices), triangles: count };
}

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('pocket');
let totalTris = 0;

for (const f of files) {
  const name = path.basename(f, '.stl');
  const { positions, indices, triangles } = readStl(path.join(srcDir, f));
  if (!triangles) continue;
  totalTris += triangles;
  const pos = doc.createAccessor(`${name}-pos`).setType('VEC3').setArray(positions).setBuffer(buffer);
  const idx = doc.createAccessor(`${name}-idx`).setType('SCALAR').setArray(indices).setBuffer(buffer);
  const material = doc.createMaterial(name).setBaseColorFactor([0.9, 0.9, 0.88, 1]);
  const prim = doc.createPrimitive().setAttribute('POSITION', pos).setIndices(idx).setMaterial(material);
  const mesh = doc.createMesh(name).addPrimitive(prim);
  scene.addChild(doc.createNode(name).setMesh(mesh));
}

await new NodeIO().write(outFile, doc);
console.log(`${files.length} деталей, ${totalTris} треугольников → ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} КБ)`);
