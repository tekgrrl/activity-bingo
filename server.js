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

// --- State Management Functions ---
async function loadState() {
  try {
    const data = await fsPromises.readFile(STATE_FILE_PATH, "utf-8");
    currentBingoState = JSON.parse(data);
    if (typeof currentBingoState.isBingoAchieved === "undefined") {
      currentBingoState.isBingoAchieved = false;
    }
    console.log("Bingo state loaded successfully from bingo_state.json.");
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(
        "No saved bingo state (bingo_state.json) found. A new one will be created on generation."
      );
      currentBingoState = {
        boardActivities: null,
        markedCells: null,
        isBingoAchieved: false,
      };
    } else {
      console.error("Error loading bingo state:", error);
      currentBingoState = {
        boardActivities: null,
        markedCells: null,
        isBingoAchieved: false,
      };
    }
  }
}

async function saveState(newState) {
  try {
    currentBingoState = newState;
    await fsPromises.writeFile(
      STATE_FILE_PATH,
      JSON.stringify(newState, null, 2),
      "utf-8"
    );
    console.log("Bingo state saved successfully to bingo_state.json.");
  } catch (error) {
    console.error("Error saving bingo state:", error);
    throw error;
  }
}

// --- Middleware ---
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// --- Helper Functions (shuffleArray, parseActivities) ---
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * Parses activities from TOML content.
 * @param {object} tomlContent - Parsed TOML data.
 * @returns {{nonRepeatableActivities: string[], repeatableActivities: string[]}}
 */
function parseActivities(tomlContent) {
  const nonRepeatableActivityTexts = [];
  const repeatableActivityTexts = []; // Stores unique texts of repeatable activities
  const repeatableRegex = /\s*\(repeatable\)$/i;

  if (tomlContent.activities && Array.isArray(tomlContent.activities)) {
    tomlContent.activities.forEach((activity) => {
      if (typeof activity === "string") {
        const isRepeatable = repeatableRegex.test(activity);
        const text = activity.replace(repeatableRegex, "").trim();
        if (text) {
          if (isRepeatable) {
            if (!repeatableActivityTexts.includes(text)) {
              // Store unique texts
              repeatableActivityTexts.push(text);
            }
          } else {
            if (!nonRepeatableActivityTexts.includes(text)) {
              // Store unique texts
              nonRepeatableActivityTexts.push(text);
            }
          }
        }
      }
    });
  }
  return {
    nonRepeatableActivities: nonRepeatableActivityTexts,
    repeatableActivities: repeatableActivityTexts,
  };
}

// --- API Endpoints ---
app.get("/generate-bingo", async (req, res) => {
  try {
    const fileContent = fs.readFileSync(ACTIVITIES_FILE_PATH, "utf-8");
    const tomlData = toml.parse(fileContent);
    // nonRepeatableActivities will be an array of unique activity strings.
    // repeatableActivities will be an array of unique repeatable activity strings.
    const { nonRepeatableActivities, repeatableActivities } =
      parseActivities(tomlData);

    // 1. Create an expanded candidate pool
    let candidatePool = [];

    // Add non-repeatable activities (as objects to distinguish their original type if needed, though text is primary)
    nonRepeatableActivities.forEach((text) => {
      candidatePool.push({ text: text, isOriginallyRepeatable: false });
    });

    // For each *type* of repeatable activity, add it 1 to 3 times randomly to the pool
    repeatableActivities.forEach((text) => {
      const timesToAdd = Math.floor(Math.random() * 3) + 1; // Randomly 1, 2, or 3
      for (let i = 0; i < timesToAdd; i++) {
        candidatePool.push({ text: text, isOriginallyRepeatable: true });
      }
    });

    // 2. Shuffle this candidate pool
    shuffleArray(candidatePool);

    // 3. Select 24 activities for the board from the shuffled pool, respecting constraints
    let bingoSlotsTexts = []; // This will hold the texts for the board
    const boardActivityCounts = new Map(); // Tracks counts of activity *texts* on the board

    for (const poolEntry of candidatePool) {
      if (bingoSlotsTexts.length >= 24) {
        break; // Board is full
      }

      const activityText = poolEntry.text;
      const isFromRepeatableList = poolEntry.isOriginallyRepeatable;
      const currentCountOnBoard = boardActivityCounts.get(activityText) || 0;

      if (isFromRepeatableList) {
        // This activity text comes from the original list of repeatable activities
        if (currentCountOnBoard < 3) {
          bingoSlotsTexts.push(activityText);
          boardActivityCounts.set(activityText, currentCountOnBoard + 1);
        }
      } else {
        // This activity text comes from the original list of non-repeatable activities
        if (currentCountOnBoard < 1) {
          // Non-repeatable can only appear once
          bingoSlotsTexts.push(activityText);
          boardActivityCounts.set(activityText, currentCountOnBoard + 1);
        }
      }
    }

    // 4. Prepare final 24 slots, filling with "Empty" if not enough were selected
    const finalActivitySlots = new Array(24).fill("Empty");
    for (let i = 0; i < Math.min(24, bingoSlotsTexts.length); i++) {
      finalActivitySlots[i] = bingoSlotsTexts[i];
    }

    // 5. Construct the 5x5 board with "FREE SPACE"
    const newBoardActivities = new Array(25);
    let activityIdx = 0;
    for (let i = 0; i < 25; i++) {
      newBoardActivities[i] =
        i === 12 ? "FREE SPACE" : finalActivitySlots[activityIdx++];
    }

    const newMarkedCells = new Array(25).fill(false);
    if (newBoardActivities[12] === "FREE SPACE") newMarkedCells[12] = true;

    const newState = {
      boardActivities: newBoardActivities,
      markedCells: newMarkedCells,
      isBingoAchieved: false,
    };
    await saveState(newState);
    res.json(newState);
  } catch (error) {
    console.error("Error generating bingo board:", error);
    if (error.code === "ENOENT" && error.path === ACTIVITIES_FILE_PATH) {
      res
        .status(500)
        .json({
          error:
            "Activities file (activities.toml) not found. Please create it.",
        });
    } else if (error.message.includes("TOML Parse Error")) {
      res
        .status(500)
        .json({
          error: "Error parsing activities.toml. Please check its format.",
        });
    } else {
      res
        .status(500)
        .json({
          error:
            "Failed to generate bingo board due to an internal server error.",
        });
    }
  }
});

app.get("/get-current-board", (req, res) => {
  if (currentBingoState && currentBingoState.boardActivities) {
    const stateToSend = {
      ...currentBingoState,
      isBingoAchieved: currentBingoState.isBingoAchieved || false,
    };
    res.json(stateToSend);
  } else {
    res.json({
      boardActivities: null,
      markedCells: null,
      isBingoAchieved: false,
    });
  }
});

app.post("/mark-cell", async (req, res) => {
  const { index, isMarked, isBingoAchievedByThisMove } = req.body;

  if (!currentBingoState || !currentBingoState.boardActivities) {
    return res
      .status(400)
      .json({ error: "No active bingo board. Generate one first." });
  }
  if (currentBingoState.isBingoAchieved && !isBingoAchievedByThisMove) {
    return res
      .status(403)
      .json({ error: "Board is already locked due to a previous Bingo." });
  }

  if (
    typeof index !== "number" ||
    index < 0 ||
    index >= currentBingoState.markedCells.length
  ) {
    return res.status(400).json({ error: "Invalid cell index provided." });
  }
  if (typeof isMarked !== "boolean") {
    return res
      .status(400)
      .json({
        error: "Invalid marked status provided (must be true or false).",
      });
  }

  currentBingoState.markedCells[index] = isMarked;
  if (typeof isBingoAchievedByThisMove === "boolean") {
    currentBingoState.isBingoAchieved = isBingoAchievedByThisMove;
  }

  try {
    await saveState(currentBingoState);
    res.json({
      success: true,
      markedCells: currentBingoState.markedCells,
      isBingoAchieved: currentBingoState.isBingoAchieved,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to save marked cell state." });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --- Server Initialization ---
(async () => {
  await loadState();
  app.listen(PORT, () => {
    console.log(`Bingo app listening at http://localhost:${PORT}`);
    if (!currentBingoState || !currentBingoState.boardActivities) {
      console.log(
        "Hint: No saved board found. Click 'Generate New Board' in the browser to start."
      );
    } else {
      console.log(
        `Hint: Existing board loaded. Bingo achieved status: ${currentBingoState.isBingoAchieved}. Check your browser.`
      );
    }
  });
})();
