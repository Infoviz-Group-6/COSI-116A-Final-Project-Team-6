(() => {
  "use strict";

  const map = window.Team6Map = window.Team6Map || {};

  map.createTooltip = container => {
    const tooltip = container
      .append("div")
      .attr("class", "dc-tooltip")
      .style("display", "none");

    function position(left, top) {
      const mapNode = container.node();
      const tipNode = tooltip.node();
      const padding = 8;
      const boundedLeft = Math.max(
        padding,
        Math.min(left, mapNode.clientWidth - tipNode.offsetWidth - padding)
      );
      const boundedTop = Math.max(
        padding,
        Math.min(top, mapNode.clientHeight - tipNode.offsetHeight - padding)
      );

      tooltip
        .style("left", `${boundedLeft}px`)
        .style("top", `${boundedTop}px`);
    }

    return {
      show(d) {
        tooltip
          .text(
            `${d.name}\n` +
            `Owner: ${d.owner || "Not listed"}\n` +
            `Estimated IT power: ${d.power.toLocaleString()} MW\n` +
            `Record date: ${d.date}`
          )
          .style("display", "block");
      },
      move(event) {
        const [x, y] = d3.pointer(event, container.node());
        position(x + 12, y + 12);
      },
      focus(element) {
        const mapRect = container.node().getBoundingClientRect();
        const circleRect = element.getBoundingClientRect();
        position(
          circleRect.left - mapRect.left + circleRect.width / 2 + 12,
          circleRect.top - mapRect.top + circleRect.height / 2 + 12
        );
      },
      hide() {
        tooltip.style("display", "none");
      }
    };
  };
})();
