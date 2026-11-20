// =============================================================================
// map-scale-bar.js — scale bar in miles for the main map's bottom-left corner
// =============================================================================
// Drawn inside the map SVG but outside the zoom layer, so it stays put while
// the map pans. On every zoom, js/map.js calls update(k) and the bar picks a
// round distance (1, 2, 5, 10, 20, 50, ... miles) that fits and resizes itself.
//
// The map projection (Albers) is not the same scale everywhere, so the bar is
// measured at the middle of the contiguous U.S. It does not apply to the
// Alaska and Hawaii insets, which are drawn at different scales.
// Styles are in styles/map-layout.css (.map-scale-bar*).
// =============================================================================
(() => {
  "use strict";

  const map = window.Team6Map = window.Team6Map || {};

  const EARTH_RADIUS_MILES = 3958.8;
  const MAX_BAR = 120; // longest the bar may be, in SVG units
  const MARGIN = 20;   // distance from the map's left and bottom edges

  map.createScaleBar = ({ svg, projection, height }) => {
    // Miles per SVG unit at zoom 1, measured across one degree of longitude
    // near the center of the lower 48.
    const a = [-98, 39];
    const b = [-97, 39];
    const [ax, ay] = projection(a);
    const [bx, by] = projection(b);
    const miles = d3.geoDistance(a, b) * EARTH_RADIUS_MILES;
    const milesPerUnit = miles / Math.hypot(bx - ax, by - ay);

    const group = svg.append("g")
      .attr("class", "map-scale-bar")
      .attr("aria-hidden", "true")
      .attr("transform", `translate(${MARGIN}, ${height - MARGIN})`);

    const bg = group.append("rect").attr("class", "map-scale-bar__bg");
    // A bar with short end ticks: |______|
    const line = group.append("path").attr("class", "map-scale-bar__line");
    const label = group.append("text")
      .attr("class", "map-scale-bar__label")
      .attr("x", 0)
      .attr("y", -10);

    // Largest 1/2/5 x 10^n value that is <= max.
    function niceDistance(max) {
      const power = 10 ** Math.floor(Math.log10(max));
      const step = [5, 2, 1].find(s => s * power <= max) ?? 1;
      return step * power;
    }

    function update(k = 1) {
      const unitMiles = milesPerUnit / k; // miles per SVG unit at this zoom
      const distance = niceDistance(MAX_BAR * unitMiles);
      const length = distance / unitMiles;

      line.attr("d", `M0,-6 V0 H${length} V-6`);
      label.text(`${distance.toLocaleString()} mi`);

      // Light backing so the bar stays readable over the map.
      const textWidth = label.node().getBBox?.().width ?? 0;
      bg.attr("x", -6)
        .attr("y", -28)
        .attr("width", Math.max(length, textWidth) + 12)
        .attr("height", 34);
    }

    update(1);
    return { update };
  };
})();
