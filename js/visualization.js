// Starts the shared dashboard after every view module has loaded.
(() => {
  "use strict";

  const dashboard = document.querySelector("#dashboard");

  // The preserved course reference also loads this file. It should remain static.
  if (!dashboard) return;

  const app = window.Team6App;
  const status = document.querySelector("#app-status");

  try {
    if (!app) throw new Error("The shared application state did not load.");

    Object.values(app.views).forEach((view) => view.init?.());
    app.subscribe(renderInterfaceState);
    bindLayerControls();
    bindCitySearch();
    renderInterfaceState(app.getState());

    status.textContent = "PA4 layout ready";
  } catch (error) {
    console.error(error);
    status.textContent = "Dashboard could not start";
    status.classList.add("app-error");
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

  function bindCitySearch() {
    document.querySelector("#city-search").addEventListener("submit", (event) => {
      event.preventDefault();
      const searchQuery = document.querySelector("#city-query").value.trim();
      app.setState({ searchQuery });
      document.querySelector("#city-search-status").textContent = searchQuery
        ? `Search target: ${searchQuery}. Map zoom and closest-facility lookup will connect here.`
        : "Enter a city to prepare a map search.";
    });
  }

  function renderInterfaceState(state) {
    const layerNames = {
      electricity: "Electricity",
      population: "Population",
      poverty: "Poverty",
      claude: "Claude usage per capita"
    };
    const isClaudeView = state.layer === "claude";
    const colorLegend = document.querySelector("#color-legend");
    const mapSummary = document.querySelector("#map-summary");

    document.querySelector("#geographic-view").hidden = isClaudeView;
    document.querySelector("#claude-view").hidden = !isClaudeView;

    colorLegend.hidden = !state.layer || isClaudeView;
    document.querySelector("#color-legend-label").textContent = state.layer
      ? layerNames[state.layer]
      : "";

    mapSummary.textContent = state.layer
      ? `${layerNames[state.layer]} state colors with data-center capacity circles.`
      : "Neutral state view with data-center capacity circles.";
  }
})();
