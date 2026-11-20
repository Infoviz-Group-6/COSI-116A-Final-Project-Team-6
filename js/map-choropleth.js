// State choropleth layers for the main map. Colors each state by a per-state
// value for the selected year; data-center circles are drawn above it.
(() => {
  "use strict";

  const map = window.Team6Map = window.Team6Map || {};

  const NEUTRAL_FILL = "#e8eef5";
  const NO_DATA_FILL = "#c4ccd6";
  // One entry per state-level layer. Add electricity, poverty, etc. here.
  // `colors` is a light-to-dark ramp of four classes; the legend swatches
  // are recolored to match while the layer is shown.
  const LAYERS = {
    population: {
      file: "data/state-population-density.csv",
      colors: ["#edf8e9", "#bae4b3", "#74c476", "#238b45"],
      value: d => d.density_per_sq_mi,
      legendLabel: year => `People per sq mi of land (${year} Census est.)`,
      formatBreak: d3.format(",.0f"),
      tooltip: (d, year) =>
        `${d.state}\n` +
        `${d3.format(",.1f")(d.density_per_sq_mi)} people per sq mi\n` +
        `Population ${d.population.toLocaleString()} (${year} est.)\n` +
        `Land area ${d3.format(",.0f")(d.land_sq_mi)} sq mi`,
      parse: d => ({
        state: d.state,
        year: Number(d.year),
        population: Number(d.population),
        land_sq_mi: Number(d.land_sq_mi),
        density_per_sq_mi: Number(d.density_per_sq_mi)
      })
    }
  };

  map.choroplethLayers = LAYERS;

  map.createChoropleth = ({ stateLayer, tooltip }) => {
    const cache = new Map();
    const legendLabel = document.querySelector("#color-legend-label");
    const rampLabels = document.querySelector(".color-ramp-labels");
    const defaultRampLabels = rampLabels ? rampLabels.innerHTML : "";
    const rampSwatches = document.querySelectorAll(".color-ramp span");
    let current = { key: null, year: null, rowsByState: null, config: null };
    let renderToken = 0;

    // Loads a layer once and builds a color scale from every year together,
    // so moving the year slider shows real change instead of re-ranked classes.
    function load(key) {
      if (!cache.has(key)) {
        const config = LAYERS[key];
        cache.set(key, d3.csv(config.file, config.parse).then(rows => {
          const byYear = d3.group(rows, d => d.year, d => d.state);
          const years = [...byYear.keys()].sort(d3.ascending);
          const color = d3.scaleQuantile()
            .domain(rows.map(config.value))
            .range(config.colors);
          return { byYear, years, color };
        }));
      }
      return cache.get(key);
    }

    function setLegend(config, color, year) {
      if (legendLabel) legendLabel.textContent = config.legendLabel(year);
      rampSwatches.forEach((swatch, i) => {
        swatch.style.background = config.colors[i];
      });
      if (!rampLabels) return;
      const [b1, b2, b3] = color.quantiles().map(config.formatBreak);
      rampLabels.classList.add("color-ramp-labels--classes");
      rampLabels.innerHTML = "";
      [`< ${b1}`, `${b1}–${b2}`, `${b2}–${b3}`, `> ${b3}`].forEach(text => {
        rampLabels.append(Object.assign(document.createElement("span"), { textContent: text }));
      });
    }

    function resetLegend() {
      rampSwatches.forEach(swatch => swatch.style.removeProperty("background"));
      if (!rampLabels) return;
      rampLabels.classList.remove("color-ramp-labels--classes");
      rampLabels.innerHTML = defaultRampLabels;
    }

    stateLayer
      .selectAll("path")
      .on("pointerenter.choropleth", (event, feature) => {
        const row = current.rowsByState?.get(feature.properties.name);
        if (!row) return;
        tooltip.showText(current.config.tooltip(row, current.year));
        tooltip.move(event);
      })
      .on("pointermove.choropleth", event => {
        if (current.rowsByState) tooltip.move(event);
      })
      .on("pointerleave.choropleth", () => {
        if (current.rowsByState) tooltip.hide();
      });

    async function render(state) {
      const key = LAYERS[state.layer] ? state.layer : null;
      const token = ++renderToken;

      if (!key) {
        if (current.key === null) return;
        current = { key: null, year: null, rowsByState: null, config: null };
        resetLegend();
        stateLayer.selectAll("path")
          .transition().duration(400)
          .attr("fill", NEUTRAL_FILL);
        return;
      }

      const { byYear, years, color } = await load(key);
      if (token !== renderToken) return; // a newer state change won

      // Clamp the slider year to the years we have data for.
      const year = Math.max(years[0], Math.min(years.at(-1), Number(state.year)));
      if (current.key === key && current.year === year) return;

      const config = LAYERS[key];
      const rowsByState = new Map(
        [...byYear.get(year)].map(([name, rows]) => [name, rows[0]])
      );
      current = { key, year, rowsByState, config };

      setLegend(config, color, year);
      stateLayer.selectAll("path")
        .transition().duration(400)
        .attr("fill", feature => {
          const row = rowsByState.get(feature.properties.name);
          return row ? color(config.value(row)) : NO_DATA_FILL;
        });
    }

    return {
      render(state) {
        render(state).catch(error => console.error("Choropleth error:", error));
      }
    };
  };
})();
