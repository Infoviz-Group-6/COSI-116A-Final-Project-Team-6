(() => {
  "use strict";

  function Treemap(data, {
    selectedState = "USA",
    state = d => d.state,
    label = d => d.artifact,
    value = d => +d.value,
    width = 1154,
    height = 700,
    titleHeight = 36,
    tile = d3.treemapSquarify,
    paddingInner = 2,
    paddingOuter = 2,
    colors = d3.schemeTableau10
  } = {}) {
    const filteredData = selectedState === "USA"
      ? data
      : data.filter(d => state(d) === selectedState);

    const rolledUp = d3.rollup(
      filteredData,
      v => d3.sum(v, value),
      label
    );

    const root = d3.hierarchy(rolledUp)
      .sum(([, val]) => (typeof val === "number" ? Math.max(0, val) : 0))
      .sort((a, b) => b.value - a.value);

    d3.treemap()
      .tile(tile)
      .size([width, height - titleHeight])
      .paddingInner(paddingInner)
      .paddingOuter(paddingOuter)
      .round(true)(root);

    const allArtifacts = Array.from(new Set(data.map(label))).sort();
    const color = d3.scaleOrdinal(allArtifacts, colors);

    const svg = d3.create("svg")
      .attr("viewBox", [0, 0, width, height])
      .attr("width", width)
      .attr("height", height)
      .attr("style", "max-width: 100%; height: auto; font: 11px sans-serif;");

    svg.append("text")
      .attr("x", paddingOuter + 2)
      .attr("y", titleHeight / 2 + 6)
      .attr("font-size", "18px")
      .attr("font-weight", "bold")
      .attr("fill", "#111")
      .text(`${selectedState} — Artifact Breakdown`);

    const format = d3.format(",.2~f");

    const leaf = svg.append("g")
      .attr("transform", `translate(0,${titleHeight})`)
      .selectAll("g")
      .data(root.leaves())
      .join("g")
      .attr("transform", d => `translate(${d.x0},${d.y0})`);

    leaf.append("title")
      .text(d => `${selectedState}\n${d.data[0]}: ${format(d.value)}`);

    leaf.append("rect")
      .attr("id", (d, i) => (d.leafUid = `leaf-${i}`))
      .attr("fill", d => color(d.data[0]))
      .attr("fill-opacity", 0.8)
      .attr("width", d => Math.max(0, d.x1 - d.x0))
      .attr("height", d => Math.max(0, d.y1 - d.y0));

    leaf.append("clipPath")
      .attr("id", (d, i) => (d.clipUid = `clip-${i}`))
      .append("use")
      .attr("xlink:href", d => `#${d.leafUid}`);

    leaf.append("text")
      .attr("clip-path", d => `url(#${d.clipUid})`)
      .selectAll("tspan")
      .data(d => [d.data[0], format(d.value)])
      .join("tspan")
      .attr("x", 5)
      .attr("y", (d, i, nodes) => `${(i === nodes.length - 1) * 0.3 + 1.2 + i * 1.0}em`)
      .attr("font-weight", (d, i) => (i === 0 ? "600" : "normal"))
      .attr("fill-opacity", (d, i, nodes) => (i === nodes.length - 1 ? 0.75 : null))
      .text(d => d);

    return Object.assign(svg.node(), { scales: { color } });
  }

  window.Treemap = Treemap;
})();