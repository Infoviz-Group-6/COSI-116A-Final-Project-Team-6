// Timeline module boundary. This will later update the shared year selection.
(() => {
  "use strict";

  const app = window.Team6App;

  let modelReleaseView;
  let modelReleases = [];
  let showFullHistory = false;
  const MODEL_DISPLAY_START = new Date("2010-01-01T00:00:00Z");

  app.views.timeline = {
    init() {
      const container = document.querySelector("#timeline-view");

      container.innerHTML = `
        <div class="timeline-control">
          <p id="timeline-current" class="timeline-current">Showing facilities through 2026</p>
          <input id="year-slider" type="range" min="2023" max="2026" step="1" value="2026" aria-label="Data-center year">
          <div class="timeline-labels"><span>2023</span><span>2024</span><span>2025</span><span>2026 (today)</span></div>
        </div>`;
      modelReleaseView = document.querySelector("#model-release-view");
      modelReleaseView.innerHTML = '<p class="empty-view-message">Loading developer release lanes...</p>';

      document.querySelector("#year-slider").addEventListener("input", (event) => {
        app.setState({ year: Number(event.target.value) });
      });

      document.querySelector("#expand-models").addEventListener("click", toggleModelPanel);
      document.querySelector("#model-history-toggle").addEventListener("click", toggleModelHistory);
      document.querySelector("#expand-lines").addEventListener("click", toggleLinePanel);
      app.subscribe(renderYear);
      renderYear(app.getState());
      loadModelReleases();
    }
  };

  async function loadModelReleases() {
    try {
      const rows = await d3.csv("data/epoch-notable-models.csv");
      const releases = rows
        .map(row => ({
          model: row.Model?.trim() || "Unnamed model",
          organization: row.Organization?.trim() || "Unreported",
          date: new Date(row["Publication date"]),
          link: row.Link?.trim() || ""
        }))
        .filter(row => Number.isFinite(row.date.getTime()));

      if (!releases.length) {
        throw new Error("No dated model-release records were found.");
      }

      modelReleases = releases;
      renderModelLanes();
    } catch (error) {
      console.error("Could not load model-release data:", error);
      modelReleaseView.innerHTML = '<p class="empty-view-message">Model-release data could not be loaded.</p>';
    }
  }

  function renderModelLanes() {
    const displayedReleases = modelReleases.filter(row =>
      showFullHistory || row.date >= MODEL_DISPLAY_START
    );
    const organizations = selectOrganizations(displayedReleases);

    if (!displayedReleases.length || !organizations.length) {
      modelReleaseView.innerHTML = '<p class="empty-view-message">No model-release records are available for this period.</p>';
      return;
    }

    const margin = { top: 28, right: 24, bottom: 48, left: 150 };
    const width = 1000;
    const rowHeight = 34;
    const height = margin.top + margin.bottom + organizations.length * rowHeight;
    const extent = d3.extent(displayedReleases, row => row.date);
    const x = d3.scaleTime()
      .domain(extent)
      .range([margin.left, width - margin.right]);
    const y = d3.scaleBand()
      .domain(organizations)
      .range([margin.top, height - margin.bottom])
      .padding(0.35);
    const color = d3.scaleOrdinal()
      .domain(organizations)
      .range(d3.schemeTableau10);

    const visible = displayedReleases.filter(row => organizations.includes(row.organization));
    const svg = d3.select(modelReleaseView)
      .html("")
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("role", "img")
      .attr("aria-label", "Notable AI model releases by developer over time");

    svg.append("text")
      .attr("class", "model-lane-note")
      .attr("x", margin.left)
      .attr("y", 16)
      .text(showFullHistory
        ? "Epoch curated records, 1950–2026; early-history and high-count organization labels"
        : "Epoch curated records, 2010 onward; top eight exact organization labels");

    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat("%Y")));

    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).tickSize(0))
      .call(axis => axis.select(".domain").remove());

    svg.append("g")
      .attr("class", "model-release-marks")
      .selectAll("circle")
      .data(visible)
      .join("circle")
      .attr("cx", row => x(row.date))
      .attr("cy", row => y(row.organization) + y.bandwidth() / 2)
      .attr("r", 5)
      .attr("fill", row => color(row.organization))
      .attr("tabindex", 0)
      .attr("role", "img")
      .attr("aria-label", row => `${row.model}, ${row.organization}, ${d3.timeFormat("%Y-%m-%d")(row.date)}`)
      .append("title")
      .text(row => `${row.model}\n${row.organization}\n${d3.timeFormat("%Y-%m-%d")(row.date)}${row.link ? `\n${row.link}` : ""}`);
  }

  function selectOrganizations(releases) {
    const ranked = rows => d3.rollups(
      rows,
      values => values.length,
      row => row.organization
    )
      .sort((a, b) => d3.descending(a[1], b[1]))
      .map(([organization]) => organization);

    const rankedOverall = ranked(releases);
    if (!showFullHistory) return rankedOverall.slice(0, 8);

    const earlyOrganizations = ranked(
      releases.filter(row => row.date < MODEL_DISPLAY_START)
    );
    const selected = [];

    const add = organization => {
      if (!selected.includes(organization) && selected.length < 8) {
        selected.push(organization);
      }
    };

    // Keep early records visible, then fill the remaining lanes by overall count.
    earlyOrganizations.slice(0, 4).forEach(add);
    rankedOverall.forEach(add);
    return selected;
  }

  function renderYear(state) {
    const currentYear = new Date().getFullYear();
    const label = Number(state.year) === currentYear
      ? `Showing facilities through today (${getLocalDate()})`
      : `Showing facilities through ${state.year}`;
    document.querySelector("#timeline-current").textContent = label;
  }

  function toggleModelPanel(event) {
    const panel = document.querySelector("#model-release-panel");
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    event.currentTarget.setAttribute("aria-expanded", String(willOpen));
    event.currentTarget.textContent = willOpen ? "Collapse model releases" : "Expand model releases";
  }

  function toggleModelHistory(event) {
    showFullHistory = !showFullHistory;
    event.currentTarget.setAttribute("aria-pressed", String(showFullHistory));
    event.currentTarget.textContent = showFullHistory
      ? "Show modern period"
      : "Show full history";
    renderModelLanes();
  }

  function toggleLinePanel(event) {
    const panel = document.querySelector("#line-chart-panel");
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    event.currentTarget.setAttribute("aria-expanded", String(willOpen));
    event.currentTarget.textContent = willOpen ? "Hide related trends" : "Show related trends";
  }

  function getLocalDate() {
    const today = new Date();

    return [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, "0"),
      String(today.getDate()).padStart(2, "0")
    ].join("-");
  }
})();
