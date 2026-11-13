
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
        const [us, rawCenters, rawTimelines] =
          await Promise.all([
            d3.json("data/us-states.topojson"),
            d3.csv("data/epoch-us-geocoded.csv"),
            d3.csv("data/epoch-data-center-timelines.csv")
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
        const stateLayer = svg
          .append("g")
          .attr("class", "state-layer");

        const centerLayer = svg
          .append("g")
          .attr("class", "data-center-layer");

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
              position: projection([longitude, latitude])
            };
          })
          .filter(d => d.position !== null);

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

        // 7. Create hover tooltip
        const tooltip = container
          .append("div")
          .attr("class", "dc-tooltip")
          .style("display", "none");

        function moveTooltip(event) {
          const mapNode = container.node();
          const tipNode = tooltip.node();

          const [x, y] = d3.pointer(event, mapNode);
          const padding = 8;

          const left = Math.max(
            padding,
            Math.min(
              x + 12,
              mapNode.clientWidth - tipNode.offsetWidth - padding
            )
          );

          const top = Math.max(
            padding,
            Math.min(
              y + 12,
              mapNode.clientHeight - tipNode.offsetHeight - padding
            )
          );

          tooltip
            .style("left", `${left}px`)
            .style("top", `${top}px`);
        }

        // 8. Display facilities for the selected year
        function renderYear(year) {
          const cutoff = `${year}-12-31`;

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
            .attr("r", d => circleRadius(d.power))
            .attr("fill", d =>
              d.power === 0
                ? "white"
                : "rgba(34, 87, 214, 0.30)"
            )
            .attr("stroke", "#263348")
            .attr("stroke-width", 2)
            .style("cursor", "pointer")

            .on("pointerenter", (event, d) => {
              tooltip
                .text(
                  `${d.name}\n` +
                  `Owner: ${d.owner || "Not listed"}\n` +
                  `Estimated IT power: ${d.power.toLocaleString()} MW\n` +
                  `Record date: ${d.date}`
                )
                .style("display", "block");

              moveTooltip(event);
            })

            .on("pointermove", moveTooltip)

            .on("pointerleave", () => {
              tooltip.style("display", "none");
            });

          tooltip.style("display", "none");

          console.log(
            `Year ${year}: ${visible.length} Epoch centers displayed`
          );
        }

        // 9. Initial render
        renderYear(Number(app.getState().year));

        // 10. React to the existing time slider
        app.subscribe(state => {
          renderYear(Number(state.year));
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
