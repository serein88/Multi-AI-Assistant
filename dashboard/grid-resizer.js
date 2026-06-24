/* global PROVIDER_BY_ID */
(() => {
  "use strict";

  function getState() {
    return globalThis.MultiAI || {};
  }

  function getGrid() {
    return document.getElementById("panelGrid");
  }

  // ── Grid Resizer Functions ───────────────────────────────────────

  function initGridResizers() {
    const state = getState();
    const grid = getGrid();
    if (!grid) return;

    const panelByIndex = state.panelByIndex || new Map();
    const customGrid = state.customGrid || { rows: 0, cols: 0 };
    const activePanels = state.activePanels || [];

    // Remove existing splitters
    const existing = Array.from(grid.querySelectorAll(".grid-splitter"));
    existing.forEach((el) => el.remove());

    const panels = Array.from(panelByIndex.values());
    if (panels.length <= 1) {
      state.colSizes = [];
      state.rowSizes = [];
      grid.style.gridTemplateColumns = "";
      grid.style.gridTemplateRows = "";
      return;
    }

    const columnCount = getColumnCount(activePanels, customGrid);
    const rowCount = getRowCount(activePanels, columnCount);
    const HORIZONTAL_SPLITTER_HEIGHT = 4;

    const gridRect = grid.getBoundingClientRect();

    // Initialize Columns (Percentage based)
    if (columnCount > 0) {
      if (state.colSizes.length !== columnCount) {
        const equal = 100 / columnCount;
        state.colSizes = new Array(columnCount).fill(equal);
      }
      grid.style.gridTemplateColumns = state.colSizes.map((v) => `${v}%`).join(" ");

      for (let i = 1; i < columnCount; i += 1) {
        const panel = panels[i - 1];
        if (panel) {
          const rect = panel.getBoundingClientRect();
          const splitter = document.createElement("div");
          splitter.className = "grid-splitter grid-splitter-vertical";
          splitter.dataset.index = String(i - 1);
          const left = rect.right - gridRect.left;
          const leftPct = (left / gridRect.width) * 100;
          splitter.style.left = `${leftPct}%`;
          splitter.addEventListener("mousedown", onVerticalSplitterMouseDown);
          grid.appendChild(splitter);
        }
      }
    }

    // Initialize Rows (Pixel based)
    if (rowCount >= 1) {
      if (state.rowSizes.length !== rowCount) {
        const heights = [];
        for (let r = 0; r < rowCount; r++) {
          const panelIndex = r * columnCount;
          const panel = panels[panelIndex];
          if (panel) {
            heights.push(panel.getBoundingClientRect().height);
          } else {
            heights.push(320);
          }
        }
        state.rowSizes = heights;
      }
      grid.style.gridTemplateRows = state.rowSizes.map((px) => `${px}px`).join(" ");

      // Create Horizontal Splitters
      for (let row = 1; row < rowCount; row += 1) {
        const prevRowIndex = row - 1;
        const panelIndex = prevRowIndex * columnCount;
        const panel = panels[panelIndex];

        if (panel) {
          const rect = panel.getBoundingClientRect();
          const splitter = document.createElement("div");
          splitter.className = "grid-splitter grid-splitter-horizontal";
          splitter.dataset.index = String(prevRowIndex);
          splitter.style.top = `${rect.bottom - gridRect.top - HORIZONTAL_SPLITTER_HEIGHT}px`;
          splitter.addEventListener("mousedown", onHorizontalSplitterMouseDown);
          grid.appendChild(splitter);
        }
      }
      // Single-row mode: add bottom-edge splitter
      if (rowCount === 1) {
        const lastPanel = panels[panels.length - 1];
        if (lastPanel) {
          const rect = lastPanel.getBoundingClientRect();
          const splitter = document.createElement("div");
          splitter.className = "grid-splitter grid-splitter-horizontal";
          splitter.dataset.index = "0";
          splitter.style.top = `${rect.bottom - gridRect.top - HORIZONTAL_SPLITTER_HEIGHT}px`;
          splitter.addEventListener("mousedown", onHorizontalSplitterMouseDown);
          grid.appendChild(splitter);
        }
      }
    }
    // Update DOM caches after splitters are rebuilt
    state.panelEls = panels;
    state.vSplitters = Array.from(grid.querySelectorAll(".grid-splitter-vertical"));
    state.hSplitters = Array.from(grid.querySelectorAll(".grid-splitter-horizontal"));
  }

  function getColumnCount(activePanels, customGrid) {
    if (customGrid.cols > 0) return customGrid.cols;

    const n = activePanels.length;
    if (n <= 1) return 1;
    if (n <= 4) return 2;
    if (n <= 9) return 3;
    return 4;
  }

  function getRowCount(activePanels, colCount) {
    const neededRows = Math.ceil(activePanels.length / Math.max(colCount, 1));
    return Math.max(neededRows, 1);
  }

  function onVerticalSplitterMouseDown(event) {
    event.preventDefault();
    const state = getState();
    const grid = getGrid();
    if (!grid) return;

    const splitter = event.currentTarget;
    const index = Number(splitter.dataset.index);
    if (!Number.isFinite(index)) return;

    document.body.classList.add("resizing");
    const gridRect = grid.getBoundingClientRect();
    const startX = event.clientX;
    const startSizes = state.colSizes.slice();
    const pairTotal = startSizes[index] + startSizes[index + 1];

    function onMove(e) {
      const deltaPx = e.clientX - startX;
      const deltaPercent = (deltaPx / gridRect.width) * 100;
      let left = startSizes[index] + deltaPercent;
      let right = startSizes[index + 1] - deltaPercent;
      const min = 5;
      if (left < min) {
        left = min;
        right = pairTotal - left;
      }
      if (right < min) {
        right = min;
        left = pairTotal - right;
      }
      const newSizes = startSizes.slice();
      newSizes[index] = left;
      newSizes[index + 1] = right;
      state.colSizes = newSizes;
      grid.style.gridTemplateColumns = state.colSizes.map((v) => `${v}%`).join(" ");
      updateSplitterPositions();
    }

    function onUp() {
      document.body.classList.remove("resizing");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (state.saveState) state.saveState();
      if (state.syncGridInputs) state.syncGridInputs();
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onHorizontalSplitterMouseDown(event) {
    event.preventDefault();
    const state = getState();
    const grid = getGrid();
    if (!grid) return;

    const splitter = event.currentTarget;
    const index = Number(splitter.dataset.index);
    if (!Number.isFinite(index)) return;

    document.body.classList.add("resizing");
    const startY = event.clientY;
    const startHeight = state.rowSizes[index];

    function onMove(e) {
      const deltaPx = e.clientY - startY;
      const adjustedDelta = deltaPx / (index + 1);

      let newHeight = startHeight + adjustedDelta;
      const min = 100;
      if (newHeight < min) newHeight = min;

      const newSizes = state.rowSizes.map(() => newHeight);
      state.rowSizes = newSizes;

      grid.style.gridTemplateRows = state.rowSizes.map((px) => `${px}px`).join(" ");
      updateSplitterPositions();
    }

    function onUp() {
      document.body.classList.remove("resizing");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (state.saveState) state.saveState();
      if (state.syncGridInputs) state.syncGridInputs();
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function updateSplitterPositions() {
    const state = getState();
    const grid = getGrid();
    if (!grid) return;

    const gridRect = grid.getBoundingClientRect();
    const vSplitters = state.vSplitters || [];
    const hSplitters = state.hSplitters || [];
    const panelEls = state.panelEls || [];
    const customGrid = state.customGrid || { cols: 0 };
    const HORIZONTAL_SPLITTER_HEIGHT = 4;

    vSplitters.forEach((sp) => {
      const idx = Number(sp.dataset.index);
      const panel = panelEls[idx];
      if (panel) {
        const rect = panel.getBoundingClientRect();
        const left = rect.right - gridRect.left;
        const leftPct = (left / gridRect.width) * 100;
        sp.style.left = `${leftPct}%`;
      }
    });

    hSplitters.forEach((sp) => {
      const idx = Number(sp.dataset.index);
      const match = grid.className.match(/cols-(\d+)/);
      const cols = customGrid.cols || (match ? Number(match[1]) : 1);
      const panelIndex = idx * cols;
      const panel = panelEls[panelIndex];
      if (panel) {
        const rect = panel.getBoundingClientRect();
        const top = rect.bottom - gridRect.top - HORIZONTAL_SPLITTER_HEIGHT;
        sp.style.top = `${top}px`;
      }
    });
  }

  // ── Grid Layout ──────────────────────────────────────────────────

  function syncGridInputs() {
    const state = getState();
    const colDisplay = document.getElementById("colDisplay");
    if (colDisplay) {
      colDisplay.textContent = state.customGrid.cols > 0 ? state.customGrid.cols : "Auto";
    }
  }

  function applyGridLayout(resetSizes = false) {
    const state = getState();
    const grid = getGrid();
    if (!grid) return;

    const activePanels = state.activePanels || [];
    const customGrid = state.customGrid || { cols: 0 };
    const colCount = getColumnCount(activePanels, customGrid);
    const rowCount = getRowCount(activePanels, colCount);

    grid.classList.remove("cols-1", "cols-2", "cols-3", "cols-4", "cols-5", "cols-6");
    grid.classList.add(`cols-${Math.min(Math.max(colCount, 1), 6)}`);

    if (resetSizes || state.colSizes.length !== colCount) {
      const equal = 100 / Math.max(colCount, 1);
      state.colSizes = new Array(colCount).fill(equal);
    }
    grid.style.gridTemplateColumns = state.colSizes.length
      ? state.colSizes.map((v) => `${v}%`).join(" ")
      : "";

    if (rowCount <= 1) {
      if (resetSizes) {
        state.rowSizes = [];
      }
      grid.style.gridTemplateRows = state.rowSizes.length > 0
        ? state.rowSizes.map((px) => `${px}px`).join(" ")
        : "";
    } else {
      if (resetSizes || state.rowSizes.length !== rowCount) {
        const oldSizes = state.rowSizes || [];
        const newSizes = [];
        for (let i = 0; i < rowCount; i++) {
          if (i < oldSizes.length) {
            newSizes[i] = oldSizes[i];
          } else {
            newSizes[i] = i > 0 ? newSizes[i - 1] : 400;
          }
        }
        state.rowSizes = newSizes;
      }
      grid.style.gridTemplateRows = state.rowSizes.map((px) => `${px}px`).join(" ");
    }

    syncGridInputs();
    initGridResizers();
  }

  // ── Export API ───────────────────────────────────────────────────

  const api = {
    initGridResizers,
    updateSplitterPositions,
    applyGridLayout,
    syncGridInputs,
    getColumnCount: () => {
      const state = getState();
      return getColumnCount(state.activePanels || [], state.customGrid || { cols: 0 });
    },
    getRowCount: (colCount) => {
      const state = getState();
      return getRowCount(state.activePanels || [], colCount);
    }
  };

  if (typeof globalThis !== "undefined") {
    globalThis.MultiAIGridResizer = api;
  }
})();
