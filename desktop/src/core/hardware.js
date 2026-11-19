import os from "node:os";
import { execFile } from "node:child_process";
import { statfs, mkdir } from "node:fs/promises";

function run(cmd, args, timeout = 4000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => resolve(err ? "" : String(stdout)));
  });
}

function osName() {
  const p = process.platform;
  if (p === "darwin") return "macOS";
  if (p === "win32") return "Windows";
  return "Linux";
}

async function macDetails() {
  const [version, json] = await Promise.all([
    run("sw_vers", ["-productVersion"]),
    run("system_profiler", ["SPDisplaysDataType", "-json"], 8000),
  ]);
  let gpuCores = null, gpuName = null;
  try {
    const d = JSON.parse(json).SPDisplaysDataType?.[0];
    gpuCores = d?.sppci_cores ? Number(d.sppci_cores) : null;
    gpuName = d?.sppci_model || d?._name || null;
  } catch {}
  return { osVersion: version.trim(), gpuCores, gpuName };
}

async function winDetails() {
  const out = await run("powershell.exe", ["-NoProfile", "-Command", "(Get-CimInstance Win32_VideoController | Select-Object -First 1 -ExpandProperty Name)"]);
  return { osVersion: os.release(), gpuName: out.trim() || null, gpuCores: null };
}

async function linuxDetails() {
  const out = await run("sh", ["-c", "lspci 2>/dev/null | grep -iE 'vga|3d' | head -1"]);
  const name = out.split(":").slice(2).join(":").trim();
  return { osVersion: os.release(), gpuName: name || null, gpuCores: null };
}

/**
 * Что pleeply знает о компьютере: чип, память, графика и свободное место для моделей.
 * llama — экземпляр node-llama-cpp (может быть null, если движок не загрузился).
 */
export async function detectHardware({ llama, modelsDir }) {
  const cpus = os.cpus();
  const details = process.platform === "darwin" ? await macDetails() : process.platform === "win32" ? await winDetails() : await linuxDetails();
  let gpu = { backend: "cpu", names: [], vramBytes: 0, unified: false };
  if (llama) {
    try {
      const vram = await llama.getVramState();
      const names = await llama.getGpuDeviceNames().catch(() => []);
      gpu = {
        backend: llama.gpu || "cpu",
        names,
        vramBytes: llama.gpu ? vram.total : 0,
        unified: vram.unifiedSize > 0,
      };
    } catch {}
  }
  let diskFreeBytes = null;
  try {
    await mkdir(modelsDir, { recursive: true });
    const s = await statfs(modelsDir);
    diskFreeBytes = s.bavail * s.bsize;
  } catch {}
  const chip = (cpus[0]?.model || "Unknown CPU").replace(/\(R\)|\(TM\)|CPU|@.*$/g, "").replace(/\s+/g, " ").trim();
  return {
    os: osName(),
    osVersion: details.osVersion,
    arch: process.arch,
    chip,
    cpuCores: cpus.length,
    ramBytes: os.totalmem(),
    gpu: {
      ...gpu,
      name: details.gpuName || gpu.names[0] || null,
      cores: details.gpuCores,
    },
    diskFreeBytes,
    detectedAt: new Date().toISOString(),
  };
}

/** Короткая подпись графики, как на сайте: «10-core GPU», «NVIDIA RTX 4070», «CPU only». */
export function graphicsLabel(hw) {
  if (!hw.gpu || hw.gpu.backend === "cpu" || !hw.gpu.backend) return "CPU only";
  if (hw.gpu.unified && hw.gpu.cores) return `${hw.gpu.cores}-core GPU`;
  return hw.gpu.name || hw.gpu.names?.[0] || hw.gpu.backend.toUpperCase();
}
