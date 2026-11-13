// Timeline module boundary. This will later update the shared year selection.
(() => {
  "use strict";

  const app = window.Team6App;

  app.views.timeline = {
    init() {
      const container = document.querySelector("#timeline-view");
      const modelReleaseView = document.querySelector("#model-release-view");

      container.innerHTML = `
        <div class="timeline-control">
          <p id="timeline-current" class="timeline-current">Showing facilities through 2026</p>
          <input id="year-slider" type="range" min="2023" max="2026" step="1" value="2026" aria-label="Data-center year">
          <div class="timeline-labels"><span>2023</span><span>2024</span><span>2025</span><span>2026</span><span>Today</span></div>
        </div>`;
      modelReleaseView.innerHTML = '<p class="empty-view-message">Developer release lanes will appear here.</p>';

      document.querySelector("#year-slider").addEventListener("input", (event) => {
        app.setState({ year: Number(event.target.value) });
      });

      document.querySelector("#expand-models").addEventListener("click", toggleModelPanel);
      document.querySelector("#expand-lines").addEventListener("click", toggleLinePanel);
      app.subscribe(renderYear);
      renderYear(app.getState());
    }
  };

  function renderYear(state) {
    const currentYear = new Date().getFullYear();
    const label = Number(state.year) === currentYear
      ? `Showing facilities through today (${new Date().toISOString().slice(0, 10)})`
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

  function toggleLinePanel(event) {
    const panel = document.querySelector("#line-chart-panel");
    const willOpen = panel.hidden;
    panel.hidden = !willOpen;
    event.currentTarget.setAttribute("aria-expanded", String(willOpen));
    event.currentTarget.textContent = willOpen ? "Hide related trends" : "Show related trends";
  }
})();
