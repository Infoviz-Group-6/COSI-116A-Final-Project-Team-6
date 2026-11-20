// Starts the shared dashboard after every view module has loaded.
(() => {
  "use strict";

  const dashboard = document.querySelector("#dashboard");

  // The preserved course reference also loads this file. It should remain static.
  if (!dashboard) return;

  const app = window.Team6App;
  const status = document.querySelector("#app-status");

  let artifactData = [];
  let currentState = "USA";
  const container = document.getElementById("treemap-view");

  try {
    if (!app) throw new Error("The shared application state did not load.");

    Object.values(app.views).forEach((view) => view.init?.());
    app.subscribe(renderInterfaceState);
    bindLayerControls();
    renderInterfaceState(app.getState());

    status.textContent = "PA4 layout ready";
  } catch (error) {
    console.error(error);
    status.textContent = "Dashboard could not start";
    status.classList.add("app-error");
  }
initVisualization();

  function updateTreemap(newState = "USA") {
    currentState = newState || "USA";

    const heading = document.getElementById("treemap-section-heading");
    if (heading) {
      const displayName = currentState === "USA" ? "the USA" : currentState;
      heading.textContent = `What topics were Claude chats about in ${displayName}?`;
    }

    if (!container || !window.Treemap || !artifactData.length) return;

    const chart = window.Treemap(artifactData, {
      selectedState: currentState,
      state: d => d.state,
      label: d => d.artifact,
      value: d => +d.value,
      width: 1154,
      height: 700
    });

    container.replaceChildren(chart);
  }

  window.updateTreemap = updateTreemap;

  async function initVisualization() {
    try {
      // Note: If your CSV is in a "data/" subfolder, change this to "data/Anthropic-State-Artifacts.csv"
      artifactData = await d3.csv("data/Anthropic-State-Artifacts.csv");

      // On load, honour any state already parsed from the search box.
      const initialAbbr = stateFromQuery(app.getState().searchQuery);
      updateTreemap(initialAbbr || "USA");

      const selectEl = document.getElementById("state-select");
      if (selectEl) {
        const states = ["USA", ...new Set(artifactData.map(d => d.state).filter(Boolean).sort())];
        selectEl.innerHTML = states.map(s => `<option value="${s}">${s}</option>`).join("");
        selectEl.value = currentState;
        selectEl.addEventListener("change", e => updateTreemap(e.target.value));
      }
    } catch (csvError) {
      console.error("Could not load Anthropic-State-Artifacts.csv:", csvError);
    }
  }

  function bindLayerControls() {
    document.querySelectorAll("[data-layer]").forEach((button) => {
      button.addEventListener("click", () => {
        const selectedLayer = app.getState().layer === button.dataset.layer
          ? null
          : button.dataset.layer;

        document.querySelectorAll("[data-layer]").forEach((candidate) => {
          const isSelected = candidate.dataset.layer === selectedLayer;
          candidate.classList.toggle("is-active", isSelected);
          candidate.setAttribute("aria-pressed", String(isSelected));
        });

        app.setState({ layer: selectedLayer });
      });
    });
  }

  // Extracts a full US state name from a "City, State Name" query string.
  // Returns null if the query is blank or no state portion is found.
  function stateFromQuery(query) {
    if (!query) return null;
    const commaIdx = query.lastIndexOf(",");
    if (commaIdx === -1) return null;
    const stateName = query.slice(commaIdx + 1).trim();
    return stateName.length ? stateName : null;
  }

  function renderInterfaceState(state) {
    const layerNames = {
      electricity: "Electricity",
      population: "Population",
      poverty: "Poverty",
      usage: "Usage Percentage"
    };
    const colorLegend = document.querySelector("#color-legend");
    const mapSummary = document.querySelector("#map-summary");

    colorLegend.hidden = !state.layer;
    document.querySelector("#color-legend-label").textContent = state.layer
      ? layerNames[state.layer]
      : "";

    mapSummary.textContent = state.layer
      ? `${layerNames[state.layer]} state colors with data-center capacity circles.`
      : "Neutral state view with data-center capacity circles.";

    // Keep treemap in sync with the city search box.
    if (artifactData.length) {
      const stateName = stateFromQuery(state.searchQuery);
      const targetState = stateName || "USA";
      if (targetState !== currentState) {
        updateTreemap(targetState);
        // Mirror the change in the dropdown if it exists.
        const selectEl = document.getElementById("state-select");
        if (selectEl) selectEl.value = targetState;
      }
    }
  }
})();

