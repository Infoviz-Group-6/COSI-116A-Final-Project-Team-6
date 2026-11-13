(() => {
  "use strict";

  const map = window.Team6Map = window.Team6Map || {};

  map.createZoomController = ({
    container,
    svg,
    zoomLayer,
    centerLayer,
    searchLayer,
    width,
    height
  }) => {
    let zoomScale = 1;

    function applyZoomScale() {
      const k = zoomScale;

      centerLayer
        .selectAll("circle")
        .attr("r", d => map.circleRadius(d.power) / k);

      searchLayer
        .selectAll(".search-city-marker")
        .attr("r", 6 / k);

      searchLayer
        .selectAll(".search-distance-label")
        .attr("y", d => d.y - 8 / k)
        .style("font-size", `${14 / k}px`);
    }

    const zoom = d3.zoom()
      .scaleExtent([1, 12])
      .translateExtent([[0, 0], [width, height]])
      .on("zoom", event => {
        zoomLayer.attr("transform", event.transform);
        zoomScale = event.transform.k;
        applyZoomScale();
      });

    svg.call(zoom);

    function zoomToPoints(points, maxScale = 6) {
      const [[x0, y0], [x1, y1]] = [
        [d3.min(points, p => p[0]), d3.min(points, p => p[1])],
        [d3.max(points, p => p[0]), d3.max(points, p => p[1])]
      ];
      const padding = 80;
      const k = Math.max(1, Math.min(
        maxScale,
        (width - 2 * padding) / Math.max(x1 - x0, 1),
        (height - 2 * padding) / Math.max(y1 - y0, 1)
      ));
      const transform = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(k)
        .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);

      const clamped = zoom.constrain()(
        transform,
        [[0, 0], [width, height]],
        zoom.translateExtent()
      );

      svg.transition().duration(900).call(zoom.transform, clamped);
    }

    function resetZoom() {
      svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
    }

    const zoomControls = container
      .append("div")
      .attr("class", "map-zoom-controls");

    zoomControls.append("button")
      .attr("type", "button")
      .attr("aria-label", "Zoom in")
      .text("+")
      .on("click", () => svg.transition().duration(300).call(zoom.scaleBy, 1.6));

    zoomControls.append("button")
      .attr("type", "button")
      .attr("aria-label", "Zoom out")
      .text("−")
      .on("click", () => svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.6));

    zoomControls.append("button")
      .attr("type", "button")
      .attr("aria-label", "Reset zoom")
      .text("Reset")
      .on("click", resetZoom);

    return {
      getScale: () => zoomScale,
      zoomToPoints,
      resetZoom
    };
  };
})();
