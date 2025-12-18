import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const INPUT_DIR = path.resolve("./audio");
const OUT_DIR = path.resolve("./out");
fs.mkdirSync(OUT_DIR, { recursive: true });

function run(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: "utf8" });
  if (res.status !== 0) {
    console.error(res.stderr);
    throw new Error(`Command failed: ${cmd} ${args.join(" ")}`);
  }
  return res.stdout;
}

function ffprobeDurationSeconds(filePath) {
  const out = run("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]).trim();

  const sec = Number(out);
  if (!Number.isFinite(sec) || sec <= 0) {
    throw new Error(`Could not read duration for ${filePath}. ffprobe output: "${out}"`);
  }
  return sec;
}

function parseFile(fileName) {
  // Matches anything ending in _agent.mp3 or _customer.mp3
  // Example: 20251218093217_20251218_093214_127_agent.mp3
  const m = fileName.match(/^(.*)_(agent|customer)\.mp3$/i);
  if (!m) return null;

  const sortKey = m[1]; // everything before _agent/_customer
  const role = m[2].toLowerCase();

  return { sortKey, role, fileName };
}

function timestampForFilename() {
  // YYYYMMDDTHHMMSS (local time)
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function getSubdirectories(dir) {
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);
}

function processConversationDir(convoDirName) {
  const convoDir = path.join(INPUT_DIR, convoDirName);

  const parsed = fs
    .readdirSync(convoDir)
    .map(parseFile)
    .filter(Boolean)
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  if (parsed.length === 0) {
    console.log(`Skipping "${convoDirName}", no _agent/_customer mp3 files found`);
    return;
  }

  const hasAgent = parsed.some(p => p.role === "agent");
  const hasCustomer = parsed.some(p => p.role === "customer");
  if (!hasAgent || !hasCustomer) {
    console.log(`Skipping "${convoDirName}", missing agent or customer audio`);
    return;
  }

  const filesAbs = parsed.map(p => path.resolve(convoDir, p.fileName));
  const durations = filesAbs.map(ffprobeDurationSeconds);

  // Build one ffmpeg command that:
  // - loads each turn audio as an input
  // - for each turn, routes audio to either agent timeline or customer timeline
  // - inserts silence of matching duration for the other timeline
  // - concatenates timelines
  // - merges to stereo (agent left, customer right)
  const sampleRate = 48000;

  const ffmpegArgs = ["-y"];
  for (const f of filesAbs) ffmpegArgs.push("-i", f);

  const filterParts = [];
  const agentSegLabels = [];
  const customerSegLabels = [];

  for (let i = 0; i < filesAbs.length; i++) {
    const d = durations[i].toFixed(3);
    const role = parsed[i].role;

    // Normalize input to mono, consistent SR/format
    filterParts.push(
      `[${i}:a]aresample=${sampleRate},aformat=sample_fmts=s16:channel_layouts=mono[in${i}]`
    );

    if (role === "agent") {
      // Agent speaks, customer silent for same duration
      filterParts.push(`[in${i}]asetpts=N/SR[a${i}]`);
      filterParts.push(`anullsrc=r=${sampleRate}:cl=mono:d=${d}[c${i}]`);
    } else {
      // Customer speaks, agent silent for same duration
      filterParts.push(`anullsrc=r=${sampleRate}:cl=mono:d=${d}[a${i}]`);
      filterParts.push(`[in${i}]asetpts=N/SR[c${i}]`);
    }

    agentSegLabels.push(`[a${i}]`);
    customerSegLabels.push(`[c${i}]`);
  }

  filterParts.push(
    `${agentSegLabels.join("")}concat=n=${agentSegLabels.length}:v=0:a=1[agent]`
  );
  filterParts.push(
    `${customerSegLabels.join("")}concat=n=${customerSegLabels.length}:v=0:a=1[customer]`
  );

  // Merge agent left (c0), customer right (c1)
  filterParts.push(`[agent][customer]amerge=inputs=2,pan=stereo|c0=c0|c1=c1[st]`);

  const outFile = path.resolve(
    OUT_DIR,
    `${timestampForFilename()}_${convoDirName}_stereo.mp3`
  );

  ffmpegArgs.push(
    "-filter_complex", filterParts.join(";"),
    "-map", "[st]",
    "-c:a", "libmp3lame",
    "-q:a", "2",
    outFile
  );

  run("ffmpeg", ffmpegArgs);
  console.log("Created:", outFile);
}

// ---- Main ----
if (!fs.existsSync(INPUT_DIR)) {
  throw new Error(`Missing folder: ${INPUT_DIR}`);
}

const convoDirs = getSubdirectories(INPUT_DIR);

if (convoDirs.length === 0) {
  throw new Error(`No subdirectories found in ${INPUT_DIR}`);
}

for (const dir of convoDirs) {
  try {
    processConversationDir(dir);
  } catch (err) {
    console.error(`Failed processing "${dir}":`, err.message);
  }
}
