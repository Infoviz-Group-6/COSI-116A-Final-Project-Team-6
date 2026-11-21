// =============================================================================
// map-choropleth.js — state-level color layers for the main map
// =============================================================================
// What this adds:
//   When the user clicks Population, Electricity usage, or Poverty in the
//   filter rail, every state on the main map is filled with a color showing
//   that layer's value for the year on the timeline slider. Data-center
//   circles stay on top. Turning the layer off returns states to neutral gray.
//
// How it fits in:
//   - js/visualization.js turns the layer buttons into `Team6App` state
//     (`state.layer`), and js/map.js calls `choropleth.render(state)` on every
//     state change.
//   - Data comes from small preprocessed CSVs in data/, built by the Python
//     scripts in scripts/ (build_population_density.py,
//     build_electricity_per_capita.py, build_poverty_rate.py).
//   - js/map-small-multiples.js reuses LAYERS, loadChoroplethLayer, and
//     choroplethRowsForYear from this file, so both views share one copy of
//     the data and identical colors.
//
// To add another layer, add an entry to LAYERS whose key matches the
// button's data-layer attribute in index.html. Nothing else needs to change.
// =============================================================================
(() => {
  "use strict";

  // All map modules hang their helpers off one shared namespace object.
  const map = window.Team6Map = window.Team6Map || {};

  const NEUTRAL_FILL = "#e8eef5"; // state color when no layer is selected
  const NO_DATA_FILL = "#808080"; // state color when a layer has no value for it

  const STATE_ABBR_TO_NAME = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
    FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
    IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
    ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
    MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
    NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
    NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
    PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
    TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
    WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming"
  };

  // ---------------------------------------------------------------------------
  // Layer registry: one entry per state-level layer.
  // ---------------------------------------------------------------------------
  // Each entry describes everything that differs between layers:
  //   title        short name used as the small-multiple heading
  //   file         CSV to load (one row per state per year)
  //   colors       four colors, light to dark, one per class (quartile)
  //   value        which number to color by
  //   legendLabel  text above the legend ramp; (year, sampleRow) => string
  //   legendNote   optional explanation under the legend; empty string hides it
  //   formatBreak  formats the class break values shown under the ramp
  //   formatValue  one-line value used in the small-multiples tooltip
  //   tooltip      multi-line text shown when hovering a state on the main map
  //   parse        converts a CSV row (all strings) into typed values
  const LAYERS = {
    // People per square mile of land. Census Vintage 2025 population
    // estimates (2020–2025) divided by 2024 Gazetteer land area.
    population: {
      title: "Population density",
      file: "data/state-population-density.csv",
      colors: ["#edf8e9", "#bae4b3", "#74c476", "#238b45"], // greens
      value: d => d.density_per_sq_mi,
      legendLabel: year => `People per sq mi of land (${year} Census est.)`,
      formatBreak: d3.format(",.0f"),
      formatValue: d => `${d3.format(",.0f")(d.density_per_sq_mi)} people per sq mi`,
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

    // Megawatt-hours of retail electricity sold per resident. EIA sales
    // (2023–2025 official, 2026 estimated from year-to-date) divided by
    // Census population.
    electricity: {
      title: "Electricity use",
      file: "data/state-electricity-per-capita.csv",
      colors: ["#fffbd6", "#fde68a", "#facc15", "#a16207"], // yellows
      value: d => d.mwh_per_person,
      // The newest year is estimated from partial-year EIA sales.
      legendLabel: (year, row) => row?.is_estimate
        ? `MWh of electricity per person (${year} est. from year-to-date)`
        : `MWh of electricity per person (${year}, EIA)`,
      formatBreak: d3.format(",.1f"),
      formatValue: d => `${d3.format(",.1f")(d.mwh_per_person)} MWh per person`,
      // Shown under the legend only for estimated years. The month comes from
      // the CSV's ytd_through column, so the note stays correct when the EIA
      // file is refreshed and the script rerun.
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

    // Percent of people below the poverty line, from Census SAIPE
    // (Small Area Income and Poverty Estimates), 2023–2024.
    poverty: {
      title: "Poverty rate",
      file: "data/state-poverty-rate.csv",
      colors: ["#fee5d9", "#fcae91", "#fb6a4a", "#cb181d"], // reds
      value: d => d.poverty_rate,
      legendLabel: year => `Percent of people in poverty (${year} Census SAIPE)`,
      formatBreak: d => `${d3.format(".1f")(d)}%`,
      formatValue: d => `${d3.format(".1f")(d.poverty_rate)}% in poverty`,
      // SAIPE is released about a year after the fact, so later slider
      // years show the newest estimate and say so. `requestedYear` is the
      // slider year; `year` is the data year actually shown.
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
    },

    // Percent of nationwide Claude usage (from Anthropic-Usage-pct-aggregated.csv,
    // where value is averaged over the two reported months
    usage: {
      title: "Usage percentage",
      file: "data/Anthropic-Usage-pct-aggregated.csv",
      colors: ["#f3e8ff", "#c084fc", "#9333ea", "#581c87"], // purples
      value: d => d.usage_pct,
      legendLabel: () => "Share of nationwide Claude usage (%)",
      legendNote: () => "",
      formatBreak: d => `${d3.format(".2f")(d)}%`,
      formatValue: d => `${d3.format(".2f")(d.usage_pct)}% of usage`,
      tooltip: (d) =>
        `${d.state}\n` +
        `${d3.format(".2f")(d.usage_pct)}% of nationwide Claude usage\n` +
        `Percentages are averaged over usage data from April 2026 - May 2026`,
      parse: d => {
        const abbr = String(d.geo_id || "").replace(/^US-/, "");
        return {
          state: STATE_ABBR_TO_NAME[abbr] || abbr,
          year: 2026,
          usage_pct: Number(d.value) / 2
        };
      }
    }
  };

  // Exposed so other modules can tell which layers are choropleths
  // (visualization.js uses this to leave the legend label to this file).
  map.choroplethLayers = LAYERS;

  // ---------------------------------------------------------------------------
  // Shared data helpers (used here and by js/map-small-multiples.js)
  // ---------------------------------------------------------------------------

  // Loads a layer's CSV once and caches the promise, so the main map and the
  // small multiples never download the same file twice.
  //
  // The color scale is a quantile scale: it splits all values into four
  // equal-sized groups (quartiles), one color each. Quartiles keep skewed data
  // readable (e.g. Alaska ~1 person/sq mi vs. DC ~11,000), where a linear scale
  // would make nearly every state the same color. The breaks are computed from
  // ALL years together, not per year, so moving the slider shows real change
  // over time rather than states being re-ranked each year.
  const cache = new Map();
  map.loadChoroplethLayer = key => {
    if (!cache.has(key)) {
      const config = LAYERS[key];
      cache.set(key, d3.csv(config.file, config.parse).then(rows => {
        // byYear: Map<year, Map<stateName, [row]>>
        const byYear = d3.group(rows, d => d.year, d => d.state);
        const years = [...byYear.keys()].sort(d3.ascending);
        const color = d3.scaleQuantile()
          .domain(rows.map(config.value))
          .range(config.colors);
        return { byYear, years, color };
      }));
    }
    return cache.get(key);
  };

  // Each layer covers different years (population 2020–2025, electricity
  // 2023–2026, poverty 2023–2024), while the slider runs 2023–2026. This clamps
  // the slider year into the layer's range (e.g. slider 2026 -> poverty 2024)
  // and returns that year's rows keyed by state name for quick lookup.
  map.choroplethRowsForYear = ({ byYear, years }, requestedYear) => {
    const year = Math.max(years[0], Math.min(years.at(-1), Number(requestedYear)));
    const rowsByState = new Map(
      [...byYear.get(year)].map(([name, rows]) => [name, rows[0]])
    );
    return { year, rowsByState };
  };

  // ---------------------------------------------------------------------------
  // Main-map choropleth
  // ---------------------------------------------------------------------------
  // Called once from js/map.js after the state paths are drawn.
  //   stateLayer  d3 selection of the <g> holding one <path> per state
  //   tooltip     the map tooltip from js/map-tooltip.js (uses showText/move/hide)
  // Returns { render(state) }, which map.js calls on every app state change.
  map.createChoropleth = ({ stateLayer, tooltip }) => {
    // Legend elements live in index.html (#color-legend). Visibility of the
    // whole legend is handled by visualization.js; this file fills its contents.
    const legendLabel = document.querySelector("#color-legend-label");
    const rampLabels = document.querySelector(".color-ramp-labels");
    const defaultRampLabels = rampLabels ? rampLabels.innerHTML : ""; // "Lower / Higher"
    const rampSwatches = document.querySelectorAll(".color-ramp span");
    const legendNote = document.querySelector("#color-legend-note");

    // What is currently drawn. Lets render() skip work when nothing changed
    // and lets the hover tooltip find the row for a state.
    let current = { key: null, year: null, rowsByState: null, config: null };

    // Data loads are async. If the user clicks quickly, an older render could
    // finish after a newer one; each render takes a token, and a render whose
    // token is no longer the latest gives up instead of drawing stale colors.
    let renderToken = 0;

    // Fills the legend for the active layer: label text, optional note,
    // swatch colors, and the actual break values under each swatch
    // (e.g. "< 46", "46–109", "109–229", "> 229").
    function setLegend(config, color, year, rowsByState, requestedYear) {
      const sampleRow = rowsByState.values().next().value;
      if (legendLabel) legendLabel.textContent = config.legendLabel(year, sampleRow);
      if (legendNote) {
        const note = config.legendNote?.(year, sampleRow, requestedYear) || "";
        legendNote.textContent = note;
        legendNote.hidden = !note;
      }
      // Inline styles override the default blue swatches from map-layout.css.
      rampSwatches.forEach((swatch, i) => {
        swatch.style.background = config.colors[i];
      });
      if (!rampLabels) return;
      // quantiles() returns the three cut points between the four classes.
      const [b1, b2, b3] = color.quantiles().map(config.formatBreak);
      rampLabels.classList.add("color-ramp-labels--classes"); // 4-column grid
      rampLabels.innerHTML = "";
      [`< ${b1}`, `${b1}–${b2}`, `${b2}–${b3}`, `> ${b3}`].forEach(text => {
        rampLabels.append(Object.assign(document.createElement("span"), { textContent: text }));
      });
    }

    // Restores the legend to its original look when no layer is selected.
    function resetLegend() {
      rampSwatches.forEach(swatch => swatch.style.removeProperty("background"));
      if (legendNote) legendNote.hidden = true;
      if (!rampLabels) return;
      rampLabels.classList.remove("color-ramp-labels--classes");
      rampLabels.innerHTML = defaultRampLabels;
    }

    // State hover tooltip. The ".choropleth" namespace keeps these handlers
    // separate from the ".highlight" and click handlers map.js adds to the
    // same paths. Tooltips only show while a layer is active.
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

    // Redraws state colors for the given app state ({ layer, year, ... }).
    async function render(state) {
      // Non-choropleth layers (e.g. "claude") and null both mean "no colors".
      const key = LAYERS[state.layer] ? state.layer : null;
      const token = ++renderToken;

      if (!key) {
        if (current.key === null) return; // already neutral
        current = { key: null, year: null, rowsByState: null, config: null };
        resetLegend();
        stateLayer.selectAll("path")
          .transition().duration(400)
          .attr("fill", NEUTRAL_FILL);
        return;
      }

      const layer = await map.loadChoroplethLayer(key);
      if (token !== renderToken) return; // a newer state change won

      // Skip if the same layer and slider year are already drawn. This runs
      // on every app state change (e.g. city search), so this check matters.
      // It compares the slider year rather than the data year so the legend
      // note still updates when, say, 2024 -> 2025 both show 2024 poverty data.
      const requestedYear = Number(state.year);
      if (current.key === key && current.requestedYear === requestedYear) return;

      const config = LAYERS[key];
      const { color } = layer;
      const { year, rowsByState } = map.choroplethRowsForYear(layer, requestedYear);
      current = { key, year, requestedYear, rowsByState, config };

      setLegend(config, color, year, rowsByState, requestedYear);

      // States are matched to CSV rows by full name (feature.properties.name
      // in us-states.topojson matches the "state" column in every CSV).
      // Territories in the TopoJSON have no row and get the no-data color.
      stateLayer.selectAll("path")
        .transition().duration(400)
        .attr("fill", feature => {
          const row = rowsByState.get(feature.properties.name);
          return row ? color(config.value(row)) : NO_DATA_FILL;
        });
    }

    return {
      // Fire-and-forget wrapper so callers don't need to handle the promise.
      render(state) {
        render(state).catch(error => console.error("Choropleth error:", error));
      }
    };
  };
})();
