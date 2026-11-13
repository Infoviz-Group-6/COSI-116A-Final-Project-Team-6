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

  // Geocodes the typed city with OpenStreetMap Nominatim (US results only).
  // The map view reacts to state.searchLocation and finds the closest data center.
  async function geocodeCity(query) {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      countrycodes: "us",
      limit: "1"
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Geocoder responded with ${response.status}`);

    const [match] = await response.json();
    if (!match) return null;

    return {
      label: match.display_name,
      latitude: Number(match.lat),
      longitude: Number(match.lon)
    };
  }

  function bindCitySearch() {
    const form = document.querySelector("#city-search");
    const status = document.querySelector("#city-search-status");
    const submitButton = form.querySelector("button[type='submit']");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const searchQuery = document.querySelector("#city-query").value.trim();

      if (!searchQuery) {
        app.setState({ searchQuery: "", searchLocation: null });
        status.textContent = "Enter a city to find the closest listed data center.";
        return;
      }

      status.textContent = `Searching for ${searchQuery}…`;
      submitButton.disabled = true;

      try {
        const searchLocation = await geocodeCity(searchQuery);
        if (!searchLocation) {
          app.setState({ searchQuery, searchLocation: null });
          status.textContent = `Could not find "${searchQuery}" in the United States. Try "City, ST".`;
          return;
        }
        // The map view writes the closest-facility result into the status line.
        app.setState({ searchQuery, searchLocation });
      } catch (error) {
        console.error("City search error:", error);
        status.textContent = "City lookup failed. Check your connection and try again.";
      } finally {
        submitButton.disabled = false;
      }
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
