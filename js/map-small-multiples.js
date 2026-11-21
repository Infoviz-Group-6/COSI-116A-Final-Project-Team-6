// =============================================================================
// map-small-multiples.js — side-by-side comparison of the three state layers
// =============================================================================
// What this adds:
//   Three small maps (population density, electricity per person, poverty
//   rate) shown in a panel under the main map, each with its own color scale
//   and legend. This lets viewers compare patterns across layers at once,
//   instead of overlaying semi-transparent colors that can't be read back.
//
// When it appears:
//   The "Compare all three layers" button (#compare-layers in the filter rail)
//   is only visible while Population, Electricity usage, or Poverty is
//   selected. Clicking it toggles `compareLayers` in the shared app state,
//   which shows/hides the panel (#small-multiples). Deselecting the layer
//   hides both the button and the panel.
//
// Interactions:
//   - The year slider updates all three maps (each clamps to its own data years).
//   - The small map matching the main map's layer gets an accent outline.
//   - Hovering a state on any map outlines that state on all four maps
//     (map.highlightState), and the small-map tooltip lists all three values.
//
// Data and colors come from js/map-choropleth.js (LAYERS, loadChoroplethLayer,
// choroplethRowsForYear), so this file has no data logic of its own.
// Styles are in styles/small-multiples.css.
// =============================================================================
(() => {
  "use strict";

  const app = window.Team6App;
  const map = window.Team6Map = window.Team6Map || {};

  const LAYER_ORDER = ["population", "electricity", "poverty", "usage"]; // left to right
  const WIDTH = 320;  // SVG viewBox size of each small map; CSS scales it
  const HEIGHT = 200;
  const NO_DATA_FILL = "#c4ccd6";

  // Linked highlighting: outline one state on the main map and every small
  // multiple at the same time (pass null to clear). Uses the `is-linked`
  // class styled in small-multiples.css, and raises the outlined paths so
  // neighboring states don't cover their border. Also called by js/map.js
  // when hovering the main map.
  map.highlightState = name => {
    d3.selectAll(".state-layer path, .small-multiple-map path")
      .classed("is-linked", d => name !== null && d?.properties?.name === name)
      .filter(".is-linked")
      .raise();
  };

  // Selected data center, mirrored from the main map. js/map.js calls this
  // with the selected facility (or null) after every update; it is stored so
  // the small maps can draw it once they are built. Replaced by the drawing
  // version inside init() below.
  let selectedFacility = null;
  map.markSelectedFacility = center => { selectedFacility = center; };

  // Registered as a dashboard view; js/visualization.js calls init() on
  // every entry in app.views at startup.
  app.views.smallMultiples = {
    init() {
      const button = document.querySelector("#compare-layers");
      const panel = document.querySelector("#small-multiples");
      const grid = d3.select("#small-multiples-view");
      if (!button || !panel || grid.empty()) return; // markup missing: do nothing

      const layers = map.choroplethLayers;
      // `cards` is null until the panel is first opened, then a promise while
      // the maps are being built, then the array of built cards. Building
      // lazily avoids drawing three extra maps for users who never open them.
      let cards = null;
      let tooltip = null;
      let lastRendered = null; // slider year last drawn, to skip redundant redraws

      button.addEventListener("click", () => {
        app.setState({ compareLayers: !app.getState().compareLayers });
      });

      // Creates one <figure> card per layer: caption (title + year shown),
      // an SVG map of the states, and a four-swatch legend. Returns an array
      // of objects holding the d3 selections that render() updates later.
      async function build() {
        const us = await d3.json("data/us-states.topojson");
        const states = topojson.feature(us, us.objects.states);
        // Same projection type as the main map, fitted to the small size.
        const projection = d3.geoAlbersUsa()
          .fitExtent([[4, 4], [WIDTH - 4, HEIGHT - 4]], states);
        const path = d3.geoPath(projection);

        // One shared tooltip for the whole grid (positioned inside it).
        tooltip = map.createTooltip(grid);

        return LAYER_ORDER.map(key => {
          const config = layers[key];
          const card = grid.append("figure")
            .attr("class", "small-multiple")
            .attr("data-layer-card", key);

          const caption = card.append("figcaption");
          caption.append("span").attr("class", "small-multiple__title").text(config.title);
          const yearLabel = caption.append("span").attr("class", "small-multiple__year");

          const svg = card.append("svg")
            .attr("class", "small-multiple-map")
            .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
            .attr("role", "img")
            .attr("aria-label", `${config.title} by state`);

          // One path per state; colors are filled in by render().
          const paths = svg.append("g")
            .attr("class", "small-multiple-states")
            .selectAll("path")
            .data(states.features)
            .join("path")
            .attr("d", path)
            .attr("fill", NO_DATA_FILL)
            .on("pointerenter", (event, feature) => {
              map.highlightState(feature.properties.name);
              showTooltip(feature.properties.name);
              tooltip.move(event);
            })
            .on("pointermove", event => tooltip.move(event))
            .on("pointerleave", () => {
              map.highlightState(null);
              map.markSelectedState?.(app.getState().selectedStates);
              tooltip.hide();
            });

          // Drawn after the states so the marker stays on top of hover outlines.
          const facilityLayer = svg.append("g")
            .attr("class", "small-multiple-facility")
            .style("pointer-events", "none");

          const legend = card.append("div").attr("class", "small-multiple__legend");
          if (config.note) {
            card.append("p")
              .attr("class", "small-multiple__note")
              .text(config.note);
          }
          return { key, config, card, yearLabel, paths, facilityLayer, projection, legend };
          // render() later adds: rowsByState (that year's data) and yearText.
        });
      }

      // Tooltip with one line per layer for the hovered state, e.g.
      //   Massachusetts
      //   Population density: 917 people per sq mi (2025)
      //   Electricity use: 7.3 MWh per person (2026 est.)
      //   Poverty rate: 9.9% in poverty (2024, latest)
      function showTooltip(name) {
        const lines = cards.flatMap(c => {
          const row = c.rowsByState?.get(name);
          return row ? [`${c.config.title}: ${c.config.formatValue(row)} (${c.yearText})`] : [];
        });
        if (lines.length) tooltip.showText([name, ...lines].join("\n"));
      }

      // Draws the selected data center (pink, like the main map) on every
      // small map, or clears it when nothing is selected.
      function drawSelectedFacility() {
        if (!Array.isArray(cards)) return; // not built yet
        const center = selectedFacility;
        cards.forEach(c => {
          const point = center
            ? c.projection([center.longitude, center.latitude])
            : null;
          c.facilityLayer
            .selectAll("circle")
            .data(point ? [point] : [])
            .join("circle")
            .attr("class", "small-multiple-facility__marker")
            .attr("cx", d => d[0])
            .attr("cy", d => d[1])
            .attr("r", 5);
        });
      }

      map.markSelectedFacility = center => {
        selectedFacility = center;
        drawSelectedFacility();
      };

      // Runs on every app state change. Cheap when nothing relevant changed.
      async function render(state) {
        const isChoropleth = Boolean(layers[state.layer]);
        const isOpen = isChoropleth && state.compareLayers;

        // Button only exists as an option while a choropleth layer is selected.
        button.hidden = !isChoropleth;
        button.setAttribute("aria-pressed", String(Boolean(state.compareLayers)));
        button.textContent = state.compareLayers
          ? "Hide layer comparison"
          : "Compare all four layers";
        panel.hidden = !isOpen;
        if (!isOpen) return;

        // Build on first open. Storing the promise first means two quick
        // renders share one build instead of drawing the maps twice.
        cards ??= build();
        const built = await cards;
        cards = built;
        drawSelectedFacility();

        // Outline the card for the layer shown on the main map.
        built.forEach(c => c.card.classed("is-active", c.key === state.layer));
        // Show the selected state (pink outline, set in js/map.js) here too.
        map.markSelectedState?.(state.selectedStates);

        // Colors only depend on the slider year, so skip if unchanged.
        const year = Number(state.year);
        if (lastRendered === year) return;
        lastRendered = year;

        await Promise.all(built.map(async c => {
          const layer = await map.loadChoroplethLayer(c.key); // cached
          const { year: shown, rowsByState } = map.choroplethRowsForYear(layer, year);
          const sample = rowsByState.values().next().value;
          c.rowsByState = rowsByState;
          // Caption tells the viewer which data year each map really shows.
          c.yearText = sample?.is_estimate
            ? `${shown} est.`                                  // electricity 2026
            : shown < year ? `${shown}, latest` : `${shown}`;  // e.g. poverty 2024
          c.yearLabel.text(c.yearText);

          // Same quantile color scale as the main map for this layer.
          c.paths
            .transition().duration(400)
            .attr("fill", feature => {
              const row = rowsByState.get(feature.properties.name);
              return row ? layer.color(c.config.value(row)) : NO_DATA_FILL;
            });

          // Legend: four swatches with the class ranges written under them.
          // The swatch color is passed as a CSS variable (--swatch) and drawn
          // by a ::before block in small-multiples.css.
          const breaks = layer.color.quantiles().map(c.config.formatBreak);
          const labels = [`< ${breaks[0]}`, `${breaks[0]}–${breaks[1]}`,
            `${breaks[1]}–${breaks[2]}`, `> ${breaks[2]}`];
          c.legend
            .selectAll("span")
            .data(c.config.colors)
            .join("span")
            .attr("class", "small-multiple__swatch")
            .style("--swatch", d => d)
            .text((d, i) => labels[i]);
        }));
      }

      function update(state) {
        render(state).catch(error => console.error("Small multiples error:", error));
      }

      update(app.getState());
      app.subscribe(update);
    }
  };
})();
