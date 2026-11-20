// State choropleth layers for the main map. Colors each state by a per-state
// value for the selected year; data-center circles are drawn above it.
(() => {
  "use strict";

  const map = window.Team6Map = window.Team6Map || {};

  const NEUTRAL_FILL = "#e8eef5";
  const NO_DATA_FILL = "#c4ccd6";
  // One entry per state-level layer (keys match the data-layer buttons).
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
    },
    electricity: {
      file: "data/state-electricity-per-capita.csv",
      colors: ["#fffbd6", "#fde68a", "#facc15", "#a16207"],
      value: d => d.mwh_per_person,
      // The newest year is estimated from partial-year EIA sales.
      legendLabel: (year, row) => row?.is_estimate
        ? `MWh of electricity per person (${year} est. from year-to-date)`
        : `MWh of electricity per person (${year}, EIA)`,
      formatBreak: d3.format(",.1f"),
      // Shown under the legend only for estimated years.
      legendNote: (year, row) => row?.is_estimate
        ? `${year} is an estimate. EIA publishes full-year electricity sales only ` +
          `after a year ends, and ${year} is so far reported through ${row.ytd_through}. ` +
          `We scaled each state's ${year - 1} total by how its January–${row.ytd_through} ` +
          `${year} sales compared with the same months of ${year - 1}. ` +
          `Per-person values use ${row.population_year} population, the latest Census estimate.`
        : "",
      tooltip: (d, year) =>
        `${d.state}\n` +
        `${d3.format(",.1f")(d.mwh_per_person)} MWh per person\n` +
        `Retail sales ${d3.format(",.0f")(d.sales_mwh / 1e6)} million MWh (${year}${d.is_estimate ? " est." : ""})\n` +
        `Population ${d.population.toLocaleString()} (${d.population_year} est.)` +
        (d.is_estimate ? `\nEstimated from Jan–${d.ytd_through} sales` : ""),
      parse: d => ({
        state: d.state,
        year: Number(d.year),
        sales_mwh: Number(d.sales_mwh),
        population: Number(d.population),
        population_year: Number(d.population_year),
        mwh_per_person: Number(d.mwh_per_person),
        is_estimate: d.is_estimate === "1",
        ytd_through: d.ytd_through
      })
    },
    poverty: {
      file: "data/state-poverty-rate.csv",
      colors: ["#fee5d9", "#fcae91", "#fb6a4a", "#cb181d"],
      value: d => d.poverty_rate,
      legendLabel: year => `Percent of people in poverty (${year} Census SAIPE)`,
      formatBreak: d => `${d3.format(".1f")(d)}%`,
      // SAIPE is released about a year after the fact, so later slider
      // years show the newest estimate and say so.
      legendNote: (year, row, requestedYear) => requestedYear > year
        ? `Showing ${year}, the latest available. The Census Bureau releases each ` +
          `year's state poverty estimates about a year later (usually in December), ` +
          `so ${year + 1}${requestedYear > year + 1 ? ` and ${requestedYear}` : ""} ` +
          `${requestedYear > year + 1 ? "are" : "is"} not published yet.`
        : "",
      tooltip: (d, year) =>
        `${d.state}\n` +
        `${d3.format(".1f")(d.poverty_rate)}% of people in poverty (${year})\n` +
        `90% confidence interval: ${d.rate_ci_low}–${d.rate_ci_high}%\n` +
        `${d.people_in_poverty.toLocaleString()} people`,
      parse: d => ({
        state: d.state,
        year: Number(d.year),
        people_in_poverty: Number(d.people_in_poverty),
        poverty_rate: Number(d.poverty_rate),
        rate_ci_low: Number(d.rate_ci_low),
        rate_ci_high: Number(d.rate_ci_high)
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
    const legendNote = document.querySelector("#color-legend-note");
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

    function setLegend(config, color, year, rowsByState, requestedYear) {
      const sampleRow = rowsByState.values().next().value;
      if (legendLabel) legendLabel.textContent = config.legendLabel(year, sampleRow);
      if (legendNote) {
        const note = config.legendNote?.(year, sampleRow, requestedYear) || "";
        legendNote.textContent = note;
        legendNote.hidden = !note;
      }
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
      if (legendNote) legendNote.hidden = true;
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
      const requestedYear = Number(state.year);
      const year = Math.max(years[0], Math.min(years.at(-1), requestedYear));
      if (current.key === key && current.requestedYear === requestedYear) return;

      const config = LAYERS[key];
      const rowsByState = new Map(
        [...byYear.get(year)].map(([name, rows]) => [name, rows[0]])
      );
      current = { key, year, requestedYear, rowsByState, config };

      setLegend(config, color, year, rowsByState, requestedYear);
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
