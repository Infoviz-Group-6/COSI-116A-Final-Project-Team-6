// Small multiples: one mini choropleth per state-level layer, side by side,
// so population, electricity, and poverty patterns can be compared at once.
// The "Compare all three" button only appears while one of those layers is
// selected on the main map. Hovering a state highlights it on every map.
(() => {
  "use strict";

  const app = window.Team6App;
  const map = window.Team6Map = window.Team6Map || {};

  const LAYER_ORDER = ["population", "electricity", "poverty"];
  const WIDTH = 320;
  const HEIGHT = 200;
  const NO_DATA_FILL = "#c4ccd6";

  // Outline one state on the main map and every small multiple (null clears).
  map.highlightState = name => {
    d3.selectAll(".state-layer path, .small-multiple-map path")
      .classed("is-linked", d => name !== null && d?.properties?.name === name)
      .filter(".is-linked")
      .raise();
  };

  app.views.smallMultiples = {
    init() {
      const button = document.querySelector("#compare-layers");
      const panel = document.querySelector("#small-multiples");
      const grid = d3.select("#small-multiples-view");
      if (!button || !panel || grid.empty()) return;

      const layers = map.choroplethLayers;
      let cards = null; // built on first open
      let tooltip = null;
      let lastRendered = null;

      button.addEventListener("click", () => {
        app.setState({ compareLayers: !app.getState().compareLayers });
      });

      async function build() {
        const us = await d3.json("data/us-states.topojson");
        const states = topojson.feature(us, us.objects.states);
        const projection = d3.geoAlbersUsa()
          .fitExtent([[4, 4], [WIDTH - 4, HEIGHT - 4]], states);
        const path = d3.geoPath(projection);

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
              tooltip.hide();
            });

          const legend = card.append("div").attr("class", "small-multiple__legend");
          return { key, config, card, yearLabel, paths, legend };
        });
      }

      // One tooltip line per layer for the hovered state, for the shown years.
      function showTooltip(name) {
        const lines = cards.flatMap(c => {
          const row = c.rowsByState?.get(name);
          return row ? [`${c.config.title}: ${c.config.formatValue(row)} (${c.yearText})`] : [];
        });
        if (lines.length) tooltip.showText([name, ...lines].join("\n"));
      }

      async function render(state) {
        const isChoropleth = Boolean(layers[state.layer]);
        const isOpen = isChoropleth && state.compareLayers;

        button.hidden = !isChoropleth;
        button.setAttribute("aria-pressed", String(Boolean(state.compareLayers)));
        button.textContent = state.compareLayers
          ? "Hide layer comparison"
          : "Compare all three layers";
        panel.hidden = !isOpen;
        if (!isOpen) return;

        cards ??= build();
        const built = await cards;
        cards = built;

        built.forEach(c => c.card.classed("is-active", c.key === state.layer));

        const year = Number(state.year);
        if (lastRendered === year) return;
        lastRendered = year;

        await Promise.all(built.map(async c => {
          const layer = await map.loadChoroplethLayer(c.key);
          const { year: shown, rowsByState } = map.choroplethRowsForYear(layer, year);
          const sample = rowsByState.values().next().value;
          c.rowsByState = rowsByState;
          c.yearText = sample?.is_estimate
            ? `${shown} est.`
            : shown < year ? `${shown}, latest` : `${shown}`;
          c.yearLabel.text(c.yearText);

          c.paths
            .transition().duration(400)
            .attr("fill", feature => {
              const row = rowsByState.get(feature.properties.name);
              return row ? layer.color(c.config.value(row)) : NO_DATA_FILL;
            });

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
