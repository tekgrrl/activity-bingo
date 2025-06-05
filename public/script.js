document.addEventListener("DOMContentLoaded", () => {
  const bingoCardContainer = document.getElementById("bingo-card");
  const newBoardBtn = document.getElementById("new-board-btn");
  const messageArea = document.getElementById("message-area");
  const saveStatusEl = document.getElementById("save-status");

  const modal = document.getElementById("confirmation-modal");
  const modalMessage = document.getElementById("modal-message");
  const modalConfirmBtn = document.getElementById("modal-confirm-btn");
  const modalCancelBtn = document.getElementById("modal-cancel-btn");
  const modalContent = modal ? modal.querySelector(".modal-content") : null;

  let isBingoAchievedGlobal = false; // Client-side flag, synchronized with server state.
  let currentOnConfirmCallback = null;

  // --- Modal Functions ---
  function showConfirmationModal(message, onConfirm, event) {
    if (!modal || !modalMessage || !modalContent) {
      console.error("Modal elements not found for showConfirmationModal.");
      if (onConfirm) onConfirm();
      return;
    }

    modalMessage.textContent = message;
    currentOnConfirmCallback = onConfirm;

    if (event && event.target) {
      const targetRect = event.target.getBoundingClientRect();

      modalContent.style.visibility = "hidden";
      modalContent.style.display = "block";
      const modalWidth = modalContent.offsetWidth;
      const modalHeight = modalContent.offsetHeight;
      modalContent.style.visibility = "";
      modalContent.style.display = "";

      let top = targetRect.top + targetRect.height / 2 + 10;
      let left = targetRect.left + targetRect.width / 2 + 10;

      if (left + modalWidth > window.innerWidth) {
        left = window.innerWidth - modalWidth - 20;
      }
      if (top + modalHeight > window.innerHeight) {
        top = window.innerHeight - modalHeight - 20;
      }
      left = Math.max(20, left);
      top = Math.max(20, top);

      modalContent.style.top = `${top}px`;
      modalContent.style.left = `${left}px`;
    } else {
      modalContent.style.top = "50%";
      modalContent.style.left = "50%";
      modalContent.style.transform = "translate(-50%, -50%)";
    }

    modal.classList.remove("hidden");
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

  /**
   * Applies visual effects if a bingo is detected based on currentMarkedCells.
   * This function is called when bingo status is confirmed (either by server or on load).
   * @param {boolean[]} currentMarkedCells - The current state of marked cells.
   * @returns {boolean} True if bingo visuals were applied, false otherwise.
   */
  function applyBingoVisualsAndLock(currentMarkedCells) {
    const winningLines = getWinningLines(currentMarkedCells);
    if (winningLines.length > 0) {
      highlightWinningLines(winningLines);
      lockBoard();
      if (messageArea)
        messageArea.innerHTML = `<strong class="text-2xl text-yellow-400 animate-pulse">BINGO!</strong>`;
      if (saveStatusEl) saveStatusEl.textContent = "BINGO! Board Locked.";
      return true; // Bingo visuals applied
    }
    return false; // No bingo visuals applied
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
        renderBoard(boardState); // Render first, it respects isBingoAchievedGlobal for disabling buttons

        if (isBingoAchievedGlobal) {
          // If loaded state says bingo, apply visuals.
          applyBingoVisualsAndLock(boardState.markedCells);
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

      if (activityText === "Empty") {
        button.classList.add("text-gray-400", "italic");
        button.disabled = true;
      }

      // Disable button if bingo is already achieved globally.
      // This is set by loadInitialBoard or after a server /mark-cell response.
      if (isBingoAchievedGlobal) {
        button.disabled = true;
      }

      button.addEventListener("click", (event) => {
        if (isBingoAchievedGlobal || activityText === "Empty") {
          return;
        }

        const currentMarkedStatus = cell.classList.contains("marked");
        const actionText = currentMarkedStatus ? "unmark" : "mark";
        const confirmMessage = `Are you sure you want to ${actionText} "${activityText}"?`;

        showConfirmationModal(
          confirmMessage,
          async () => {
            const newMarkedStatus = !currentMarkedStatus;

            // Optimistic UI update for the clicked cell
            cell.classList.toggle("marked", newMarkedStatus);
            if (newMarkedStatus) {
              button.classList.remove("text-gray-700", "hover:bg-blue-100");
              button.classList.add("text-white");
            } else {
              button.classList.remove("text-white");
              button.classList.add("text-gray-700", "hover:bg-blue-100");
            }

            if (saveStatusEl) saveStatusEl.textContent = "Saving...";

            // Determine if this optimistic move *would* achieve bingo
            let optimisticBingoAchieved = false;
            if (newMarkedStatus) {
              const tempMarkedCells = Array.from(
                bingoCardContainer.querySelectorAll(".bingo-cell")
              ).map((c) => c.classList.contains("marked")); // Get current UI state
              if (getWinningLines(tempMarkedCells).length > 0) {
                optimisticBingoAchieved = true;
              }
            }

            try {
              const response = await fetch("/mark-cell", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  index: index,
                  isMarked: newMarkedStatus,
                  isBingoAchievedByThisMove: optimisticBingoAchieved, // Inform server
                }),
              });
              const responseData = await response.json();
              if (!response.ok || !responseData.success) {
                throw new Error(
                  responseData.error || `Server error: ${response.status}`
                );
              }

              // Server has confirmed. Update client state based on server's response.
              const serverConfirmedMarkedCells = responseData.markedCells;
              isBingoAchievedGlobal = responseData.isBingoAchieved; // Update global source of truth

              // If server confirms bingo, apply visuals using server's state.
              if (isBingoAchievedGlobal) {
                applyBingoVisualsAndLock(serverConfirmedMarkedCells);
              } else {
                if (saveStatusEl) saveStatusEl.textContent = "Saved!";
              }

              // Note: If serverConfirmedMarkedCells differs from optimistic UI (besides the clicked cell),
              // a full re-render or more targeted update might be needed for robustness,
              // but current flow assumes server confirms the optimistic change or a bingo.
            } catch (err) {
              console.error("Failed to update mark on server:", err);
              if (messageArea)
                messageArea.textContent = `Save error: ${err.message}. Reverting.`;
              if (saveStatusEl) saveStatusEl.textContent = "Save failed!";

              // Revert optimistic UI change on error
              cell.classList.toggle("marked", !newMarkedStatus);
              if (newMarkedStatus) {
                button.classList.remove("text-white");
                button.classList.add("text-gray-700", "hover:bg-blue-100");
              } else {
                button.classList.remove("text-gray-700", "hover:bg-blue-100");
                button.classList.add("text-white");
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
        );
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
