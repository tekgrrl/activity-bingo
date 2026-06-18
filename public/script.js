document.addEventListener("DOMContentLoaded", () => {
  const bingoCardContainer = document.getElementById("bingo-card");
  const newBoardBtn = document.getElementById("new-board-btn");
  const messageArea = document.getElementById("message-area");
  const saveStatusEl = document.getElementById("save-status");

  // Confirm modal
  const confirmModal = document.getElementById("confirmation-modal");
  const confirmModalContent = document.getElementById("confirm-modal-content");
  const modalMessage = document.getElementById("modal-message");
  const modalConfirmBtn = document.getElementById("modal-confirm-btn");
  const modalDeferBtn = document.getElementById("modal-defer-btn");
  const modalCancelBtn = document.getElementById("modal-cancel-btn");

  // TABLE STAKES modal
  const tsModal = document.getElementById("table-stakes-modal");
  const tsListEl = document.getElementById("table-stakes-list");
  const tsMarkBtn = document.getElementById("ts-mark-btn");
  const tsCloseBtn = document.getElementById("ts-close-btn");

  // New Day modal
  const newDayModal = document.getElementById("new-day-modal");
  const newDaySubtitle = document.getElementById("new-day-subtitle");
  const newDayStats = document.getElementById("new-day-stats");
  const previousBoardMini = document.getElementById("previous-board-mini");
  const newDayGenerateBtn = document.getElementById("new-day-generate-btn");
  const newDayDismissBtn = document.getElementById("new-day-dismiss-btn");

  // Capacity modal
  const capacityModal = document.getElementById("capacity-modal");
  const capacityMessage = document.getElementById("capacity-message");
  const capacitySuggestions = document.getElementById("capacity-suggestions");
  const capacityManageBtn = document.getElementById("capacity-manage-btn");
  const capacityCloseBtn = document.getElementById("capacity-close-btn");

  // Activities modal
  const activitiesModal = document.getElementById("activities-modal");
  const activitiesListEl = document.getElementById("activities-list");
  const newActivityInput = document.getElementById("new-activity-input");
  const repeatableCheckbox = document.getElementById("repeatable-checkbox");
  const maxPerDayRow = document.getElementById("max-per-day-row");
  const maxPerDaySelect = document.getElementById("max-per-day-select");
  const addActivityBtn = document.getElementById("add-activity-btn");
  const activitiesCloseBtn = document.getElementById("activities-close-btn");
  const manageActivitiesBtn = document.getElementById("manage-activities-btn");

  let isBingoAchievedGlobal = false;
  let tableStakesGlobal = [];
  let tableStakesCheckedGlobal = [];
  let deferredActivitiesGlobal = [];
  let currentOnConfirmCallback = null;
  let currentOnDeferCallback = null;

  const TIME_BLOCK_KEYWORDS = ["hour study block", "hour practice block", "time block", "study block", "practice block"];
  function isTimeBlock(text) {
    return TIME_BLOCK_KEYWORDS.some((kw) => text.toLowerCase().includes(kw));
  }

  function todayString() {
    return new Date().toISOString().split("T")[0];
  }

  // --- Confirm Modal ---
  function showModal(message, onConfirm, event, { confirmLabel = "Mark Done", onDefer = null } = {}) {
    modalMessage.textContent = message;
    currentOnConfirmCallback = onConfirm;
    currentOnDeferCallback = onDefer;
    modalConfirmBtn.textContent = confirmLabel;
    modalDeferBtn.classList.toggle("hidden", !onDefer);

    if (event?.target) {
      const rect = event.target.getBoundingClientRect();
      confirmModalContent.style.top = `${Math.min(rect.bottom + 10, window.innerHeight - 230)}px`;
      confirmModalContent.style.left = `${Math.max(20, Math.min(rect.left, window.innerWidth - 320))}px`;
      confirmModalContent.style.transform = "";
    } else {
      confirmModalContent.style.top = "50%";
      confirmModalContent.style.left = "50%";
      confirmModalContent.style.transform = "translate(-50%, -50%)";
    }
    confirmModal.classList.remove("hidden");
  }

  function hideConfirmationModal() {
    confirmModal.classList.add("hidden");
    currentOnConfirmCallback = null;
    currentOnDeferCallback = null;
    confirmModalContent.style.transform = "";
  }

  modalConfirmBtn.addEventListener("click", () => {
    if (currentOnConfirmCallback) currentOnConfirmCallback();
    hideConfirmationModal();
  });
  modalDeferBtn.addEventListener("click", () => {
    if (currentOnDeferCallback) currentOnDeferCallback();
    hideConfirmationModal();
  });
  modalCancelBtn.addEventListener("click", hideConfirmationModal);

  // --- TABLE STAKES Modal ---
  function showTableStakesModal() {
    if (!tsListEl) return;
    const isMarked = currentBoardMarkedCells()?.[12] || false;

    tsListEl.innerHTML = "";
    tableStakesGlobal.forEach((item, i) => {
      const checked = tableStakesCheckedGlobal[i] || false;
      const li = document.createElement("li");
      li.className = "flex items-center gap-3";
      li.innerHTML = `
        <input type="checkbox" id="ts-item-${i}" ${checked ? "checked" : ""}
          class="w-5 h-5 rounded text-indigo-600 cursor-pointer" />
        <label for="ts-item-${i}" class="text-gray-700 cursor-pointer select-none">${item}</label>
      `;
      li.querySelector("input").addEventListener("change", async (e) => {
        tableStakesCheckedGlobal[i] = e.target.checked;
        try {
          await fetch("/mark-table-stakes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ index: i, isChecked: e.target.checked }),
          });
        } catch (_) {}
      });
      tsListEl.appendChild(li);
    });

    tsMarkBtn.textContent = isMarked ? "Unmark TABLE STAKES" : "Mark TABLE STAKES Done";
    tsMarkBtn.className = isMarked
      ? "flex-1 bg-gray-400 hover:bg-gray-500 text-white font-semibold py-2 rounded-lg transition-colors duration-150"
      : "flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg transition-colors duration-150";

    tsMarkBtn.onclick = async () => {
      await toggleCell(12);
      tsModal.classList.add("hidden");
    };

    tsModal.classList.remove("hidden");
  }

  tsCloseBtn.addEventListener("click", () => tsModal.classList.add("hidden"));
  tsModal.addEventListener("click", (e) => { if (e.target === tsModal) tsModal.classList.add("hidden"); });

  // --- New Day Modal ---
  function showNewDaySummaryModal(boardState) {
    const { boardDate, boardActivities, markedCells, isBingoAchieved, tableStakesChecked } = boardState;
    const tsTotal = tableStakesGlobal.length || tableStakesChecked?.length || 3;

    const dateLabel = boardDate
      ? new Date(boardDate + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", month: "long", day: "numeric" })
      : "Yesterday";
    newDaySubtitle.textContent = `Here's how ${dateLabel} went.`;

    const markedCount = (markedCells || []).filter((m, i) => m && i !== 12).length;
    const tsChecked = (tableStakesChecked || []).filter(Boolean).length;

    newDayStats.innerHTML = `
      <div class="bg-green-50 rounded-lg p-3">
        <div class="text-2xl font-bold text-green-600">${markedCount}</div>
        <div class="text-xs text-gray-500 mt-1">Activities<br>Done</div>
      </div>
      <div class="bg-indigo-50 rounded-lg p-3">
        <div class="text-2xl font-bold text-indigo-600">${tsChecked}/${tsTotal}</div>
        <div class="text-xs text-gray-500 mt-1">Table Stakes<br>Checked</div>
      </div>
      <div class="bg-${isBingoAchieved ? "yellow" : "gray"}-50 rounded-lg p-3">
        <div class="text-2xl font-bold text-${isBingoAchieved ? "yellow-500" : "gray-400"}">${isBingoAchieved ? "🎉" : "—"}</div>
        <div class="text-xs text-gray-500 mt-1">${isBingoAchieved ? "BINGO!" : "No Bingo"}</div>
      </div>
    `;

    previousBoardMini.innerHTML = "";
    (boardActivities || []).forEach((text, i) => {
      const isMarked = markedCells?.[i] || false;
      const isTS = text === "TABLE STAKES";
      const cell = document.createElement("div");
      let bg = "bg-gray-200";
      if (isTS) bg = isMarked ? "bg-indigo-500" : "bg-indigo-200";
      else if (isMarked) bg = "bg-green-400";
      cell.className = `${bg} rounded aspect-square flex items-center justify-center overflow-hidden cursor-default`;
      cell.title = text;
      if (isTS) cell.innerHTML = `<span class="text-white text-[7px] font-bold leading-tight text-center">TS</span>`;
      else if (isMarked) cell.innerHTML = `<span class="text-white text-[10px]">✓</span>`;
      previousBoardMini.appendChild(cell);
    });

    newDayModal.classList.remove("hidden");
  }

  newDayDismissBtn.addEventListener("click", () => {
    newDayModal.classList.add("hidden");
    clearBoardDisplay("New day! Generate a board to get started.");
    if (saveStatusEl) saveStatusEl.textContent = "";
  });

  newDayGenerateBtn.addEventListener("click", async () => {
    newDayModal.classList.add("hidden");
    await generateNewBoard();
  });

  // --- Capacity Modal ---
  function showCapacityWarningModal(data) {
    capacityMessage.textContent = `You need ${data.deficit} more activity slot${data.deficit !== 1 ? "s" : ""} to fill the board (have ${data.totalSlots}, need ${data.needed}).`;
    capacitySuggestions.innerHTML = (data.suggestions || []).map((s) => `<li>${s}</li>`).join("");
    capacityModal.classList.remove("hidden");
  }

  capacityManageBtn.addEventListener("click", () => {
    capacityModal.classList.add("hidden");
    loadActivitiesModal();
    activitiesModal.classList.remove("hidden");
  });
  capacityCloseBtn.addEventListener("click", () => capacityModal.classList.add("hidden"));

  // --- Activities Modal ---
  repeatableCheckbox.addEventListener("change", () => {
    maxPerDayRow.classList.toggle("hidden", !repeatableCheckbox.checked);
  });

  manageActivitiesBtn.addEventListener("click", () => {
    loadActivitiesModal();
    activitiesModal.classList.remove("hidden");
  });

  activitiesCloseBtn.addEventListener("click", () => activitiesModal.classList.add("hidden"));
  activitiesModal.addEventListener("click", (e) => {
    if (e.target === activitiesModal) activitiesModal.classList.add("hidden");
  });

  addActivityBtn.addEventListener("click", async () => {
    const text = newActivityInput.value.trim();
    if (!text) return;
    const repeatable = repeatableCheckbox.checked;
    const maxPerDay = repeatable ? maxPerDaySelect.value : undefined;
    try {
      const res = await fetch("/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, repeatable, maxPerDay }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      newActivityInput.value = "";
      repeatableCheckbox.checked = false;
      maxPerDayRow.classList.add("hidden");
      maxPerDaySelect.value = "Dynamic";
      loadActivitiesModal();
    } catch (e) {
      alert(`Failed to add: ${e.message}`);
    }
  });

  newActivityInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addActivityBtn.click(); });

  async function loadActivitiesModal() {
    activitiesListEl.innerHTML = '<p class="text-gray-400 text-sm">Loading...</p>';
    try {
      const res = await fetch("/activities");
      const data = await res.json();
      renderActivitiesList(data);
    } catch {
      activitiesListEl.innerHTML = '<p class="text-red-500 text-sm">Failed to load activities.</p>';
    }
  }

  function renderActivitiesList(data) {
    const activities = data.activities || [];
    const repeatables = data.repeatable_activities || [];

    if (activities.length === 0 && repeatables.length === 0) {
      activitiesListEl.innerHTML = '<p class="text-gray-400 text-sm italic">No activities yet. Add one above!</p>';
      return;
    }

    activitiesListEl.innerHTML = "";

    activities.forEach((text) => {
      activitiesListEl.appendChild(buildActivityRow(text, false, null));
    });

    repeatables.forEach((r) => {
      activitiesListEl.appendChild(buildActivityRow(r.text, true, r.maxPerDay));
    });
  }

  function buildActivityRow(text, isRepeatable, maxPerDay) {
    const div = document.createElement("div");
    div.className = "flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-200";

    const safeText = text.replace(/"/g, "&quot;");

    let maxHtml = "";
    if (isRepeatable) {
      const cur = maxPerDay === "Dynamic" || maxPerDay === undefined ? "Dynamic" : String(maxPerDay);
      const opts = [
        ["0", "0 — Excluded"],
        ["1", "1/day"],
        ["2", "2/day"],
        ["3", "3/day"],
        ["Dynamic", "Dynamic"],
      ]
        .map(([v, l]) => `<option value="${v}"${v === cur ? " selected" : ""}>${l}</option>`)
        .join("");
      maxHtml = `<select class="max-per-day-select text-xs border border-indigo-200 rounded px-1 py-0.5 bg-indigo-50 text-indigo-700 cursor-pointer" data-text="${safeText}">${opts}</select>`;
    }

    div.innerHTML = `
      <span class="text-sm text-gray-700 flex-1 min-w-0 truncate" title="${safeText}">${text}${isRepeatable ? ' <span class="text-xs text-indigo-400 font-medium">↻</span>' : ""}</span>
      ${maxHtml}
      <button class="done-forever-btn flex-shrink-0 text-xs bg-red-100 hover:bg-red-200 text-red-700 font-medium px-2 py-1 rounded-md transition-colors duration-150 whitespace-nowrap" data-text="${safeText}">
        Done forever
      </button>
    `;

    if (isRepeatable) {
      div.querySelector(".max-per-day-select").addEventListener("change", async (e) => {
        try {
          const res = await fetch("/activities", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: e.target.dataset.text, maxPerDay: e.target.value }),
          });
          if (!res.ok) throw new Error((await res.json()).error);
        } catch (err) {
          alert(`Failed to update: ${err.message}`);
          loadActivitiesModal();
        }
      });
    }

    div.querySelector(".done-forever-btn").addEventListener("click", async (e) => {
      const actText = e.target.dataset.text;
      if (!confirm(`Remove "${actText}" permanently?`)) return;
      try {
        const res = await fetch("/activities", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: actText }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        loadActivitiesModal();
      } catch (err) {
        alert(`Failed to remove: ${err.message}`);
      }
    });

    return div;
  }

  // --- Bingo Logic ---
  const WINNING_COMBINATIONS = [
    [0, 1, 2, 3, 4], [5, 6, 7, 8, 9], [10, 11, 12, 13, 14],
    [15, 16, 17, 18, 19], [20, 21, 22, 23, 24],
    [0, 5, 10, 15, 20], [1, 6, 11, 16, 21], [2, 7, 12, 17, 22],
    [3, 8, 13, 18, 23], [4, 9, 14, 19, 24],
    [0, 6, 12, 18, 24], [4, 8, 12, 16, 20],
  ];

  function getWinningLines(markedCells) {
    return WINNING_COMBINATIONS.filter((combo) => combo.every((i) => markedCells[i]));
  }

  function highlightWinningLines(lines) {
    const cells = bingoCardContainer.querySelectorAll(".bingo-cell");
    lines.forEach((line) => line.forEach((i) => cells[i]?.classList.add("bingo-line")));
  }

  function lockBoard() {
    bingoCardContainer.querySelectorAll(".bingo-cell button").forEach((b) => (b.disabled = true));
    newBoardBtn?.focus();
  }

  function applyBingoVisualsAndLock(markedCells) {
    const lines = getWinningLines(markedCells);
    if (lines.length > 0) {
      highlightWinningLines(lines);
      lockBoard();
      if (messageArea) messageArea.innerHTML = `<strong class="text-2xl text-yellow-400 animate-pulse">BINGO!</strong>`;
      if (saveStatusEl) saveStatusEl.textContent = "BINGO! Board Locked.";
      return true;
    }
    return false;
  }

  function currentBoardMarkedCells() {
    const cells = bingoCardContainer.querySelectorAll(".bingo-cell");
    if (!cells.length) return null;
    return Array.from(cells).map((c) => c.classList.contains("marked"));
  }

  function clearBoardDisplay(msg = 'Click "Generate New Board" to start.') {
    bingoCardContainer.innerHTML = `<div class="col-span-5 text-center p-10 text-gray-500">${msg}</div>`;
    if (messageArea) messageArea.textContent = "";
    isBingoAchievedGlobal = false;
  }

  // --- Defer / Undefer ---
  async function deferActivity(activityText) {
    try {
      const res = await fetch("/defer-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityText, deferred: true }),
      });
      if (!res.ok) throw new Error("Failed to defer");
      const data = await res.json();
      deferredActivitiesGlobal = data.deferredActivities || [];
      await refreshBoard();
      if (saveStatusEl) {
        saveStatusEl.textContent = "Activity deferred for today.";
        setTimeout(() => { saveStatusEl.textContent = "Game state is saved automatically."; }, 2000);
      }
    } catch (e) {
      console.error(e);
      if (saveStatusEl) saveStatusEl.textContent = "Failed to defer activity.";
    }
  }

  async function undeferActivity(activityText) {
    try {
      const res = await fetch("/defer-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityText, deferred: false }),
      });
      if (!res.ok) throw new Error("Failed to un-defer");
      const data = await res.json();
      deferredActivitiesGlobal = data.deferredActivities || [];
      await refreshBoard();
    } catch (e) {
      console.error(e);
    }
  }

  async function refreshBoard() {
    const res = await fetch("/get-current-board");
    const boardState = await res.json();
    if (boardState?.boardActivities) {
      isBingoAchievedGlobal = boardState.isBingoAchieved || false;
      tableStakesGlobal = boardState.tableStakes || [];
      tableStakesCheckedGlobal = boardState.tableStakesChecked || [];
      deferredActivitiesGlobal = boardState.deferredActivities || [];
      renderBoard(boardState);
      if (isBingoAchievedGlobal) applyBingoVisualsAndLock(boardState.markedCells);
    }
  }

  // --- Cell Marking ---
  function setCellMarkedStyle(cell, button, isMarked) {
    cell.classList.toggle("marked", isMarked);
    button.classList.toggle("text-white", isMarked);
    button.classList.toggle("text-gray-700", !isMarked);
    button.classList.toggle("hover:bg-blue-100", !isMarked);
  }

  async function toggleCell(index) {
    const cells = bingoCardContainer.querySelectorAll(".bingo-cell");
    const cell = cells[index];
    if (!cell) return;
    const button = cell.querySelector("button");
    const currentlyMarked = cell.classList.contains("marked");
    const newMarked = !currentlyMarked;

    setCellMarkedStyle(cell, button, newMarked);
    if (saveStatusEl) saveStatusEl.textContent = "Saving...";

    const tempMarked = Array.from(cells).map((c) => c.classList.contains("marked"));
    const optimisticBingo = newMarked && getWinningLines(tempMarked).length > 0;

    try {
      const res = await fetch("/mark-cell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index, isMarked: newMarked, isBingoAchievedByThisMove: optimisticBingo }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `Server error ${res.status}`);

      isBingoAchievedGlobal = data.isBingoAchieved;
      if (isBingoAchievedGlobal) {
        applyBingoVisualsAndLock(data.markedCells);
      } else {
        if (saveStatusEl) saveStatusEl.textContent = "Saved!";
        setTimeout(() => { if (saveStatusEl && !isBingoAchievedGlobal) saveStatusEl.textContent = "Game state is saved automatically."; }, 1500);
      }
    } catch (err) {
      console.error("Failed to update cell:", err);
      if (messageArea) messageArea.textContent = `Save error: ${err.message}. Reverting.`;
      setCellMarkedStyle(cell, button, currentlyMarked);
    }
  }

  // --- Board Rendering ---
  function renderBoard(boardState) {
    const { boardActivities, markedCells, deferredActivities } = boardState;
    if (!boardActivities) { clearBoardDisplay("Cannot render board: no data."); return; }

    tableStakesGlobal = boardState.tableStakes || [];
    tableStakesCheckedGlobal = boardState.tableStakesChecked || [];
    deferredActivitiesGlobal = deferredActivities || [];
    const deferred = new Set(deferredActivitiesGlobal);

    bingoCardContainer.innerHTML = "";
    boardActivities.forEach((activityText, index) => {
      const cell = document.createElement("div");
      cell.classList.add("bingo-cell", "bg-slate-50", "rounded-md", "shadow", "transition-colors", "duration-150");

      const button = document.createElement("button");
      button.classList.add("text-xs", "sm:text-sm", "font-medium", "focus:outline-none", "focus:ring-2", "focus:ring-blue-500", "focus:ring-opacity-50", "rounded-md");

      const isDeferred = deferred.has(activityText);

      if (markedCells?.[index]) {
        cell.classList.add("marked");
        button.classList.add("text-white");
      } else if (isDeferred) {
        cell.classList.add("deferred");
      } else {
        button.classList.add("text-gray-700", "hover:bg-blue-100");
      }

      if (isBingoAchievedGlobal) button.disabled = true;

      if (activityText === "TABLE STAKES") {
        cell.classList.add("table-stakes-cell");
        button.textContent = activityText;
        button.addEventListener("click", () => { if (!isBingoAchievedGlobal) showTableStakesModal(); });
      } else if (isDeferred) {
        button.innerHTML = `<span class="leading-tight">${activityText}</span><span class="text-[9px] text-amber-400 mt-0.5">↷ tap to restore</span>`;
        button.title = "Tap to un-defer this activity";
        button.addEventListener("click", (event) => {
          if (isBingoAchievedGlobal) return;
          showModal(`Restore "${activityText}" for today?`, () => undeferActivity(activityText), event, { confirmLabel: "Restore" });
        });
      } else {
        if (isTimeBlock(activityText)) cell.classList.add("time-block-cell");
        button.textContent = activityText;
        const onDefer = isTimeBlock(activityText) ? null : () => deferActivity(activityText);
        button.addEventListener("click", (event) => {
          if (isBingoAchievedGlobal) return;
          if (cell.classList.contains("marked")) {
            showModal(`Unmark "${activityText}"?`, () => toggleCell(index), event, { confirmLabel: "Unmark" });
          } else {
            showModal(`Mark "${activityText}" done?`, () => toggleCell(index), event, { onDefer });
          }
        });
      }

      cell.appendChild(button);
      bingoCardContainer.appendChild(cell);
    });
  }

  // --- Load / Generate ---
  async function loadInitialBoard() {
    if (messageArea) messageArea.textContent = "";
    bingoCardContainer.innerHTML = '<div class="col-span-5 text-center p-10">Loading saved board...</div>';
    if (saveStatusEl) saveStatusEl.textContent = "Loading...";

    try {
      const res = await fetch("/get-current-board");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const boardState = await res.json();

      tableStakesGlobal = boardState.tableStakes || [];

      if (boardState?.boardActivities) {
        isBingoAchievedGlobal = boardState.isBingoAchieved || false;
        deferredActivitiesGlobal = boardState.deferredActivities || [];

        // Detect a new day
        const today = todayString();
        if (boardState.boardDate && boardState.boardDate !== today) {
          showNewDaySummaryModal(boardState);
          clearBoardDisplay("It's a new day! Check the summary above, then generate a fresh board.");
          if (saveStatusEl) saveStatusEl.textContent = "";
          return;
        }

        renderBoard(boardState);
        if (isBingoAchievedGlobal) {
          applyBingoVisualsAndLock(boardState.markedCells);
        } else {
          if (messageArea) messageArea.textContent = "Loaded saved board!";
          if (saveStatusEl) saveStatusEl.textContent = "Game loaded.";
          setTimeout(() => {
            if (!isBingoAchievedGlobal) {
              if (messageArea) messageArea.textContent = "";
              if (saveStatusEl) saveStatusEl.textContent = "Game state is saved automatically.";
            }
          }, 2500);
        }
      } else {
        clearBoardDisplay();
        if (messageArea) messageArea.textContent = "No saved board. Generate a new one!";
        if (saveStatusEl) saveStatusEl.textContent = "No game loaded.";
      }
    } catch (error) {
      console.error("Error loading board:", error);
      clearBoardDisplay(`Failed to load: ${error.message}`);
    }
  }

  async function generateNewBoard() {
    if (messageArea) messageArea.textContent = "";
    bingoCardContainer.innerHTML = '<div class="col-span-5 text-center p-10">Generating your board...</div>';
    if (saveStatusEl) saveStatusEl.textContent = "Generating...";
    isBingoAchievedGlobal = false;
    try {
      const res = await fetch("/generate-bingo");

      if (res.status === 422) {
        const data = await res.json();
        clearBoardDisplay(data.error);
        showCapacityWarningModal(data);
        if (saveStatusEl) saveStatusEl.textContent = "";
        return;
      }

      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);

      const newBoardState = await res.json();
      isBingoAchievedGlobal = newBoardState.isBingoAchieved || false;
      deferredActivitiesGlobal = newBoardState.deferredActivities || [];
      tableStakesGlobal = newBoardState.tableStakes || [];
      tableStakesCheckedGlobal = newBoardState.tableStakesChecked || [];
      renderBoard(newBoardState);
      if (messageArea) messageArea.textContent = "New board generated!";
      if (saveStatusEl) saveStatusEl.textContent = "New board saved!";
      setTimeout(() => {
        if (messageArea) messageArea.textContent = "";
        if (saveStatusEl) saveStatusEl.textContent = "Game state is saved automatically.";
      }, 2500);
    } catch (error) {
      console.error("Error generating board:", error);
      clearBoardDisplay(`Failed to generate: ${error.message}`);
    }
  }

  newBoardBtn?.addEventListener("click", generateNewBoard);
  loadInitialBoard();
});
