const express = require("express");
const fs = require("fs");
const fsPromises = require("fs").promises;
const path = require("path");
const toml = require("toml");

const app = express();
const PORT = process.env.PORT || 3000;
const ACTIVITIES_FILE_PATH = path.join(__dirname, "activities.toml");
const STATE_FILE_PATH = path.join(__dirname, "bingo_state.json");

let currentBingoState = null;

function todayDateString() {
  return new Date().toISOString().split("T")[0];
}

// --- State Management ---
async function loadState() {
  try {
    const data = await fsPromises.readFile(STATE_FILE_PATH, "utf-8");
    currentBingoState = JSON.parse(data);
    if (typeof currentBingoState.isBingoAchieved === "undefined") currentBingoState.isBingoAchieved = false;
    if (!currentBingoState.tableStakesChecked) currentBingoState.tableStakesChecked = [];
    if (!currentBingoState.deferredActivities) currentBingoState.deferredActivities = [];
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
  await fsPromises.writeFile(STATE_FILE_PATH, JSON.stringify(newState, null, 2), "utf-8");
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

  const existingRepeatableTexts = new Set(repeatableActivities.map((r) => r.text));

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
  };
}

function writeActivitiesData(data) {
  const fmtStringArray = (arr) => {
    if (!arr || arr.length === 0) return "[]";
    const items = arr.map((s) => `  "${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
    return "[\n" + items.join(",\n") + ",\n]";
  };

  // Simple arrays must come before [[repeatable_activities]] in TOML
  let out = `activities = ${fmtStringArray(data.activities || [])}\n`;
  out += `\ntable_stakes = ${fmtStringArray(data.table_stakes || [])}\n`;
  out += `\ntime_blocks = ${fmtStringArray(data.time_blocks || [])}\n`;

  const repeatables = data.repeatable_activities || [];
  if (repeatables.length > 0) {
    out += "\n";
    repeatables.forEach((r) => {
      out += `[[repeatable_activities]]\n`;
      out += `text = "${String(r.text).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"\n`;
      out += `maxPerDay = ${r.maxPerDay === "Dynamic" ? '"Dynamic"' : Number(r.maxPerDay) || 0}\n`;
      out += "\n";
    });
  }

  fs.writeFileSync(ACTIVITIES_FILE_PATH, out, "utf-8");
}

// --- Middleware ---
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
    (r) => r.text && !deferred.has(r.text)
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
  const { nonRepeatables, repeatables } = parseActivitiesForBoard(data, deferredActivities);

  let totalSlots = nonRepeatables.length;
  repeatables.forEach((r) => {
    const max = r.maxPerDay;
    if (max === 0) return;
    totalSlots += max === "Dynamic" ? 3 : Number(max) || 1;
  });

  const needed = 24;
  if (totalSlots >= needed) return { canFill: true, totalSlots, needed };

  const deficit = needed - totalSlots;
  const suggestions = [];

  const fixedRepeatables = repeatables.filter(
    (r) => r.maxPerDay !== "Dynamic" && Number(r.maxPerDay) > 0
  );
  if (fixedRepeatables.length > 0) {
    const sorted = [...fixedRepeatables].sort((a, b) => a.maxPerDay - b.maxPerDay);
    suggestions.push(
      `Increase maxPerDay for: ${sorted
        .slice(0, 3)
        .map((r) => `"${r.text}" (currently ${r.maxPerDay})`)
        .join(", ")}`
    );
  }
  const excludedRepeatables = (data.repeatable_activities || []).filter((r) => r.maxPerDay === 0);
  if (excludedRepeatables.length > 0) {
    suggestions.push(
      `Re-enable excluded repeatables: ${excludedRepeatables.map((r) => `"${r.text}"`).join(", ")}`
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

    const { nonRepeatables, repeatables, tableStakes, timeBlocks } = parseActivitiesForBoard(
      tomlData,
      deferredActivities
    );

    // Phase 1: fixed-count entries
    const basePool = [];
    nonRepeatables.forEach((text) => basePool.push({ text, isRepeatable: false }));
    repeatables
      .filter((r) => r.maxPerDay !== "Dynamic" && Number(r.maxPerDay) > 0)
      .forEach((r) => {
        for (let i = 0; i < Number(r.maxPerDay); i++) {
          basePool.push({ text: r.text, isRepeatable: true });
        }
      });

    // Phase 2: Dynamic repeatables – fill remaining slots up to max 3 each
    const dynamicRepeatables = repeatables.filter((r) => r.maxPerDay === "Dynamic");
    const dynamicPool = [];
    if (dynamicRepeatables.length > 0) {
      const remaining = Math.max(0, 24 - basePool.length);
      // When the pool needs filling, use exactly enough per Dynamic activity (deterministic).
      // When we already have plenty, use random 1-3 for variety.
      const targetPerDynamic = remaining > 0
        ? Math.min(3, Math.ceil(remaining / dynamicRepeatables.length))
        : Math.floor(Math.random() * 3) + 1;
      dynamicRepeatables.forEach((r) => {
        for (let i = 0; i < targetPerDynamic; i++) dynamicPool.push({ text: r.text, isRepeatable: true });
      });
    }

    const candidatePool = [...basePool, ...dynamicPool];
    shuffleArray(candidatePool);

    // Pick up to 24 unique-per-maxCount entries
    const bingoSlotsTexts = [];
    const boardActivityCounts = new Map();

    for (const entry of candidatePool) {
      if (bingoSlotsTexts.length >= 24) break;
      const { text, isRepeatable } = entry;
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
      }
    }

    // Safety fill with time blocks if pool ran short
    while (bingoSlotsTexts.length < 24) {
      bingoSlotsTexts.push(timeBlocks[Math.floor(Math.random() * timeBlocks.length)]);
    }

    const newBoardActivities = new Array(25);
    let actIdx = 0;
    for (let i = 0; i < 25; i++) {
      newBoardActivities[i] = i === 12 ? "TABLE STAKES" : bingoSlotsTexts[actIdx++];
    }

    const today = todayDateString();

    // Archive today → previousDay only when crossing a day boundary
    let previousDay = currentBingoState?.previousDay || null;
    if (
      currentBingoState?.boardActivities &&
      currentBingoState?.boardDate &&
      currentBingoState.boardDate !== today
    ) {
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
      markedCells: new Array(25).fill(false),
      isBingoAchieved: false,
      tableStakesChecked: new Array(tableStakes.length).fill(false),
      deferredActivities: [],
      previousDay,
    };
    await saveState(newState);
    res.json({ ...newState, tableStakes });
  } catch (error) {
    console.error("Error generating bingo board:", error);
    res.status(500).json({ error: "Failed to generate bingo board." });
  }
});

app.get("/get-current-board", (req, res) => {
  if (currentBingoState && currentBingoState.boardActivities) {
    let tableStakes = [];
    try {
      tableStakes = readActivitiesData().table_stakes || [];
    } catch (err) {
      console.error("Failed to read activities for table stakes:", err);
    }
    res.json({ ...currentBingoState, isBingoAchieved: currentBingoState.isBingoAchieved || false, tableStakes });
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
  if (typeof index !== "number" || index < 0 || index >= currentBingoState.markedCells.length)
    return res.status(400).json({ error: "Invalid cell index." });
  if (typeof isMarked !== "boolean")
    return res.status(400).json({ error: "isMarked must be boolean." });

  currentBingoState.markedCells[index] = isMarked;
  if (typeof isBingoAchievedByThisMove === "boolean")
    currentBingoState.isBingoAchieved = isBingoAchievedByThisMove;

  try {
    await saveState(currentBingoState);
    res.json({ success: true, markedCells: currentBingoState.markedCells, isBingoAchieved: currentBingoState.isBingoAchieved });
  } catch {
    res.status(500).json({ error: "Failed to save." });
  }
});

app.post("/mark-table-stakes", async (req, res) => {
  const { index, isChecked } = req.body;
  if (!currentBingoState) return res.status(400).json({ error: "No active board." });
  if (!currentBingoState.tableStakesChecked) currentBingoState.tableStakesChecked = [];
  if (typeof index !== "number") return res.status(400).json({ error: "Invalid index." });

  while (currentBingoState.tableStakesChecked.length <= index)
    currentBingoState.tableStakesChecked.push(false);
  currentBingoState.tableStakesChecked[index] = !!isChecked;

  try {
    await saveState(currentBingoState);
    res.json({ success: true, tableStakesChecked: currentBingoState.tableStakesChecked });
  } catch {
    res.status(500).json({ error: "Failed to save." });
  }
});

app.post("/defer-activity", async (req, res) => {
  const { activityText, deferred = true } = req.body;
  if (!activityText?.trim()) return res.status(400).json({ error: "activityText is required." });
  if (!currentBingoState) return res.status(400).json({ error: "No active board." });

  if (!currentBingoState.deferredActivities) currentBingoState.deferredActivities = [];
  const text = activityText.trim();

  if (deferred) {
    if (!currentBingoState.deferredActivities.includes(text))
      currentBingoState.deferredActivities.push(text);
  } else {
    currentBingoState.deferredActivities = currentBingoState.deferredActivities.filter((a) => a !== text);
  }

  try {
    await saveState(currentBingoState);
    res.json({ success: true, deferredActivities: currentBingoState.deferredActivities });
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
    });
  } catch {
    res.status(500).json({ error: "Failed to read activities." });
  }
});

app.post("/activities", (req, res) => {
  try {
    const { text, repeatable, maxPerDay } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: "text is required." });
    const data = readActivitiesData();
    const clean = text.trim();

    if (repeatable) {
      const existing = data.repeatable_activities.find((r) => r.text === clean);
      if (!existing) {
        const max = maxPerDay === undefined || maxPerDay === "Dynamic" ? "Dynamic" : parseInt(maxPerDay, 10);
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
  } catch {
    res.status(500).json({ error: "Failed to add activity." });
  }
});

app.patch("/activities", (req, res) => {
  try {
    const { text, maxPerDay } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: "text is required." });
    const data = readActivitiesData();
    const entry = data.repeatable_activities.find((r) => r.text === text.trim());
    if (!entry) return res.status(404).json({ error: "Repeatable activity not found." });

    entry.maxPerDay = maxPerDay === "Dynamic" ? "Dynamic" : parseInt(maxPerDay, 10);
    writeActivitiesData(data);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to update activity." });
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
      (a) => a.replace(/\s*\(repeatable\)$/i, "").trim() !== clean
    );
    data.repeatable_activities = (data.repeatable_activities || []).filter((r) => r.text !== clean);

    if (data.activities.length === beforeA && data.repeatable_activities.length === beforeR)
      return res.status(404).json({ error: "Activity not found." });

    writeActivitiesData(data);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to remove activity." });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

(async () => {
  await loadState();
  app.listen(PORT, () => console.log(`Bingo app listening at http://localhost:${PORT}`));
})();
