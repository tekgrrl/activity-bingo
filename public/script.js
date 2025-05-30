document.addEventListener("DOMContentLoaded", () => {
  const bingoCardContainer = document.getElementById("bingo-card");
  const newBoardBtn = document.getElementById("new-board-btn");
  const messageArea = document.getElementById("message-area");
  const saveStatusEl = document.getElementById("save-status");

  const modal = document.getElementById("confirmation-modal");
  const modalMessage = document.getElementById("modal-message");
  const modalConfirmBtn = document.getElementById("modal-confirm-btn");
  const modalCancelBtn = document.getElementById("modal-cancel-btn");
  const modalContent = modal ? modal.querySelector(".modal-content") : null; // Get modal-content div

  let isBingoAchievedGlobal = false;
  let currentOnConfirmCallback = null;

  // --- Modal Functions ---
  function showConfirmationModal(message, onConfirm, event) {
    if (!modal || !modalMessage || !modalContent) {
      console.error("Modal elements not found for showConfirmationModal.");
      if (onConfirm) onConfirm(); // Fallback: directly execute confirm action if modal is broken
      return;
    }

    modalMessage.textContent = message;
    currentOnConfirmCallback = onConfirm;

    if (event && event.target) {
      const targetRect = event.target.getBoundingClientRect(); // Position of the clicked button/cell

      // Temporarily make modalContent visible to get its dimensions, then hide it
      // This is a common trick if dimensions are not fixed.
      modalContent.style.visibility = "hidden";
      modalContent.style.display = "block"; // Ensure it's block for offsetWidth/Height
      const modalWidth = modalContent.offsetWidth;
      const modalHeight = modalContent.offsetHeight;
      modalContent.style.visibility = ""; // Revert
      modalContent.style.display = ""; // Revert

      // Attempt to position below and slightly to the right of the clicked element's center
      let top = targetRect.top + targetRect.height / 2 + 10; // 10px below center
      let left = targetRect.left + targetRect.width / 2 + 10; // 10px right of center

      // Adjust if modal goes off-screen
      if (left + modalWidth > window.innerWidth) {
        left = window.innerWidth - modalWidth - 20; // 20px margin from right edge
      }
      if (top + modalHeight > window.innerHeight) {
        top = window.innerHeight - modalHeight - 20; // 20px margin from bottom edge
      }
      // Ensure it doesn't go off-screen left/top
      left = Math.max(20, left); // 20px margin from left edge
      top = Math.max(20, top); // 20px margin from top edge

      modalContent.style.top = `${top}px`;
      modalContent.style.left = `${left}px`;
    } else {
      // Fallback to center if no event target (should not happen for cell clicks)
      modalContent.style.top = "50%";
      modalContent.style.left = "50%";
      modalContent.style.transform = "translate(-50%, -50%)";
    }

    modal.classList.remove("hidden");
    // Trigger reflow for transition
    void modal.offsetWidth;
    modal.classList.add("opacity-100");
    modalContent.classList.remove("scale-95", "opacity-0");
    modalContent.classList.add("scale-100", "opacity-100");
  }

  function hideConfirmationModal() {
    if (!modal || !modalContent) {
      console.error("Modal elements not found for hideConfirmationModal.");
      return;
    }
    modal.classList.remove("opacity-100");
    modalContent.classList.remove("scale-100", "opacity-100");
    modalContent.classList.add("scale-95", "opacity-0");

    setTimeout(() => {
      modal.classList.add("hidden");
      currentOnConfirmCallback = null;
      // Reset position for next time, so it doesn't briefly show at old spot if centered fallback was used
      modalContent.style.top = "";
      modalContent.style.left = "";
      modalContent.style.transform = "";
    }, 300);
  }

  if (modalConfirmBtn) {
    modalConfirmBtn.addEventListener("click", () => {
      if (currentOnConfirmCallback) currentOnConfirmCallback();
      hideConfirmationModal();
    });
  } else {
    console.error(
      "Bingo App Error: Modal confirm button (id='modal-confirm-btn') not found."
    );
  }

  if (modalCancelBtn) {
    modalCancelBtn.addEventListener("click", () => {
      hideConfirmationModal();
    });
  } else {
    console.error(
      "Bingo App Error: Modal cancel button (id='modal-cancel-btn') not found."
    );
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
    const lines = [];
    if (!markedCells) return lines;
    for (const combination of WINNING_COMBINATIONS) {
      if (combination.every((index) => markedCells[index])) {
        lines.push(combination);
      }
    }
    return lines;
  }

  function highlightWinningLines(winningLinesData) {
    const cells = bingoCardContainer.querySelectorAll(".bingo-cell");
    if (cells.length === 0) return;
    winningLinesData.forEach((line) => {
      line.forEach((index) => {
        if (cells[index]) cells[index].classList.add("bingo-line");
      });
    });
  }

  function lockBoard() {
    const buttons = bingoCardContainer.querySelectorAll(".bingo-cell button");
    buttons.forEach((button) => (button.disabled = true));
    if (newBoardBtn) newBoardBtn.focus();
  }

  function checkAndProcessBingo(markedCells, boardActivities) {
    if (isBingoAchievedGlobal) return true;

    const winningLines = getWinningLines(markedCells);
    if (winningLines.length > 0) {
      isBingoAchievedGlobal = true;
      highlightWinningLines(winningLines);
      lockBoard();
      if (messageArea)
        messageArea.innerHTML = `<strong class="text-2xl text-yellow-400 animate-pulse">BINGO!</strong>`;
      if (saveStatusEl) saveStatusEl.textContent = "BINGO! Board Locked.";
      return true;
    }
    return false;
  }

  // --- Board Rendering and Interaction ---
  function clearBoardDisplay(
    message = 'Click "Generate New Board" to start or load your saved game.'
  ) {
    if (bingoCardContainer)
      bingoCardContainer.innerHTML = `<div class="col-span-5 text-center p-10 text-gray-500">${message}</div>`;
    if (messageArea) messageArea.textContent = "";
    isBingoAchievedGlobal = false;
  }

  async function loadInitialBoard() {
    if (messageArea) messageArea.textContent = "";
    if (bingoCardContainer)
      bingoCardContainer.innerHTML =
        '<div class="col-span-5 text-center p-10">Loading saved board...</div>';
    if (saveStatusEl) saveStatusEl.textContent = "Loading...";
    try {
      const response = await fetch("/get-current-board");
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: `HTTP error! status: ${response.status}` }));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }
      const boardState = await response.json();

      if (boardState && boardState.boardActivities) {
        isBingoAchievedGlobal = boardState.isBingoAchieved || false;
        renderBoard(boardState);

        if (isBingoAchievedGlobal) {
          const winningLines = getWinningLines(boardState.markedCells);
          if (winningLines.length > 0) highlightWinningLines(winningLines);
          lockBoard();
          if (messageArea)
            messageArea.innerHTML = `<strong class="text-2xl text-yellow-400 animate-pulse">BINGO!</strong>`;
          if (saveStatusEl) saveStatusEl.textContent = "BINGO! Board Locked.";
        } else {
          if (messageArea) messageArea.textContent = "Loaded saved board!";
          if (saveStatusEl) saveStatusEl.textContent = "Game loaded.";
        }

        setTimeout(() => {
          if (!isBingoAchievedGlobal) {
            if (messageArea) messageArea.textContent = "";
            if (saveStatusEl)
              saveStatusEl.textContent = "Game state is saved automatically.";
          }
        }, 2500);
      } else {
        clearBoardDisplay();
        if (messageArea)
          messageArea.textContent = "No saved board found. Generate a new one!";
        if (saveStatusEl) saveStatusEl.textContent = "No game loaded.";
      }
    } catch (error) {
      console.error("Error fetching initial board:", error);
      if (messageArea)
        messageArea.textContent = `Error loading: ${error.message}`;
      if (saveStatusEl) saveStatusEl.textContent = "Error loading game.";
      clearBoardDisplay(`Failed to load board: ${error.message}`);
    }
  }

  function renderBoard(boardState) {
    const { boardActivities, markedCells } = boardState;
    if (!boardActivities) {
      clearBoardDisplay("Cannot render board: No activity data found.");
      if (saveStatusEl) saveStatusEl.textContent = "Error rendering.";
      return;
    }

    if (!bingoCardContainer) {
      console.error("Bingo card container not found for rendering.");
      return;
    }
    bingoCardContainer.innerHTML = "";
    boardActivities.forEach((activityText, index) => {
      const cell = document.createElement("div");
      cell.classList.add(
        "bingo-cell",
        "bg-slate-50",
        "rounded-md",
        "shadow",
        "transition-colors",
        "duration-150",
        "ease-in-out"
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
        "rounded-md"
      );
      button.textContent = activityText;

      if (markedCells && markedCells[index]) {
        cell.classList.add("marked");
        button.classList.add("text-white");
      } else {
        button.classList.add("text-gray-700", "hover:bg-blue-100");
      }

      if (activityText === "FREE SPACE") {
        cell.classList.add("free-space");
        if (cell.classList.contains("marked")) {
          button.classList.remove("text-gray-700", "hover:bg-blue-100");
          button.classList.add("text-slate-800");
        } else {
          button.classList.add("text-slate-800");
        }
      } else if (activityText === "Empty") {
        button.classList.add("text-gray-400", "italic");
        button.disabled = true;
      }

      if (isBingoAchievedGlobal) {
        button.disabled = true;
      }

      button.addEventListener("click", (event) => {
        // Pass event to showConfirmationModal
        if (isBingoAchievedGlobal || activityText === "Empty") return;

        const currentMarkedStatus = cell.classList.contains("marked");
        const actionText = currentMarkedStatus ? "unmark" : "mark";
        const confirmMessage = `Are you sure you want to ${actionText} "${activityText}"?`;

        showConfirmationModal(
          confirmMessage,
          async () => {
            const newMarkedStatus = !currentMarkedStatus;

            cell.classList.toggle("marked", newMarkedStatus);
            if (newMarkedStatus) {
              button.classList.remove("text-gray-700", "hover:bg-blue-100");
              button.classList.add(
                activityText === "FREE SPACE" ? "text-slate-800" : "text-white"
              );
            } else {
              button.classList.remove("text-white");
              button.classList.add(
                activityText === "FREE SPACE"
                  ? "text-slate-800"
                  : "text-gray-700",
                "hover:bg-blue-100"
              );
            }

            if (saveStatusEl) saveStatusEl.textContent = "Saving...";
            let bingoAchievedThisMove = false;
            if (newMarkedStatus) {
              const tempMarkedCells = Array.from(
                bingoCardContainer.querySelectorAll(".bingo-cell")
              ).map((c) => c.classList.contains("marked"));
              if (getWinningLines(tempMarkedCells).length > 0) {
                bingoAchievedThisMove = true;
              }
            }

            try {
              const response = await fetch("/mark-cell", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  index: index,
                  isMarked: newMarkedStatus,
                  isBingoAchievedByThisMove: bingoAchievedThisMove,
                }),
              });
              const responseData = await response.json();
              if (!response.ok || !responseData.success) {
                throw new Error(
                  responseData.error || `Server error: ${response.status}`
                );
              }

              const serverMarkedCells = responseData.markedCells;
              isBingoAchievedGlobal = responseData.isBingoAchieved;

              if (checkAndProcessBingo(serverMarkedCells, boardActivities)) {
                // Bingo processed
              } else {
                if (saveStatusEl) saveStatusEl.textContent = "Saved!";
              }
            } catch (err) {
              console.error("Failed to update mark on server:", err);
              if (messageArea)
                messageArea.textContent = `Save error: ${err.message}. Reverting.`;
              if (saveStatusEl) saveStatusEl.textContent = "Save failed!";

              cell.classList.toggle("marked", !newMarkedStatus);
              if (newMarkedStatus) {
                button.classList.remove(
                  activityText === "FREE SPACE"
                    ? "text-slate-800"
                    : "text-white"
                );
                button.classList.add(
                  activityText === "FREE SPACE"
                    ? "text-slate-800"
                    : "text-gray-700",
                  "hover:bg-blue-100"
                );
              } else {
                button.classList.remove(
                  activityText === "FREE SPACE"
                    ? "text-slate-800"
                    : "text-gray-700",
                  "hover:bg-blue-100"
                );
                button.classList.add(
                  activityText === "FREE SPACE"
                    ? "text-slate-800"
                    : "text-white"
                );
              }
            } finally {
              if (!isBingoAchievedGlobal && saveStatusEl) {
                setTimeout(
                  () =>
                    (saveStatusEl.textContent =
                      "Game state is saved automatically."),
                  1500
                );
              }
            }
          },
          event
        ); // Pass the event object here
      });
      cell.appendChild(button);
      bingoCardContainer.appendChild(cell);
    });
  }

  async function generateNewBoard() {
    if (messageArea) messageArea.textContent = "";
    if (bingoCardContainer)
      bingoCardContainer.innerHTML =
        '<div class="col-span-5 text-center p-10">Generating a new awesome bingo board...</div>';
    if (saveStatusEl) saveStatusEl.textContent = "Generating...";
    isBingoAchievedGlobal = false;
    try {
      const response = await fetch("/generate-bingo");
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }
      const newBoardState = await response.json();
      isBingoAchievedGlobal = newBoardState.isBingoAchieved || false;
      renderBoard(newBoardState);
      if (messageArea)
        messageArea.textContent = "New board generated and saved!";
      if (saveStatusEl) saveStatusEl.textContent = "New board saved!";
      setTimeout(() => {
        if (messageArea) messageArea.textContent = "";
        if (saveStatusEl)
          saveStatusEl.textContent = "Game state is saved automatically.";
      }, 2500);
    } catch (error) {
      console.error("Error generating new board:", error);
      if (messageArea)
        messageArea.textContent = `Error generating: ${error.message}`;
      if (saveStatusEl) saveStatusEl.textContent = "Error generating board.";
      clearBoardDisplay(`Failed to generate new board: ${error.message}`);
    }
  }

  if (newBoardBtn) {
    newBoardBtn.addEventListener("click", generateNewBoard);
  } else {
    console.error(
      "Bingo App Error: New board button (id='new-board-btn') not found."
    );
  }

  loadInitialBoard();
});
