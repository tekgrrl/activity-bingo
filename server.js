const express = require("express");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const toml = require("toml");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const app = express();
const PORT = process.env.PORT || 3000;
const ACTIVITIES_FILE_PATH = path.join(__dirname, "activities.toml");
const STATE_FILE_PATH = path.join(__dirname, "bingo_state.json");
const WEEKLY_STATE_FILE_PATH = path.join(__dirname, "weekly_state.json");

// --- App Settings (local, gitignored) ---
let appSettings = {};
try {
  appSettings = JSON.parse(
    fs.readFileSync(path.join(__dirname, "settings.local.json"), "utf-8"),
  );
} catch {}
function getVaultDir() {
  return appSettings.obsidianVaultDir || process.env.OBSIDIAN_VAULT_DIR || null;
}
function getVaultName() {
  const d = getVaultDir();
  return (
    appSettings.obsidianVaultName ||
    process.env.OBSIDIAN_VAULT_NAME ||
    (d ? path.basename(d) : null)
  );
}

// --- Obsidian note helpers ---
function parseObsidianNote(content) {
  let body = content,
    frontmatterNextStep = null;
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (fmMatch) {
    const m = fmMatch[1].match(/^next_step:\s*(.+)$/m);
    if (m) frontmatterNextStep = m[1].trim().replace(/^["']|["']$/g, "");
    body = fmMatch[2];
  }
  const checkedCount = (body.match(/- \[x\] /gi) || []).length;
  const unchecked = [...body.matchAll(/^[ \t]*- \[ \] (.+)$/gm)];
  const totalCount = checkedCount + unchecked.length;
  const nextStep =
    unchecked.length > 0 ? unchecked[0][1].trim() : frontmatterNextStep || null;
  return { nextStep, checkedCount, totalCount, hasProgress: totalCount > 0 };
}

function buildNoteMap(tomlData, boardActivities) {
  const vaultDir = getVaultDir();
  const vaultName = getVaultName();
  if (!vaultDir || !vaultName) return {};
  let realVaultDir = vaultDir;
  try { realVaultDir = fs.realpathSync(vaultDir); } catch {}
  const activityPages = tomlData.activity_pages || {};
  const repeatablePages = {};
  (tomlData.repeatable_activities || []).forEach((r) => {
    if (r.obsidianPage) repeatablePages[r.text] = r.obsidianPage;
  });
  const noteMap = {};
  [...new Set((boardActivities || []).filter((t) => t !== "TABLE STAKES"))].forEach((text) => {
    const page = activityPages[text] || repeatablePages[text];
    if (!page) return;
    const obsidianUri = `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(page)}`;
    const filePath = path.join(realVaultDir, page.endsWith(".md") ? page : `${page}.md`);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      noteMap[text] = { ...parseObsidianNote(content), obsidianUri, page, exists: true };
    } catch (e) {
      console.error(`[Obsidian] Failed to read "${filePath}":`, e.message);
      noteMap[text] = { nextStep: null, checkedCount: 0, totalCount: 0, hasProgress: false, obsidianUri, page, exists: false };
    }
  });
  return noteMap;
}

const ACHIEVEMENT_DEFS = {
  readBook: {
    label: "Read an Entire Book",
    emoji: "📚",
    auto: false,
    hint: "Tell Claude which book you finished",
  },
  listenedBook: {
    label: "Listened to an Entire Book",
    emoji: "🎧",
    auto: false,
    hint: "Tell Claude which audiobook you finished",
  },
  studyGoal: {
    label: "Met a Study Goal",
    emoji: "🎓",
    auto: false,
    hint: "Tell Claude what you studied and what you achieved",
  },
  businessGoal: {
    label: "Met a Business Goal",
    emoji: "💼",
    auto: false,
    hint: "Tell Claude what business objective you hit",
  },
  won6of7: {
    label: "Won 6 of 7 Daily Bingos",
    emoji: "🎯",
    auto: true,
    hint: "Auto-tracked from your daily boards",
  },
  tableStakes7of7: {
    label: "Perfect Table Stakes Week",
    emoji: "✅",
    auto: true,
    hint: "Auto-tracked from your daily boards",
  },
  mustDosCleared: {
    label: "Cleared All Must-Dos",
    emoji: "⭐",
    auto: false,
    hint: "Tell Claude and confirm honestly — no cheating",
  },
  weeklyGoal: {
    label: "Weekly Goal Achieved",
    emoji: "🏆",
    auto: false,
    hint: "Tell Claude what your goal was and provide evidence",
  },
};

let currentBingoState = null;

function todayDateString() {
  return new Date().toISOString().split("T")[0];
}

// --- State Management ---
async function loadState() {
  try {
    const data = await fsPromises.readFile(STATE_FILE_PATH, "utf-8");
    currentBingoState = JSON.parse(data);
    if (typeof currentBingoState.isBingoAchieved === "undefined")
      currentBingoState.isBingoAchieved = false;
    if (!currentBingoState.tableStakesChecked)
      currentBingoState.tableStakesChecked = [];
    if (!currentBingoState.deferredActivities)
      currentBingoState.deferredActivities = [];
    if (!currentBingoState.mustDoCells)
      currentBingoState.mustDoCells = new Array(25).fill(false);
    if (!currentBingoState.repeatableCells)
      currentBingoState.repeatableCells = new Array(25).fill(false);
    if (!currentBingoState.inProgressCells)
      currentBingoState.inProgressCells = new Array(25).fill(false);
    console.log("Bingo state loaded.");
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log("No saved state found.");
    } else {
      console.error("Error loading bingo state:", error);
    }
    currentBingoState = {
      boardDate: null,
      boardActivities: null,
      markedCells: null,
      isBingoAchieved: false,
      tableStakesChecked: [],
      deferredActivities: [],
      previousDay: null,
    };
  }
}

async function saveState(newState) {
  currentBingoState = newState;
  await fsPromises.writeFile(
    STATE_FILE_PATH,
    JSON.stringify(newState, null, 2),
    "utf-8",
  );
}

// --- Activities File ---
function readActivitiesData() {
  const content = fs.readFileSync(ACTIVITIES_FILE_PATH, "utf-8");
  const parsed = toml.parse(content);

  // Normalise: old-style "(repeatable)" suffix entries get promoted to repeatable_activities
  const activities = [];
  const repeatableActivities = Array.isArray(parsed.repeatable_activities)
    ? parsed.repeatable_activities.map((r) => ({ ...r }))
    : [];

  const existingRepeatableTexts = new Set(
    repeatableActivities.map((r) => r.text),
  );

  if (Array.isArray(parsed.activities)) {
    parsed.activities.forEach((entry) => {
      if (typeof entry !== "string") return;
      const isOldRepeatable = /\s*\(repeatable\)$/i.test(entry);
      const text = entry.replace(/\s*\(repeatable\)$/i, "").trim();
      if (!text) return;
      if (isOldRepeatable && !existingRepeatableTexts.has(text)) {
        repeatableActivities.push({ text, maxPerDay: "Dynamic" });
        existingRepeatableTexts.add(text);
      } else if (!isOldRepeatable) {
        activities.push(entry);
      }
    });
  }

  return {
    activities,
    repeatable_activities: repeatableActivities,
    table_stakes: parsed.table_stakes || [],
    time_blocks: parsed.time_blocks || [],
    activity_pages: parsed.activity_pages || {},
  };
}

function writeActivitiesData(data) {
  const fmtStringArray = (arr) => {
    if (!arr || arr.length === 0) return "[]";
    const items = arr.map(
      (s) => `  "${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
    );
    return "[\n" + items.join(",\n") + ",\n]";
  };

  // Simple arrays must come before [[repeatable_activities]] in TOML
  let out = `activities = ${fmtStringArray(data.activities || [])}\n`;
  out += `\ntable_stakes = ${fmtStringArray(data.table_stakes || [])}\n`;
  out += `\ntime_blocks = ${fmtStringArray(data.time_blocks || [])}\n`;

  const pages = data.activity_pages || {};
  if (Object.keys(pages).length > 0) {
    out += "\n[activity_pages]\n";
    Object.entries(pages).forEach(([t, p]) => {
      out += `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" = "${p.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"\n`;
    });
  }

  const repeatables = data.repeatable_activities || [];
  if (repeatables.length > 0) {
    out += "\n";
    repeatables.forEach((r) => {
      out += `[[repeatable_activities]]\n`;
      out += `text = "${String(r.text).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"\n`;
      out += `maxPerDay = ${r.maxPerDay === "Dynamic" ? '"Dynamic"' : Number(r.maxPerDay) || 0}\n`;
      if (r.obsidianPage)
        out += `obsidianPage = "${String(r.obsidianPage).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"\n`;
      out += "\n";
    });
  }

  fs.writeFileSync(ACTIVITIES_FILE_PATH, out, "utf-8");
}

// --- Weekly State ---
let currentWeeklyState = null;

function getWeekStart() {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0];
}

function freshWeeklyState(weekStart) {
  return {
    weekStart,
    weeklyGoal: null,
    dailyResults: [],
    achievements: Object.fromEntries(
      Object.keys(ACHIEVEMENT_DEFS).map((id) => [
        id,
        { completed: false, evidence: null, completedAt: null },
      ]),
    ),
    weekCompleted: false,
    weekCompletedAt: null,
  };
}

async function loadWeeklyState() {
  try {
    const data = await fsPromises.readFile(WEEKLY_STATE_FILE_PATH, "utf-8");
    currentWeeklyState = JSON.parse(data);
  } catch {
    currentWeeklyState = freshWeeklyState(getWeekStart());
  }
  const thisWeek = getWeekStart();
  if (currentWeeklyState.weekStart !== thisWeek) {
    currentWeeklyState = freshWeeklyState(thisWeek);
    await saveWeeklyState();
  }
}

async function saveWeeklyState() {
  await fsPromises.writeFile(
    WEEKLY_STATE_FILE_PATH,
    JSON.stringify(currentWeeklyState, null, 2),
    "utf-8",
  );
}

function recomputeAutoAchievements() {
  const results = currentWeeklyState.dailyResults || [];
  const now = new Date().toISOString();

  const bingoWins = results.filter((r) => r.bingoAchieved).length;
  if (bingoWins >= 6 && !currentWeeklyState.achievements.won6of7.completed) {
    currentWeeklyState.achievements.won6of7.completed = true;
    currentWeeklyState.achievements.won6of7.completedAt = now;
  }

  const tsDays = results.filter((r) => r.tableStakesFullyDone).length;
  if (
    tsDays >= 7 &&
    !currentWeeklyState.achievements.tableStakes7of7.completed
  ) {
    currentWeeklyState.achievements.tableStakes7of7.completed = true;
    currentWeeklyState.achievements.tableStakes7of7.completedAt = now;
  }

  if (
    !currentWeeklyState.weekCompleted &&
    Object.values(currentWeeklyState.achievements).every((a) => a.completed)
  ) {
    currentWeeklyState.weekCompleted = true;
    currentWeeklyState.weekCompletedAt = now;
  }
}

async function archiveDailyResult(dayState) {
  if (!dayState?.boardDate || !dayState?.boardActivities) return;
  const {
    boardDate,
    markedCells,
    mustDoCells,
    isBingoAchieved,
    tableStakesChecked,
  } = dayState;

  if (currentWeeklyState.dailyResults.some((r) => r.date === boardDate)) return;

  const weekEnd = new Date(currentWeeklyState.weekStart + "T12:00:00Z");
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const weekEndStr = weekEnd.toISOString().split("T")[0];
  if (boardDate < currentWeeklyState.weekStart || boardDate > weekEndStr)
    return;

  const tableStakesFullyDone = !!(
    markedCells?.[12] &&
    (tableStakesChecked || []).length > 0 &&
    (tableStakesChecked || []).every(Boolean)
  );

  const mustDoIndices = (mustDoCells || []).reduce(
    (acc, v, i) => (v ? [...acc, i] : acc),
    [],
  );
  const mustDoCount = mustDoIndices.length;
  const allMustDosDone =
    mustDoCount > 0 && mustDoIndices.every((i) => !!markedCells?.[i]);

  currentWeeklyState.dailyResults.push({
    date: boardDate,
    bingoAchieved: !!isBingoAchieved,
    tableStakesFullyDone,
    mustDoCount,
    allMustDosDone,
    markedCount: (markedCells || []).filter(Boolean).length,
  });

  recomputeAutoAchievements();
  await saveWeeklyState();
}

// --- Middleware ---
app.use((req, res, next) => {
  if (req.path.endsWith(".js") || req.path.endsWith(".css")) {
    res.setHeader("Cache-Control", "no-store");
  }
  next();
});
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// --- Helpers ---
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function parseActivitiesForBoard(data, deferredActivities = []) {
  const deferred = new Set((deferredActivities || []).map((a) => a.trim()));

  const nonRepeatables = (data.activities || [])
    .filter((a) => typeof a === "string")
    .map((a) => a.replace(/\s*\(repeatable\)$/i, "").trim())
    .filter((text) => text && !deferred.has(text));

  const repeatables = (data.repeatable_activities || []).filter(
    (r) => r.text && !deferred.has(r.text),
  );

  const tableStakes = Array.isArray(data.table_stakes) ? data.table_stakes : [];
  const timeBlocks =
    Array.isArray(data.time_blocks) && data.time_blocks.length > 0
      ? data.time_blocks
      : ["2 hour study block"];

  return { nonRepeatables, repeatables, tableStakes, timeBlocks };
}

// Counts activity slots excluding time blocks. Used to check if the board can
// be filled without relying on time block repetition.
function checkBoardCapacity(data, deferredActivities = []) {
  const { nonRepeatables, repeatables } = parseActivitiesForBoard(
    data,
    deferredActivities,
  );

  let repSlots = 0;
  repeatables.forEach((r) => {
    const max = r.maxPerDay;
    if (max === 0) return;
    repSlots += max === "Dynamic" ? 3 : Number(max) || 1;
  });
  const totalSlots = nonRepeatables.length + Math.min(6, repSlots);

  const needed = 24;
  if (totalSlots >= needed) return { canFill: true, totalSlots, needed };

  const deficit = needed - totalSlots;
  const suggestions = [];

  const fixedRepeatables = repeatables.filter(
    (r) => r.maxPerDay !== "Dynamic" && Number(r.maxPerDay) > 0,
  );
  if (fixedRepeatables.length > 0) {
    const sorted = [...fixedRepeatables].sort(
      (a, b) => a.maxPerDay - b.maxPerDay,
    );
    suggestions.push(
      `Increase maxPerDay for: ${sorted
        .slice(0, 3)
        .map((r) => `"${r.text}" (currently ${r.maxPerDay})`)
        .join(", ")}`,
    );
  }
  const excludedRepeatables = (data.repeatable_activities || []).filter(
    (r) => r.maxPerDay === 0,
  );
  if (excludedRepeatables.length > 0) {
    suggestions.push(
      `Re-enable excluded repeatables: ${excludedRepeatables.map((r) => `"${r.text}"`).join(", ")}`,
    );
  }
  suggestions.push(`Add at least ${deficit} more non-repeatable activities.`);

  return { canFill: false, totalSlots, needed, deficit, suggestions };
}

// --- API ---
app.get("/generate-bingo", async (req, res) => {
  try {
    const tomlData = readActivitiesData();
    const deferredActivities = currentBingoState?.deferredActivities || [];

    const capacity = checkBoardCapacity(tomlData, deferredActivities);
    if (!capacity.canFill) {
      return res.status(422).json({
        error: "Not enough activities to fill the board.",
        ...capacity,
      });
    }

    const { nonRepeatables, repeatables, tableStakes, timeBlocks } =
      parseActivitiesForBoard(tomlData, deferredActivities);

    // Phase 1: fixed-count entries
    const basePool = [];
    nonRepeatables.forEach((text) =>
      basePool.push({ text, isRepeatable: false }),
    );
    repeatables
      .filter((r) => r.maxPerDay !== "Dynamic" && Number(r.maxPerDay) > 0)
      .forEach((r) => {
        for (let i = 0; i < Number(r.maxPerDay); i++) {
          basePool.push({ text: r.text, isRepeatable: true });
        }
      });

    // Phase 2: Dynamic repeatables – fill remaining slots up to max 3 each
    const dynamicRepeatables = repeatables.filter(
      (r) => r.maxPerDay === "Dynamic",
    );
    const dynamicPool = [];
    if (dynamicRepeatables.length > 0) {
      const remaining = Math.max(0, 24 - basePool.length);
      // When the pool needs filling, use exactly enough per Dynamic activity (deterministic).
      // When we already have plenty, use random 1-3 for variety.
      const targetPerDynamic =
        remaining > 0
          ? Math.min(3, Math.ceil(remaining / dynamicRepeatables.length))
          : Math.floor(Math.random() * 3) + 1;
      dynamicRepeatables.forEach((r) => {
        for (let i = 0; i < targetPerDynamic; i++)
          dynamicPool.push({ text: r.text, isRepeatable: true });
      });
    }

    const candidatePool = [...basePool, ...dynamicPool];
    shuffleArray(candidatePool);

    // Pick up to 24 unique-per-maxCount entries, capping total repeatables at 6
    const REPEATABLE_CAP = 6;
    const bingoSlotsTexts = [];
    const boardActivityCounts = new Map();
    let repeatableCount = 0;

    for (const entry of candidatePool) {
      if (bingoSlotsTexts.length >= 24) break;
      const { text, isRepeatable } = entry;
      if (isRepeatable && repeatableCount >= REPEATABLE_CAP) continue;
      const currentCount = boardActivityCounts.get(text) || 0;
      const r = isRepeatable ? repeatables.find((x) => x.text === text) : null;
      const maxCount = r
        ? r.maxPerDay === "Dynamic"
          ? 3
          : Number(r.maxPerDay) || 1
        : 1;
      if (currentCount < maxCount) {
        bingoSlotsTexts.push(text);
        boardActivityCounts.set(text, currentCount + 1);
        if (isRepeatable) repeatableCount++;
      }
    }

    // Safety fill with time blocks if pool ran short
    while (bingoSlotsTexts.length < 24) {
      bingoSlotsTexts.push(
        timeBlocks[Math.floor(Math.random() * timeBlocks.length)],
      );
    }

    const repeatableTexts = new Set(repeatables.map((r) => r.text));
    const newBoardActivities = new Array(25);
    const repeatableCells = new Array(25).fill(false);
    let actIdx = 0;
    for (let i = 0; i < 25; i++) {
      if (i === 12) {
        newBoardActivities[i] = "TABLE STAKES";
      } else {
        const text = bingoSlotsTexts[actIdx++];
        newBoardActivities[i] = text;
        repeatableCells[i] = repeatableTexts.has(text);
      }
    }

    const today = todayDateString();

    // Archive today → previousDay only when crossing a day boundary
    let previousDay = currentBingoState?.previousDay || null;
    if (
      currentBingoState?.boardActivities &&
      currentBingoState?.boardDate &&
      currentBingoState.boardDate !== today
    ) {
      await archiveDailyResult(currentBingoState);
      previousDay = {
        boardDate: currentBingoState.boardDate,
        boardActivities: currentBingoState.boardActivities,
        markedCells: currentBingoState.markedCells,
        isBingoAchieved: currentBingoState.isBingoAchieved,
        tableStakesChecked: currentBingoState.tableStakesChecked,
      };
    }

    const newState = {
      boardDate: today,
      boardActivities: newBoardActivities,
      repeatableCells,
      markedCells: new Array(25).fill(false),
      mustDoCells: new Array(25).fill(false),
      inProgressCells: new Array(25).fill(false),
      isBingoAchieved: false,
      tableStakesChecked: new Array(tableStakes.length).fill(false),
      deferredActivities: [],
      previousDay,
    };
    await saveState(newState);
    let noteMap = {};
    try {
      noteMap = buildNoteMap(tomlData, newBoardActivities);
    } catch {}
    res.json({ ...newState, tableStakes, noteMap });
  } catch (error) {
    console.error("Error generating bingo board:", error);
    res.status(500).json({ error: "Failed to generate bingo board." });
  }
});

app.get("/get-current-board", (req, res) => {
  if (currentBingoState && currentBingoState.boardActivities) {
    let tableStakes = [],
      noteMap = {};
    try {
      const tomlData = readActivitiesData();
      tableStakes = tomlData.table_stakes || [];
      noteMap = buildNoteMap(tomlData, currentBingoState.boardActivities);
    } catch (err) {
      console.error("Failed to read activities:", err);
    }
    res.json({
      ...currentBingoState,
      isBingoAchieved: currentBingoState.isBingoAchieved || false,
      tableStakes,
      noteMap,
    });
  } else {
    res.json({
      boardDate: null,
      boardActivities: null,
      markedCells: null,
      isBingoAchieved: false,
      tableStakesChecked: [],
      tableStakes: [],
      deferredActivities: [],
      previousDay: null,
    });
  }
});

app.post("/mark-cell", async (req, res) => {
  const { index, isMarked, isBingoAchievedByThisMove } = req.body;
  if (!currentBingoState?.boardActivities)
    return res.status(400).json({ error: "No active bingo board." });
  if (currentBingoState.isBingoAchieved && !isBingoAchievedByThisMove)
    return res.status(403).json({ error: "Board is locked." });
  if (
    typeof index !== "number" ||
    index < 0 ||
    index >= currentBingoState.markedCells.length
  )
    return res.status(400).json({ error: "Invalid cell index." });
  if (typeof isMarked !== "boolean")
    return res.status(400).json({ error: "isMarked must be boolean." });

  currentBingoState.markedCells[index] = isMarked;
  if (typeof isBingoAchievedByThisMove === "boolean")
    currentBingoState.isBingoAchieved = isBingoAchievedByThisMove;

  try {
    await saveState(currentBingoState);
    res.json({
      success: true,
      markedCells: currentBingoState.markedCells,
      isBingoAchieved: currentBingoState.isBingoAchieved,
    });
  } catch {
    res.status(500).json({ error: "Failed to save." });
  }
});

app.post("/mark-table-stakes", async (req, res) => {
  const { index, isChecked } = req.body;
  if (!currentBingoState)
    return res.status(400).json({ error: "No active board." });
  if (!currentBingoState.tableStakesChecked)
    currentBingoState.tableStakesChecked = [];
  if (typeof index !== "number")
    return res.status(400).json({ error: "Invalid index." });

  while (currentBingoState.tableStakesChecked.length <= index)
    currentBingoState.tableStakesChecked.push(false);
  currentBingoState.tableStakesChecked[index] = !!isChecked;

  try {
    await saveState(currentBingoState);
    res.json({
      success: true,
      tableStakesChecked: currentBingoState.tableStakesChecked,
    });
  } catch {
    res.status(500).json({ error: "Failed to save." });
  }
});

app.post("/defer-activity", async (req, res) => {
  const { activityText, deferred = true } = req.body;
  if (!activityText?.trim())
    return res.status(400).json({ error: "activityText is required." });
  if (!currentBingoState)
    return res.status(400).json({ error: "No active board." });

  if (!currentBingoState.deferredActivities)
    currentBingoState.deferredActivities = [];
  const text = activityText.trim();

  if (deferred) {
    if (!currentBingoState.deferredActivities.includes(text))
      currentBingoState.deferredActivities.push(text);
  } else {
    currentBingoState.deferredActivities =
      currentBingoState.deferredActivities.filter((a) => a !== text);
  }

  try {
    await saveState(currentBingoState);
    res.json({
      success: true,
      deferredActivities: currentBingoState.deferredActivities,
    });
  } catch {
    res.status(500).json({ error: "Failed to save." });
  }
});

app.get("/activities", (req, res) => {
  try {
    const data = readActivitiesData();
    res.json({
      activities: data.activities || [],
      repeatable_activities: data.repeatable_activities || [],
      table_stakes: data.table_stakes || [],
      time_blocks: data.time_blocks || [],
      activity_pages: data.activity_pages || {},
    });
  } catch (e) {
    console.error("GET /activities error:", e);
    res.status(500).json({ error: e.message || "Failed to read activities." });
  }
});

app.post("/activities", (req, res) => {
  try {
    const { text, repeatable, maxPerDay } = req.body;
    if (!text?.trim())
      return res.status(400).json({ error: "text is required." });
    const data = readActivitiesData();
    const clean = text.trim();

    if (repeatable) {
      const existing = data.repeatable_activities.find((r) => r.text === clean);
      if (!existing) {
        const max =
          maxPerDay === undefined || maxPerDay === "Dynamic"
            ? "Dynamic"
            : parseInt(maxPerDay, 10);
        data.repeatable_activities.push({ text: clean, maxPerDay: max });
        writeActivitiesData(data);
      }
    } else {
      data.activities = data.activities || [];
      if (!data.activities.includes(clean)) {
        data.activities.push(clean);
        writeActivitiesData(data);
      }
    }
    res.json({ success: true });
  } catch (e) {
    console.error("POST /activities error:", e);
    res.status(500).json({ error: e.message || "Failed to add activity." });
  }
});

app.patch("/activities", (req, res) => {
  try {
    const { text, maxPerDay, obsidianPage } = req.body;
    if (!text?.trim())
      return res.status(400).json({ error: "text is required." });
    const data = readActivitiesData();
    const clean = text.trim();
    const repEntry = data.repeatable_activities.find((r) => r.text === clean);

    if (maxPerDay !== undefined) {
      if (!repEntry)
        return res
          .status(404)
          .json({ error: "Repeatable activity not found." });
      repEntry.maxPerDay =
        maxPerDay === "Dynamic" ? "Dynamic" : parseInt(maxPerDay, 10);
    }

    if (obsidianPage !== undefined) {
      if (repEntry) {
        if (obsidianPage) repEntry.obsidianPage = obsidianPage;
        else delete repEntry.obsidianPage;
      } else {
        if (!data.activity_pages) data.activity_pages = {};
        if (obsidianPage) data.activity_pages[clean] = obsidianPage;
        else delete data.activity_pages[clean];
      }
    }

    writeActivitiesData(data);
    res.json({ success: true });
  } catch (e) {
    console.error("PATCH /activities error:", e);
    res.status(500).json({ error: e.message || "Failed to update activity." });
  }
});

app.delete("/activities", (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "text is required." });
    const data = readActivitiesData();
    const clean = text.trim();

    const beforeA = data.activities?.length || 0;
    const beforeR = data.repeatable_activities?.length || 0;
    data.activities = (data.activities || []).filter(
      (a) => a.replace(/\s*\(repeatable\)$/i, "").trim() !== clean,
    );
    data.repeatable_activities = (data.repeatable_activities || []).filter(
      (r) => r.text !== clean,
    );

    if (
      data.activities.length === beforeA &&
      data.repeatable_activities.length === beforeR
    )
      return res.status(404).json({ error: "Activity not found." });

    if (data.activity_pages) delete data.activity_pages[clean];
    writeActivitiesData(data);
    res.json({ success: true });
  } catch (e) {
    console.error("DELETE /activities error:", e);
    res.status(500).json({ error: e.message || "Failed to remove activity." });
  }
});

app.post("/in-progress", async (req, res) => {
  const { index, isInProgress } = req.body;
  if (!currentBingoState?.boardActivities)
    return res.status(400).json({ error: "No active board." });
  if (typeof index !== "number" || index < 0 || index >= 25)
    return res.status(400).json({ error: "Invalid cell index." });
  if (!currentBingoState.inProgressCells)
    currentBingoState.inProgressCells = new Array(25).fill(false);
  currentBingoState.inProgressCells[index] = !!isInProgress;
  try {
    await saveState(currentBingoState);
    res.json({ success: true, inProgressCells: currentBingoState.inProgressCells });
  } catch {
    res.status(500).json({ error: "Failed to save." });
  }
});

app.post("/must-do", async (req, res) => {
  const { index, isMustDo } = req.body;
  if (!currentBingoState?.boardActivities)
    return res.status(400).json({ error: "No active board." });
  if (typeof index !== "number" || index < 0 || index >= 25)
    return res.status(400).json({ error: "Invalid cell index." });

  if (!currentBingoState.mustDoCells)
    currentBingoState.mustDoCells = new Array(25).fill(false);
  currentBingoState.mustDoCells[index] = !!isMustDo;

  try {
    await saveState(currentBingoState);
    res.json({ success: true, mustDoCells: currentBingoState.mustDoCells });
  } catch {
    res.status(500).json({ error: "Failed to save." });
  }
});

// --- Obsidian API ---
app.get("/obsidian-config", (req, res) => {
  res.json({ configured: !!getVaultDir(), vaultName: getVaultName() });
});

app.get("/obsidian-note/pick", async (req, res) => {
  const vaultDir = getVaultDir();
  if (!vaultDir) return res.status(400).json({ error: "Vault not configured." });
  const creating = req.query.mode === "create";
  const activityName = ((req.query.activity || "New Note").replace(/[:/\\]/g, "-")).trim();
  try {
    // Resolve symlinks — Dropbox may be at /Library/CloudStorage/Dropbox while settings uses ~/Dropbox
    let realVaultDir = vaultDir;
    try { realVaultDir = fs.realpathSync(vaultDir); } catch {}

    const script = creating
      ? `POSIX path of (choose file name with prompt "Create a new Obsidian note" default name "${activityName}.md" default location POSIX file "${realVaultDir}")`
      : `POSIX path of (choose file with prompt "Select an Obsidian note" default location POSIX file "${realVaultDir}")`;
    const { stdout } = await execFileAsync("osascript", ["-e", script]);
    const fullPath = stdout.trim();
    let relative = path.relative(realVaultDir, fullPath);
    if (relative.endsWith(".md")) relative = relative.slice(0, -3);
    res.json({ path: relative });
  } catch (e) {
    if (e.code === 1) return res.json({ cancelled: true });
    console.error("File picker error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.post("/obsidian-note/create", (req, res) => {
  try {
    const { activityText, page } = req.body;
    if (!activityText?.trim() || !page?.trim())
      return res
        .status(400)
        .json({ error: "activityText and page are required." });
    const vaultDir = getVaultDir();
    if (!vaultDir)
      return res.status(400).json({ error: "Obsidian vault not configured." });
    const notePath = page.trim().endsWith(".md")
      ? page.trim()
      : `${page.trim()}.md`;
    const fullPath = path.join(vaultDir, notePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    if (fs.existsSync(fullPath))
      return res.status(409).json({ error: "Note already exists." });
    fs.writeFileSync(
      fullPath,
      `# ${activityText.trim()}\n\n## Steps\n\n- [ ] First step\n\n## Notes\n\n`,
      "utf-8",
    );
    const data = readActivitiesData();
    const clean = activityText.trim();
    const repEntry = data.repeatable_activities.find((r) => r.text === clean);
    if (repEntry) {
      repEntry.obsidianPage = page.trim();
    } else {
      if (!data.activity_pages) data.activity_pages = {};
      data.activity_pages[clean] = page.trim();
    }
    writeActivitiesData(data);
    res.json({ success: true, page: page.trim() });
  } catch (e) {
    res.status(500).json({ error: "Failed to create note: " + e.message });
  }
});

// --- Weekly Board API ---
app.get("/weekly-board", (req, res) => {
  const state = currentWeeklyState;
  const results = state.dailyResults || [];
  const achievements = Object.entries(ACHIEVEMENT_DEFS).map(([id, def]) => ({
    id,
    ...def,
    ...(state.achievements[id] || {}),
  }));
  res.json({
    weekStart: state.weekStart,
    weeklyGoal: state.weeklyGoal,
    weekCompleted: state.weekCompleted,
    weekCompletedAt: state.weekCompletedAt,
    dailyResults: results,
    achievements,
    progress: {
      bingoWins: results.filter((r) => r.bingoAchieved).length,
      tsDays: results.filter((r) => r.tableStakesFullyDone).length,
      daysRecorded: results.length,
      mustDoDaysCleared: results.filter(
        (r) => r.mustDoCount > 0 && r.allMustDosDone,
      ).length,
      mustDoDaysWithFlags: results.filter((r) => r.mustDoCount > 0).length,
    },
  });
});

app.post("/weekly-board/complete-achievement", async (req, res) => {
  const { achievementId, evidence } = req.body;
  if (!achievementId || !ACHIEVEMENT_DEFS[achievementId])
    return res.status(400).json({ error: "Invalid achievementId." });

  const ach = currentWeeklyState.achievements[achievementId];
  if (ach.completed) return res.json({ success: true, alreadyCompleted: true });

  ach.completed = true;
  ach.evidence = evidence || null;
  ach.completedAt = new Date().toISOString();

  recomputeAutoAchievements();
  try {
    await saveWeeklyState();
    res.json({
      success: true,
      weekCompleted: currentWeeklyState.weekCompleted,
    });
  } catch {
    res.status(500).json({ error: "Failed to save." });
  }
});

app.post("/weekly-board/set-goal", async (req, res) => {
  const { goal } = req.body;
  if (!goal?.trim())
    return res.status(400).json({ error: "goal is required." });
  currentWeeklyState.weeklyGoal = goal.trim();
  try {
    await saveWeeklyState();
    res.json({ success: true, weeklyGoal: currentWeeklyState.weeklyGoal });
  } catch {
    res.status(500).json({ error: "Failed to save." });
  }
});

app.get("/weekly", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "weekly.html"));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

(async () => {
  await loadState();
  await loadWeeklyState();
  app.listen(PORT, () =>
    console.log(`Bingo app listening at http://localhost:${PORT}`),
  );
})();
