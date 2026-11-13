(() => {
  "use strict";

  const map = window.Team6Map = window.Team6Map || {};

  map.createSearchRenderer = ({
    app,
    projection,
    searchLayer,
    centerLayer,
    status,
    zoom,
    getVisibleCenters
  }) => {
    let lastZoomedLocation = null;

    return state => {
      const location = state.searchLocation;
      searchLayer.selectAll("*").remove();
      centerLayer.selectAll("circle").classed("is-nearest", false);

      if (!location) {
        if (lastZoomedLocation) {
          lastZoomedLocation = null;
          zoom.resetZoom();
        }
        return;
      }

      const cityPoint = projection([location.longitude, location.latitude]);
      const cityName = state.searchQuery || location.label;
      const nearest = app.views.citySearch.findNearest(
        location,
        getVisibleCenters()
      );

      if (!nearest) {
        status.text(
          `No listed data centers are shown for ${state.year}, so there is nothing to compare with ${cityName}.`
        );
      } else {
        const { center, miles } = nearest;
        status.text(
          `Closest data center to ${cityName}: ${center.name}` +
          `${center.owner ? ` (${center.owner})` : ""}, ` +
          `about ${Math.round(miles).toLocaleString()} miles away` +
          `${center.address ? ` in ${center.address}` : ""}.`
        );

        centerLayer
          .selectAll("circle")
          .classed("is-nearest", d => d.name === center.name);

        if (cityPoint) {
          searchLayer
            .append("line")
            .attr("class", "search-connector")
            .attr("x1", cityPoint[0])
            .attr("y1", cityPoint[1])
            .attr("x2", center.position[0])
            .attr("y2", center.position[1]);

          const midpoint = {
            x: (cityPoint[0] + center.position[0]) / 2,
            y: (cityPoint[1] + center.position[1]) / 2
          };

          searchLayer
            .append("text")
            .datum(midpoint)
            .attr("class", "search-distance-label")
            .attr("x", midpoint.x)
            .attr("y", midpoint.y - 8 / zoom.getScale())
            .style("font-size", `${14 / zoom.getScale()}px`)
            .attr("text-anchor", "middle")
            .text(`${Math.round(miles).toLocaleString()} mi`);
        }
      }

      if (cityPoint) {
        searchLayer
          .append("circle")
          .attr("class", "search-city-marker")
          .attr("cx", cityPoint[0])
          .attr("cy", cityPoint[1])
          .attr("r", 6 / zoom.getScale());
      }

      if (location !== lastZoomedLocation) {
        lastZoomedLocation = location;
        if (cityPoint) {
          zoom.zoomToPoints(
            nearest ? [cityPoint, nearest.center.position] : [cityPoint]
          );
        }
      }
    };
  };
})();
