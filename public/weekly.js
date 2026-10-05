document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("achievement-grid");
  const weekRangeEl = document.getElementById("week-range");
  const goalDisplayEl = document.getElementById("goal-display");
  const progressLabel = document.getElementById("progress-label");
  const progressPct = document.getElementById("progress-pct");
  const progressFill = document.getElementById("progress-fill");
  const weekCompleteBanner = document.getElementById("week-complete-banner");

  const ORDERED_IDS = [
    "readBook", "listenedBook", "studyGoal", "businessGoal",
    "won6of7", "tableStakes7of7", "mustDosCleared", "weeklyGoal",
  ];

  function formatWeekRange(weekStart) {
    const start = new Date(weekStart + "T12:00:00Z");
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const opts = { day: "numeric", month: "long", timeZone: "UTC" };
    return `${start.toLocaleDateString("en-GB", opts)} – ${end.toLocaleDateString("en-GB", opts)}`;
  }

  function formatDate(isoStr) {
    if (!isoStr) return "";
    return new Date(isoStr).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  function buildCard(ach, progress) {
    const { id, label, emoji, auto, hint, completed, evidence, completedAt } = ach;
    const card = document.createElement("div");
    card.className = "card rounded-xl p-4 flex flex-col items-center text-center relative";

    if (completed) {
      card.classList.add("unlocked");

      let progressNote = "";
      if (id === "won6of7") progressNote = `<p class="text-yellow-900 text-xs mt-1 opacity-80">${progress.bingoWins}/7 days</p>`;
      if (id === "tableStakes7of7") progressNote = `<p class="text-yellow-900 text-xs mt-1 opacity-80">${progress.tsDays}/7 days</p>`;

      card.innerHTML = `
        <div class="text-4xl mb-2">${emoji}</div>
        <p class="font-bold text-yellow-900 text-sm leading-tight">${label}</p>
        ${progressNote}
        <div class="mt-auto pt-3 w-full">
          <p class="text-yellow-900 font-semibold text-xs">✓ Verified ${formatDate(completedAt)}</p>
          ${evidence ? `<p class="text-yellow-800 text-xs italic mt-0.5 line-clamp-2">"${evidence}"</p>` : ""}
        </div>
      `;
    } else {
      card.classList.add("locked");

      let progressNote = "";
      if (id === "won6of7") {
        const pct = Math.min(100, (progress.bingoWins / 6) * 100);
        progressNote = `
          <p class="text-slate-400 text-xs mt-2">${progress.bingoWins} / 6 wins</p>
          <div class="w-full bg-slate-700 rounded-full h-1 mt-1">
            <div class="bg-indigo-500 h-1 rounded-full progress-bar-fill" style="width:${pct}%"></div>
          </div>`;
      } else if (id === "tableStakes7of7") {
        const pct = Math.min(100, (progress.tsDays / 7) * 100);
        progressNote = `
          <p class="text-slate-400 text-xs mt-2">${progress.tsDays} / 7 days</p>
          <div class="w-full bg-slate-700 rounded-full h-1 mt-1">
            <div class="bg-indigo-500 h-1 rounded-full progress-bar-fill" style="width:${pct}%"></div>
          </div>`;
      } else {
        progressNote = `<p class="text-slate-600 text-xs mt-2">${hint}</p>`;
      }

      card.innerHTML = `
        <div class="text-4xl mb-2 opacity-30">${emoji}</div>
        <p class="font-semibold text-slate-400 text-sm leading-tight">${label}</p>
        ${progressNote}
        <div class="absolute top-2 right-2 text-slate-600 text-xs">🔒</div>
      `;
    }

    return card;
  }

  function renderBoard(data) {
    const { achievements, weekStart, weeklyGoal, weekCompleted, progress } = data;

    weekRangeEl.textContent = formatWeekRange(weekStart);

    if (weeklyGoal) {
      goalDisplayEl.textContent = `"${weeklyGoal}"`;
    } else {
      goalDisplayEl.textContent = "No goal set yet — use /weekly-setup to set one";
      goalDisplayEl.classList.add("text-slate-500");
    }

    const done = achievements.filter((a) => a.completed).length;
    const pct = Math.round((done / 8) * 100);
    progressLabel.textContent = `${done} / 8 unlocked`;
    progressPct.textContent = `${pct}%`;
    progressFill.style.width = `${pct}%`;

    if (weekCompleted) {
      weekCompleteBanner.classList.remove("hidden");
      document.body.classList.add("week-complete");
    } else {
      weekCompleteBanner.classList.add("hidden");
      document.body.classList.remove("week-complete");
    }

    const achMap = Object.fromEntries(achievements.map((a) => [a.id, a]));
    grid.innerHTML = "";
    ORDERED_IDS.forEach((id) => {
      const ach = achMap[id];
      if (ach) grid.appendChild(buildCard(ach, progress));
    });
  }

  async function refresh() {
    try {
      const res = await fetch("/weekly-board");
      const data = await res.json();
      renderBoard(data);
    } catch (e) {
      console.error("Failed to load weekly board:", e);
    }
  }

  refresh();
  setInterval(refresh, 5000);
});
