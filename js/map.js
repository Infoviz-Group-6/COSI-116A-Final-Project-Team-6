(() => {
  "use strict";

  const app = window.Team6App;
  const map = window.Team6Map;

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
        const [us, rawCenters, rawTimelines, rawUnmatched] =
          await map.loadData();
        const states = topojson.feature(us, us.objects.states);
        const projection = d3.geoAlbersUsa()
          .fitExtent([[20, 20], [width - 20, height - 20]], states);
        const path = d3.geoPath(projection);

        const zoomLayer = svg.append("g").attr("class", "zoom-layer");
        const stateLayer = zoomLayer.append("g").attr("class", "state-layer");
        const centerLayer = zoomLayer
          .append("g")
          .attr("class", "data-center-layer");
        const searchLayer = zoomLayer
          .append("g")
          .attr("class", "search-layer")
          .style("pointer-events", "none");

        stateLayer
          .selectAll("path")
          .data(states.features)
          .join("path")
          .attr("d", path)
          .attr("fill", "#e8eef5")
          .attr("stroke", "#8798ae")
          .attr("stroke-width", 0.8);

        const tooltip = map.createTooltip(container);
        const choropleth = map.createChoropleth({ stateLayer, tooltip });

        const centers = map.prepareCenters(rawCenters, projection);
        const coverage = document.querySelector("#map-coverage");
        if (coverage) {
          const total = rawCenters.length + rawUnmatched.length;
          coverage.textContent = `${centers.length} of ${total} U.S. facilities have mapped coordinates.`;
        }

        const timelines = map.prepareTimelines(rawTimelines);
        const zoom = map.createZoomController({
          container,
          svg,
          zoomLayer,
          centerLayer,
          searchLayer,
          width,
          height
        });
        let visibleCenters = [];
        let zoomedState = null;

        // Click a state to fit it in view; click the same state again to reset.
        stateLayer
          .selectAll("path")
          .style("cursor", "pointer")
          // Bring the hovered state to the front so its whole outline shows.
          .on("pointerenter.highlight", event => d3.select(event.currentTarget).raise())
          .on("click", (event, feature) => {
            // The scale check covers zooming out by other means (Reset, scroll).
            if (zoomedState === feature && zoom.getScale() > 1) {
              zoomedState = null;
              zoom.resetZoom();
            } else {
              zoomedState = feature;
              zoom.zoomToPoints(path.bounds(feature), 8);
            }
          });

        // Center the clicked facility; never zoom back out if already closer.
        function zoomToCenter(center) {
          zoomedState = null;
          zoom.zoomToPoints([center.position], Math.max(6, zoom.getScale()));
        }

        function renderYear(year) {
          const selectedYear = Number(year);
          const today = new Date();
          const cutoff = selectedYear === today.getFullYear()
            ? [
                today.getFullYear(),
                String(today.getMonth() + 1).padStart(2, "0"),
                String(today.getDate()).padStart(2, "0")
              ].join("-")
            : `${selectedYear}-12-31`;

          const visible = centers.flatMap(center => {
            const records = timelines.get(map.normalizeName(center.name)) || [];
            const latest = records
              .filter(d => d.date <= cutoff && d.power !== null)
              .at(-1);
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
            .attr("r", d => map.circleRadius(d.power) / zoom.getScale())
            .attr("fill", d => d.power === 0
              ? "white"
              : "rgba(34, 87, 214, 0.30)")
            .attr("stroke", "#263348")
            .attr("stroke-width", 2)
            .attr("tabindex", 0)
            .attr("role", "img")
            .attr("aria-label", d =>
              `${d.name}, ${d.power.toLocaleString()} megawatts estimated IT power, record date ${d.date}`
            )
            .style("cursor", "pointer")
            .on("pointerenter", (event, d) => {
              d3.select(event.currentTarget).raise();
              tooltip.show(d);
              tooltip.move(event);
            })
            .on("pointermove", event => tooltip.move(event))
            .on("pointerleave", () => tooltip.hide())
            .on("focus", (event, d) => {
              tooltip.show(d);
              tooltip.focus(event.currentTarget);
            })
            .on("blur", () => tooltip.hide())
            .on("click", (event, d) => zoomToCenter(d))
            .on("keydown", (event, d) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                zoomToCenter(d);
              }
            });

          tooltip.hide();
          visibleCenters = visible;
          console.log(`Year ${year}: ${visible.length} Epoch centers displayed`);
        }

        const search = map.createSearchRenderer({
          app,
          projection,
          searchLayer,
          centerLayer,
          status: d3.select("#city-search-status"),
          zoom,
          getVisibleCenters: () => visibleCenters
        });

        renderYear(Number(app.getState().year));
        choropleth.render(app.getState());
        search(app.getState());
        app.subscribe(state => {
          renderYear(Number(state.year));
          choropleth.render(state);
          search(state);
        });

        console.log(`Loaded ${centers.length} geocoded US data centers`);
      } catch (error) {
        console.error("Map error:", error);
        container.append("p").text("Could not load map data.");
      }
    }
  };
})();
