document.addEventListener("DOMContentLoaded", () => {
  const bingoCardContainer = document.getElementById("bingo-card");
  const newBoardBtn = document.getElementById("new-board-btn");
  const messageArea = document.getElementById("message-area");
  const saveStatusEl = document.getElementById("save-status");
  const scoreDisplayEl = document.getElementById("score-display");

  // Confirm modal
  const confirmModal = document.getElementById("confirmation-modal");
  const confirmModalContent = document.getElementById("confirm-modal-content");
  const modalMessage = document.getElementById("modal-message");
  const modalConfirmBtn = document.getElementById("modal-confirm-btn");
  const modalInProgressBtn = document.getElementById("modal-in-progress-btn");
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
  let repeatableCellsGlobal = [];
  let mustDoCellsGlobal = [];
  let inProgressCellsGlobal = [];
  let obsidianVaultName = null;
  let currentOnConfirmCallback = null;
  let currentOnDeferCallback = null;
  let currentOnInProgressCallback = null;

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const TIME_BLOCK_KEYWORDS = [
    "hour study block",
    "hour practice block",
    "time block",
    "study block",
    "practice block",
  ];
  function isTimeBlock(text) {
    return TIME_BLOCK_KEYWORDS.some((kw) => text.toLowerCase().includes(kw));
  }

  function todayString() {
    return new Date().toISOString().split("T")[0];
  }

  // --- Confirm Modal ---
  function showModal(
    message,
    onConfirm,
    event,
    { confirmLabel = "Mark Done", onDefer = null, onInProgress = null, inProgressLabel = "In Progress" } = {},
  ) {
    modalMessage.textContent = message;
    currentOnConfirmCallback = onConfirm;
    currentOnDeferCallback = onDefer;
    currentOnInProgressCallback = onInProgress;
    modalConfirmBtn.textContent = confirmLabel;
    modalInProgressBtn.textContent = inProgressLabel;
    modalInProgressBtn.classList.toggle("hidden", !onInProgress);
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
    currentOnInProgressCallback = null;
    confirmModalContent.style.transform = "";
  }

  modalConfirmBtn.addEventListener("click", () => {
    if (currentOnConfirmCallback) currentOnConfirmCallback();
    hideConfirmationModal();
  });
  modalInProgressBtn.addEventListener("click", () => {
    if (currentOnInProgressCallback) currentOnInProgressCallback();
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
        <label for="ts-item-${i}" class="text-slate-200 cursor-pointer select-none">${item}</label>
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

    tsMarkBtn.textContent = isMarked
      ? "Unmark TABLE STAKES"
      : "Mark TABLE STAKES Done";
    tsMarkBtn.className = isMarked
      ? "flex-1 bg-slate-600 hover:bg-slate-500 text-white font-semibold py-2 rounded-lg transition-colors duration-150"
      : "flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 rounded-lg transition-colors duration-150";

    tsMarkBtn.onclick = async () => {
      await toggleCell(12);
      tsModal.classList.add("hidden");
    };

    tsModal.classList.remove("hidden");
  }

  tsCloseBtn.addEventListener("click", () => tsModal.classList.add("hidden"));
  tsModal.addEventListener("click", (e) => {
    if (e.target === tsModal) tsModal.classList.add("hidden");
  });

  // --- New Day Modal ---
  function showNewDaySummaryModal(boardState) {
    const {
      boardDate,
      boardActivities,
      markedCells,
      isBingoAchieved,
      tableStakesChecked,
    } = boardState;
    const tsTotal = tableStakesGlobal.length || tableStakesChecked?.length || 3;

    const dateLabel = boardDate
      ? new Date(boardDate + "T12:00:00").toLocaleDateString("en-GB", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      : "Yesterday";
    newDaySubtitle.textContent = `Here's how ${dateLabel} went.`;

    const markedCount = (markedCells || []).filter(
      (m, i) => m && i !== 12,
    ).length;
    const tsChecked = (tableStakesChecked || []).filter(Boolean).length;

    newDayStats.innerHTML = `
      <div class="bg-slate-700 rounded-lg p-3">
        <div class="text-2xl font-bold text-green-400">${markedCount}</div>
        <div class="text-xs text-slate-400 mt-1">Activities<br>Done</div>
      </div>
      <div class="bg-slate-700 rounded-lg p-3">
        <div class="text-2xl font-bold text-indigo-400">${tsChecked}/${tsTotal}</div>
        <div class="text-xs text-slate-400 mt-1">Table Stakes<br>Checked</div>
      </div>
      <div class="bg-slate-700 rounded-lg p-3">
        <div class="text-2xl font-bold ${isBingoAchieved ? "text-amber-400" : "text-slate-500"}">${isBingoAchieved ? "🎉" : "—"}</div>
        <div class="text-xs text-slate-400 mt-1">${isBingoAchieved ? "BINGO!" : "No Bingo"}</div>
      </div>
    `;

    previousBoardMini.innerHTML = "";
    (boardActivities || []).forEach((text, i) => {
      const isMarked = markedCells?.[i] || false;
      const isTS = text === "TABLE STAKES";
      const cell = document.createElement("div");
      let bg = "bg-slate-700";
      if (isTS) bg = isMarked ? "bg-indigo-500" : "bg-indigo-900";
      else if (isMarked) bg = "bg-green-500";
      cell.className = `${bg} rounded aspect-square flex items-center justify-center overflow-hidden cursor-default`;
      cell.title = text;
      if (isTS)
        cell.innerHTML = `<span class="text-white text-[7px] font-bold leading-tight text-center">TS</span>`;
      else if (isMarked)
        cell.innerHTML = `<span class="text-white text-[10px]">✓</span>`;
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
    capacitySuggestions.innerHTML = (data.suggestions || [])
      .map((s) => `<li>${s}</li>`)
      .join("");
    capacityModal.classList.remove("hidden");
  }

  capacityManageBtn.addEventListener("click", () => {
    capacityModal.classList.add("hidden");
    loadActivitiesModal();
    activitiesModal.classList.remove("hidden");
  });
  capacityCloseBtn.addEventListener("click", () =>
    capacityModal.classList.add("hidden"),
  );

  // --- Activities Modal ---
  repeatableCheckbox.addEventListener("change", () => {
    maxPerDayRow.classList.toggle("hidden", !repeatableCheckbox.checked);
  });

  manageActivitiesBtn.addEventListener("click", () => {
    loadActivitiesModal();
    activitiesModal.classList.remove("hidden");
  });

  activitiesCloseBtn.addEventListener("click", () =>
    activitiesModal.classList.add("hidden"),
  );
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

  newActivityInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addActivityBtn.click();
  });

  async function loadActivitiesModal() {
    activitiesListEl.innerHTML =
      '<p class="text-slate-500 text-sm">Loading...</p>';
    try {
      const [activitiesRes, configRes] = await Promise.all([
        fetch("/activities"),
        fetch("/obsidian-config"),
      ]);
      const data = await activitiesRes.json();
      const config = await configRes.json();
      obsidianVaultName = config.vaultName || null;
      renderActivitiesList(data);
    } catch {
      activitiesListEl.innerHTML =
        '<p class="text-red-500 text-sm">Failed to load activities.</p>';
    }
  }

  function renderActivitiesList(data) {
    const activities = data.activities || [];
    const repeatables = data.repeatable_activities || [];
    const activityPages = data.activity_pages || {};

    if (activities.length === 0 && repeatables.length === 0) {
      activitiesListEl.innerHTML =
        '<p class="text-slate-500 text-sm italic">No activities yet. Add one above!</p>';
      return;
    }

    activitiesListEl.innerHTML = "";

    activities.forEach((text) => {
      activitiesListEl.appendChild(
        buildActivityRow(text, false, null, activityPages[text] || null),
      );
    });

    repeatables.forEach((r) => {
      activitiesListEl.appendChild(
        buildActivityRow(r.text, true, r.maxPerDay, r.obsidianPage || null),
      );
    });
  }

  function buildActivityRow(text, isRepeatable, maxPerDay, obsidianPage) {
    const container = document.createElement("div");
    container.className =
      "rounded-lg border " +
      (isRepeatable ? "border-indigo-800" : "border-slate-600");

    const row = document.createElement("div");
    row.className = "flex items-center gap-2 p-2";

    const label = document.createElement("span");
    label.className = "text-sm text-slate-200 flex-1 min-w-0 truncate";
    label.title = text;
    label.innerHTML = `${escHtml(text)}${isRepeatable ? ' <span class="text-xs text-indigo-400 font-medium">↻</span>' : ""}`;
    row.appendChild(label);

    if (isRepeatable) {
      const cur =
        maxPerDay === "Dynamic" || maxPerDay === undefined
          ? "Dynamic"
          : String(maxPerDay);
      const opts = [
        ["0", "0 — Excluded"],
        ["1", "1/day"],
        ["2", "2/day"],
        ["3", "3/day"],
        ["Dynamic", "Dynamic"],
      ]
        .map(
          ([v, l]) =>
            `<option value="${v}"${v === cur ? " selected" : ""}>${l}</option>`,
        )
        .join("");
      const sel = document.createElement("select");
      sel.className =
        "max-per-day-select text-xs border border-indigo-700 rounded px-1 py-0.5 bg-indigo-950 text-indigo-300 cursor-pointer";
      sel.dataset.text = text;
      sel.innerHTML = opts;
      sel.addEventListener("change", async (e) => {
        try {
          const r = await fetch("/activities", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: e.target.dataset.text,
              maxPerDay: e.target.value,
            }),
          });
          if (!r.ok) throw new Error((await r.json()).error);
        } catch (err) {
          alert(`Failed to update: ${err.message}`);
          loadActivitiesModal();
        }
      });
      row.appendChild(sel);
    }

    const noteBtn = document.createElement("button");
    noteBtn.className = `flex-shrink-0 text-sm transition-colors ${obsidianPage ? "text-amber-400 hover:text-amber-300" : "text-slate-600 hover:text-slate-400"}`;
    noteBtn.textContent = "📓";
    noteBtn.title = obsidianPage
      ? `Obsidian: ${obsidianPage}`
      : "Link to Obsidian note";
    row.appendChild(noteBtn);

    const doneBtn = document.createElement("button");
    doneBtn.className =
      "done-forever-btn flex-shrink-0 text-xs bg-red-950 hover:bg-red-900 text-red-400 font-medium px-2 py-1 rounded-md transition-colors duration-150 whitespace-nowrap";
    doneBtn.dataset.text = text;
    doneBtn.textContent = "Done forever";
    row.appendChild(doneBtn);

    container.appendChild(row);

    // Obsidian panel (hidden by default, toggled by 📓 button)
    const panel = document.createElement("div");
    panel.className = "hidden border-t border-slate-700 p-2 space-y-1.5";

    // Two picker buttons
    const pickerRow = document.createElement("div");
    pickerRow.className = "flex gap-1";

    const browseBtn = document.createElement("button");
    browseBtn.className =
      "flex-1 text-xs bg-amber-800 hover:bg-amber-700 text-amber-100 px-2 py-1.5 rounded flex items-center justify-center gap-1";
    browseBtn.innerHTML = `<span>📂</span><span>Link existing…</span>`;
    pickerRow.appendChild(browseBtn);

    const newNoteBtn = document.createElement("button");
    newNoteBtn.className =
      "flex-1 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1.5 rounded flex items-center justify-center gap-1";
    newNoteBtn.innerHTML = `<span>✏️</span><span>New note…</span>`;
    pickerRow.appendChild(newNoteBtn);

    panel.appendChild(pickerRow);

    if (obsidianPage) {
      const linkedRow = document.createElement("div");
      linkedRow.className = "flex items-center justify-between";
      const linkedLabel = document.createElement("span");
      linkedLabel.className = "text-[10px] text-slate-500";
      linkedLabel.textContent = `Linked: ${obsidianPage}`;
      linkedRow.appendChild(linkedLabel);
      if (obsidianVaultName) {
        const openLink = document.createElement("a");
        openLink.href = `obsidian://open?vault=${encodeURIComponent(obsidianVaultName)}&file=${encodeURIComponent(obsidianPage)}`;
        openLink.className = "text-[10px] text-amber-400 hover:text-amber-300";
        openLink.textContent = "↗ Open";
        linkedRow.appendChild(openLink);
      }
      panel.appendChild(linkedRow);
    }

    container.appendChild(panel);

    noteBtn.addEventListener("click", () => panel.classList.toggle("hidden"));

    async function saveLink(page) {
      const r = await fetch("/activities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, obsidianPage: page }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
    }

    browseBtn.addEventListener("click", () => pickAndHandle("open"));

    async function pickAndHandle(mode) {
      const btn = mode === "create" ? newNoteBtn : browseBtn;
      const originalHtml = btn.innerHTML;
      btn.innerHTML = `<span>⏳</span><span>Opening…</span>`;
      btn.disabled = true;
      try {
        console.log("in buildActivityRow");
        const r = await fetch(`/obsidian-note/pick?mode=${mode}&activity=${encodeURIComponent(text)}`);
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        if (data.cancelled) return;

        console.log(`data.path = ${data.path}`);

        const body = JSON.stringify({ activityText: text, page: data.path });
        console.log(body);

        if (mode === "create") {
          const cr = await fetch("/obsidian-note/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: body,
          });
          if (!cr.ok) {
            const err = await cr.json();
            alert(
              cr.status === 409
                ? `A note already exists at ${cr.statusText} — use "Link existing" instead.`
                : err.error,
            );
            return;
          }
        } else {
          await saveLink(data.path);
        }
        loadActivitiesModal();
      } catch (err) {
        alert(`Failed: ${err.message}`);
      } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = false;
      }
    }

    newNoteBtn.addEventListener("click", () => pickAndHandle("create"));

    doneBtn.addEventListener("click", async (e) => {
      const actText = e.target.dataset.text;
      if (!confirm(`Remove "${actText}" permanently?`)) return;
      try {
        const r = await fetch("/activities", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: actText }),
        });
        if (!r.ok) throw new Error((await r.json()).error);
        loadActivitiesModal();
      } catch (err) {
        alert(`Failed to remove: ${err.message}`);
      }
    });

    return container;
  }

  function updateScoreDisplay() {
    if (!scoreDisplayEl) return;
    const markedCells = currentBoardMarkedCells();
    if (!markedCells) {
      scoreDisplayEl.textContent = "";
      return;
    }

    let score = 0;
    let mustDoDone = 0;
    const mustDoTotal = (mustDoCellsGlobal || []).filter(Boolean).length;

    for (let i = 0; i < 25; i++) {
      if (!markedCells[i]) continue;
      if (mustDoCellsGlobal?.[i]) {
        score += 2;
        mustDoDone++;
      } else score += 1;
    }

    const allMustDosDone = mustDoTotal > 0 && mustDoDone === mustDoTotal;
    if (allMustDosDone) score += 5;

    const completedLines = WINNING_COMBINATIONS.filter((combo) =>
      combo.every((i) => markedCells[i]),
    ).length;
    score += completedLines * 5;

    let text = `Score: ${score}`;
    if (completedLines > 0)
      text += `  🎯 ${completedLines} line${completedLines > 1 ? "s" : ""} (+${completedLines * 5})`;
    if (mustDoTotal > 0) {
      text += allMustDosDone
        ? "  ★ All must-dos! (+5)"
        : `  ★ ${mustDoDone}/${mustDoTotal} must-dos`;
    }
    scoreDisplayEl.textContent = text;
  }

  async function toggleMustDo(index) {
    if (isBingoAchievedGlobal) return;
    if (!mustDoCellsGlobal) mustDoCellsGlobal = new Array(25).fill(false);
    const isMustDo = !mustDoCellsGlobal[index];
    mustDoCellsGlobal[index] = isMustDo;

    const cells = bingoCardContainer.querySelectorAll(".bingo-cell");
    const cell = cells[index];
    if (cell) {
      cell.classList.toggle("must-do-cell", isMustDo);
      const star = cell.querySelector(".must-do-star");
      if (star) {
        star.classList.toggle("active", isMustDo);
        star.title = isMustDo ? "Remove must-do flag" : "Flag as must do";
      }
    }
    updateScoreDisplay();

    try {
      const res = await fetch("/must-do", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index, isMustDo }),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch (e) {
      console.error("Failed to save must-do:", e);
      mustDoCellsGlobal[index] = !isMustDo;
      if (cell) {
        cell.classList.toggle("must-do-cell", !isMustDo);
        const star = cell.querySelector(".must-do-star");
        if (star) star.classList.toggle("active", !isMustDo);
      }
      updateScoreDisplay();
    }
  }

  async function toggleInProgress(index, isInProgress) {
    if (!inProgressCellsGlobal) inProgressCellsGlobal = new Array(25).fill(false);
    inProgressCellsGlobal[index] = isInProgress;
    const cell = bingoCardContainer.querySelectorAll(".bingo-cell")[index];
    if (cell) cell.classList.toggle("in-progress-cell", isInProgress);
    try {
      const res = await fetch("/in-progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index, isInProgress }),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch (e) {
      console.error("Failed to save in-progress:", e);
      inProgressCellsGlobal[index] = !isInProgress;
      if (cell) cell.classList.toggle("in-progress-cell", !isInProgress);
    }
  }

  // --- Bingo Logic ---
  const WINNING_COMBINATIONS = [
    [0, 1, 2, 3, 4],
    [5, 6, 7, 8, 9],
    [10, 11, 12, 13, 14],
    [15, 16, 17, 18, 19],
    [20, 21, 22, 23, 24],
    [0, 5, 10, 15, 20],
    [1, 6, 11, 16, 21],
    [2, 7, 12, 17, 22],
    [3, 8, 13, 18, 23],
    [4, 9, 14, 19, 24],
    [0, 6, 12, 18, 24],
    [4, 8, 12, 16, 20],
  ];

  function getWinningLines(markedCells) {
    return WINNING_COMBINATIONS.filter((combo) =>
      combo.every((i) => markedCells[i]),
    );
  }

  function highlightWinningLines(lines) {
    const cells = bingoCardContainer.querySelectorAll(".bingo-cell");
    lines.forEach((line) =>
      line.forEach((i) => cells[i]?.classList.add("bingo-line")),
    );
  }

  function lockBoard() {
    bingoCardContainer
      .querySelectorAll(".bingo-cell button")
      .forEach((b) => (b.disabled = true));
    newBoardBtn?.focus();
  }

  function applyBingoVisualsAndLock(markedCells) {
    const lines = getWinningLines(markedCells);
    if (lines.length > 0) {
      highlightWinningLines(lines);
      lockBoard();
      updateScoreDisplay();
      if (messageArea)
        messageArea.innerHTML = `<strong class="text-2xl text-yellow-400 animate-pulse">BINGO!</strong>`;
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
    bingoCardContainer.innerHTML = `<div class="col-span-5 text-center p-10 text-slate-500">${msg}</div>`;
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
        setTimeout(() => {
          saveStatusEl.textContent = "Game state is saved automatically.";
        }, 2000);
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
      if (isBingoAchievedGlobal)
        applyBingoVisualsAndLock(boardState.markedCells);
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
    updateScoreDisplay();
    if (saveStatusEl) saveStatusEl.textContent = "Saving...";

    const tempMarked = Array.from(cells).map((c) =>
      c.classList.contains("marked"),
    );
    const optimisticBingo = newMarked && getWinningLines(tempMarked).length > 0;

    try {
      const res = await fetch("/mark-cell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          index,
          isMarked: newMarked,
          isBingoAchievedByThisMove: optimisticBingo,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || `Server error ${res.status}`);

      isBingoAchievedGlobal = data.isBingoAchieved;
      if (newMarked && inProgressCellsGlobal[index]) toggleInProgress(index, false);
      if (isBingoAchievedGlobal) {
        applyBingoVisualsAndLock(data.markedCells);
      } else {
        if (saveStatusEl) saveStatusEl.textContent = "Saved!";
        setTimeout(() => {
          if (saveStatusEl && !isBingoAchievedGlobal)
            saveStatusEl.textContent = "Game state is saved automatically.";
        }, 1500);
      }
    } catch (err) {
      console.error("Failed to update cell:", err);
      if (messageArea)
        messageArea.textContent = `Save error: ${err.message}. Reverting.`;
      setCellMarkedStyle(cell, button, currentlyMarked);
      updateScoreDisplay();
    }
  }

  // --- Board Rendering ---
  function renderBoard(boardState) {
    const {
      boardActivities,
      markedCells,
      deferredActivities,
      repeatableCells,
      mustDoCells,
    } = boardState;
    if (!boardActivities) {
      clearBoardDisplay("Cannot render board: no data.");
      return;
    }
    const notes = boardState.noteMap || {};

    tableStakesGlobal = boardState.tableStakes || [];
    tableStakesCheckedGlobal = boardState.tableStakesChecked || [];
    deferredActivitiesGlobal = deferredActivities || [];
    repeatableCellsGlobal = repeatableCells || new Array(25).fill(false);
    mustDoCellsGlobal = mustDoCells || new Array(25).fill(false);
    inProgressCellsGlobal = boardState.inProgressCells || new Array(25).fill(false);
    const deferred = new Set(deferredActivitiesGlobal);

    bingoCardContainer.innerHTML = "";
    boardActivities.forEach((activityText, index) => {
      const cell = document.createElement("div");
      cell.classList.add(
        "bingo-cell",
        "rounded-md",
        "transition-colors",
        "duration-150",
      );

      const button = document.createElement("button");
      button.classList.add(
        "text-xs",
        "sm:text-sm",
        "font-medium",
        "focus:outline-none",
        "focus:ring-2",
        "focus:ring-blue-500",
        "focus:ring-opacity-50",
        "rounded-md",
      );

      const isDeferred = deferred.has(activityText);
      if (repeatableCellsGlobal[index]) cell.classList.add("repeatable-cell");
      if (mustDoCellsGlobal[index]) cell.classList.add("must-do-cell");
      if (inProgressCellsGlobal[index]) cell.classList.add("in-progress-cell");

      if (markedCells?.[index]) {
        cell.classList.add("marked");
        button.classList.add("text-white");
      } else if (isDeferred) {
        cell.classList.add("deferred");
      } else {
        button.classList.add("text-slate-200", "hover:bg-slate-700");
      }

      if (isBingoAchievedGlobal) button.disabled = true;

      if (activityText === "TABLE STAKES") {
        cell.classList.add("table-stakes-cell");
        button.textContent = activityText;
        button.addEventListener("click", () => {
          if (!isBingoAchievedGlobal) showTableStakesModal();
        });
      } else if (isDeferred) {
        button.innerHTML = `<span class="leading-tight">${activityText}</span><span class="text-[9px] text-amber-400 mt-0.5">↷ tap to restore</span>`;
        button.title = "Tap to un-defer this activity";
        button.addEventListener("click", (event) => {
          if (isBingoAchievedGlobal) return;
          showModal(
            `Restore "${activityText}" for today?`,
            () => undeferActivity(activityText),
            event,
            { confirmLabel: "Restore" },
          );
        });
      } else {
        if (isTimeBlock(activityText)) cell.classList.add("time-block-cell");
        const note = notes[activityText];
        if (note) {
          const nextHtml = note.nextStep
            ? `<span class="note-next-step">↳ ${escHtml(note.nextStep)}</span>`
            : "";
          const progHtml = note.hasProgress
            ? `<span class="note-progress">${note.checkedCount}/${note.totalCount}</span>`
            : "";
          button.innerHTML = `<span class="note-headline leading-tight">${escHtml(activityText)}</span>${nextHtml}${progHtml}`;
        } else {
          button.textContent = activityText;
        }
        const onDefer = isTimeBlock(activityText)
          ? null
          : () => deferActivity(activityText);
        button.addEventListener("click", (event) => {
          if (isBingoAchievedGlobal) return;
          if (cell.classList.contains("marked")) {
            showModal(`Unmark "${activityText}"?`, () => toggleCell(index), event, { confirmLabel: "Unmark" });
          } else if (cell.classList.contains("in-progress-cell")) {
            showModal(
              `"${activityText}" is in progress.`,
              () => toggleCell(index),
              event,
              { confirmLabel: "Mark Done", onDefer, onInProgress: () => toggleInProgress(index, false), inProgressLabel: "Clear Progress" }
            );
          } else {
            showModal(
              `Mark "${activityText}" done?`,
              () => toggleCell(index),
              event,
              { onDefer, onInProgress: () => toggleInProgress(index, true) }
            );
          }
        });
      }

      cell.appendChild(button);

      if (activityText !== "TABLE STAKES" && !isDeferred) {
        const note = notes[activityText];
        if (note) {
          const noteLink = document.createElement("a");
          noteLink.href = note.obsidianUri;
          noteLink.className = "obsidian-link";
          noteLink.textContent = "📓";
          noteLink.title = "Open in Obsidian";
          noteLink.addEventListener("click", (e) => e.stopPropagation());
          cell.appendChild(noteLink);
        }

        const isMustDo = mustDoCellsGlobal[index];
        const starBtn = document.createElement("button");
        starBtn.className = `must-do-star${isMustDo ? " active" : ""}`;
        starBtn.textContent = "★";
        starBtn.title = isMustDo ? "Remove must-do flag" : "Flag as must do";
        starBtn.disabled = isBingoAchievedGlobal;
        starBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleMustDo(index);
        });
        cell.appendChild(starBtn);
      }

      bingoCardContainer.appendChild(cell);
    });

    updateScoreDisplay();
  }

  // --- Load / Generate ---
  async function loadInitialBoard() {
    if (messageArea) messageArea.textContent = "";
    bingoCardContainer.innerHTML =
      '<div class="col-span-5 text-center p-10 text-slate-500">Loading saved board...</div>';
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
          clearBoardDisplay(
            "It's a new day! Check the summary above, then generate a fresh board.",
          );
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
              if (saveStatusEl)
                saveStatusEl.textContent = "Game state is saved automatically.";
            }
          }, 2500);
        }
      } else {
        clearBoardDisplay();
        if (messageArea)
          messageArea.textContent = "No saved board. Generate a new one!";
        if (saveStatusEl) saveStatusEl.textContent = "No game loaded.";
      }
    } catch (error) {
      console.error("Error loading board:", error);
      clearBoardDisplay(`Failed to load: ${error.message}`);
    }
  }

  async function generateNewBoard() {
    if (messageArea) messageArea.textContent = "";
    bingoCardContainer.innerHTML =
      '<div class="col-span-5 text-center p-10 text-slate-500">Generating your board...</div>';
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

      if (!res.ok)
        throw new Error((await res.json()).error || `HTTP ${res.status}`);

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
        if (saveStatusEl)
          saveStatusEl.textContent = "Game state is saved automatically.";
      }, 2500);
    } catch (error) {
      console.error("Error generating board:", error);
      clearBoardDisplay(`Failed to generate: ${error.message}`);
    }
  }

  newBoardBtn?.addEventListener("click", generateNewBoard);
  loadInitialBoard();
});
