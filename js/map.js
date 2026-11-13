
(() => {
  "use strict";

  const app = window.Team6App;

  app.views.map = {
    async init() {
      const container = d3.select("#map-view");
      container.selectAll("*").remove();

      const width = 960;
      const height = 600;

      const svg = container
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", "US AI data centers");

      try {
        // 1. Load map, center locations, and historical data
        const [us, rawCenters, rawTimelines, rawUnmatched] =
          await Promise.all([
            d3.json("data/us-states.topojson"),
            d3.csv("data/epoch-us-geocoded.csv"),
            d3.csv("data/epoch-data-center-timelines.csv"),
            d3.csv("data/epoch-us-unmatched.csv")
          ]);

        // 2. Prepare US state boundaries
        const states = topojson.feature(
          us,
          us.objects.states
        );

        const projection = d3.geoAlbersUsa()
          .fitExtent(
            [[20, 20], [width - 20, height - 20]],
            states
          );

        const path = d3.geoPath(projection);

        // 3. Keep states and circles in separate layers
        // Everything inside zoomLayer pans and zooms together
        const zoomLayer = svg
          .append("g")
          .attr("class", "zoom-layer");

        const stateLayer = zoomLayer
          .append("g")
          .attr("class", "state-layer");

        const centerLayer = zoomLayer
          .append("g")
          .attr("class", "data-center-layer");

        // City search marker + connector line sit above the circles
        const searchLayer = zoomLayer
          .append("g")
          .attr("class", "search-layer")
          .style("pointer-events", "none");

        // Draw the states
        stateLayer
          .selectAll("path")
          .data(states.features)
          .join("path")
          .attr("d", path)
          .attr("fill", "#e8eef5")
          .attr("stroke", "#8798ae")
          .attr("stroke-width", 0.8);

        // 4. Prepare data-center coordinates
        const centers = rawCenters
          .map(d => {
            const latitude = Number(d.latitude);
            const longitude = Number(d.longitude);

            return {
              name: d.name,
              owner: String(d.owner ?? "")
                .replace(/\s*#(?:confident|likely|uncertain)\b/gi, "")
                .trim(),
              address: d.address,
              latitude,
              longitude,
              position: projection([longitude, latitude])
            };
          })
          .filter(d => d.position !== null);

        const coverage = document.querySelector("#map-coverage");
        if (coverage) {
          const total = rawCenters.length + rawUnmatched.length;
          coverage.textContent = `${centers.length} of ${total} U.S. facilities have mapped coordinates.`;
        }

        // 5. Prepare historical capacity records
        const parsePower = value => {
          const text = String(value ?? "").trim();

          if (!text) return null;

          const number = Number(text);

          return Number.isFinite(number) && number >= 0
            ? number
            : null;
        };

        const normalizeName = name =>
          String(name ?? "").trim().toLowerCase();

        const timelineRecords = rawTimelines
          .filter(d =>
            /^\d{4}-\d{2}-\d{2}$/.test(d["Date"])
          )
          .map(d => ({
            name: normalizeName(d["Data center"]),
            date: d["Date"],
            power: parsePower(d["IT power (MW)"]),
            status: d["Construction status"] || ""
          }));

        const timelines = d3.group(
          timelineRecords,
          d => d.name
        );

        // Sort each facility's records by date
        for (const records of timelines.values()) {
          records.sort((a, b) =>
            a.date.localeCompare(b.date)
          );
        }

        // 6. Size circles based on IT power
        function circleRadius(power) {
          if (power === 0) return 5;
          if (power < 200) return 6;
          if (power <= 800) return 13;
          return 22;
        }

        // Current zoom scale; marks are divided by it so they keep
        // the same on-screen size while the geography grows
        let zoomScale = 1;

        function applyZoomScale() {
          const k = zoomScale;

          centerLayer
            .selectAll("circle")
            .attr("r", d => circleRadius(d.power) / k);

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

        // Smoothly zoom so that every given [x, y] point is in view
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

          // zoom.transform skips the pan limits, so clamp explicitly
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

        // On-map zoom buttons
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

        // 7. Create hover tooltip
        const tooltip = container
          .append("div")
          .attr("class", "dc-tooltip")
          .style("display", "none");

        function positionTooltip(left, top) {
          const mapNode = container.node();
          const tipNode = tooltip.node();
          const padding = 8;

          const boundedLeft = Math.max(
            padding,
            Math.min(
              left,
              mapNode.clientWidth - tipNode.offsetWidth - padding
            )
          );

          const boundedTop = Math.max(
            padding,
            Math.min(
              top,
              mapNode.clientHeight - tipNode.offsetHeight - padding
            )
          );

          tooltip
            .style("left", `${boundedLeft}px`)
            .style("top", `${boundedTop}px`);
        }

        function moveTooltip(event) {
          const [x, y] = d3.pointer(event, container.node());
          positionTooltip(x + 12, y + 12);
        }

        function showTooltip(d) {
          tooltip
            .text(
              `${d.name}\n` +
              `Owner: ${d.owner || "Not listed"}\n` +
              `Estimated IT power: ${d.power.toLocaleString()} MW\n` +
              `Record date: ${d.date}`
            )
            .style("display", "block");
        }

        function positionTooltipForCircle(element) {
          const mapRect = container.node().getBoundingClientRect();
          const circleRect = element.getBoundingClientRect();
          positionTooltip(
            circleRect.left - mapRect.left + circleRect.width / 2 + 12,
            circleRect.top - mapRect.top + circleRect.height / 2 + 12
          );
        }

        // Facilities currently drawn on the map (updated by renderYear)
        let visibleCenters = [];

        // 8. Display facilities for the selected year
        function renderYear(year) {
          const selectedYear = Number(year);
          const today = new Date();
          const currentYear = today.getFullYear();
          const todayISO = today.toISOString().slice(0, 10);
          const cutoff = selectedYear === currentYear
            ? todayISO
            : `${selectedYear}-12-31`;

          const visible = centers.flatMap(center => {
            const records = timelines.get(
              normalizeName(center.name)
            ) || [];

            // Latest known IT power estimate by year-end
            const latest = records
              .filter(d =>
                d.date <= cutoff && d.power !== null
              )
              .at(-1);

            // No historical estimate available yet
            if (!latest) return [];

            return [{
              ...center,
              power: latest.power,
              date: latest.date,
              status: latest.status
            }];
          });

          centerLayer
            .selectAll("circle")
            .data(visible, d => d.name)
            .join("circle")
            .attr("cx", d => d.position[0])
            .attr("cy", d => d.position[1])
            .attr("r", d => circleRadius(d.power) / zoomScale)
            .attr("fill", d =>
              d.power === 0
                ? "white"
                : "rgba(34, 87, 214, 0.30)"
            )
            .attr("stroke", "#263348")
            .attr("stroke-width", 2)
            .attr("tabindex", 0)
            .attr("role", "img")
            .attr("aria-label", d =>
              `${d.name}, ${d.power.toLocaleString()} megawatts estimated IT power, record date ${d.date}`
            )
            .style("cursor", "pointer")

            .on("pointerenter", (event, d) => {
              showTooltip(d);
              moveTooltip(event);
            })

            .on("pointermove", moveTooltip)

            .on("pointerleave", () => {
              tooltip.style("display", "none");
            })

            .on("focus", (event, d) => {
              showTooltip(d);
              positionTooltipForCircle(event.currentTarget);
            })

            .on("blur", () => {
              tooltip.style("display", "none");
            });

          tooltip.style("display", "none");
          visibleCenters = visible;

          console.log(
            `Year ${year}: ${visible.length} Epoch centers displayed`
          );
        }

        // 9. Draw the closest data center to a searched city
        const searchStatus = d3.select("#city-search-status");

        let lastZoomedLocation = null;

        function renderSearch(state) {
          const location = state.searchLocation;
          searchLayer.selectAll("*").remove();
          centerLayer.selectAll("circle").classed("is-nearest", false);

          if (!location) {
            // Search cleared: return to the full US view
            if (lastZoomedLocation) {
              lastZoomedLocation = null;
              resetZoom();
            }
            return;
          }

          const cityPoint = projection([location.longitude, location.latitude]);
          const cityName = state.searchQuery || location.label;

          // Only compare against facilities shown for the selected year
          const nearest = app.views.citySearch.findNearest(location, visibleCenters);

          if (!nearest) {
            searchStatus.text(
              `No listed data centers are shown for ${state.year}, so there is nothing to compare with ${cityName}.`
            );
          } else {
            const { center, miles } = nearest;
            searchStatus.text(
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

              // Distance label at the midpoint of the connector
              const midpoint = {
                x: (cityPoint[0] + center.position[0]) / 2,
                y: (cityPoint[1] + center.position[1]) / 2
              };

              searchLayer
                .append("text")
                .datum(midpoint)
                .attr("class", "search-distance-label")
                .attr("x", midpoint.x)
                .attr("y", midpoint.y - 8 / zoomScale)
                .style("font-size", `${14 / zoomScale}px`)
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
              .attr("r", 6 / zoomScale);
          }

          // Zoom only when a new search arrives, not on year changes
          if (location !== lastZoomedLocation) {
            lastZoomedLocation = location;
            if (cityPoint) {
              zoomToPoints(
                nearest ? [cityPoint, nearest.center.position] : [cityPoint]
              );
            }
          }
        }

        // 10. Initial render
        renderYear(Number(app.getState().year));
        renderSearch(app.getState());

        // 11. React to the time slider and city search
        app.subscribe(state => {
          renderYear(Number(state.year));
          renderSearch(state);
        });

        console.log(
          `Loaded ${centers.length} geocoded US data centers`
        );

      } catch (error) {
        console.error("Map error:", error);

        container
          .append("p")
          .text("Could not load map data.");
      }
    }
  };
})();
