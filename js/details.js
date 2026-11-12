// Detail-view module boundary. Grant can render each Anthropic chart independently.
(() => {
  "use strict";

  const app = window.Team6App;

  app.views.details = {
    init() {
      const messages = {
        "#tile-map-view": "State tile map container ready for Claude usage per capita.",
        "#treemap-view": "Treemap container ready for topic data.",
        "#pie-view": "Pie-chart container ready for use-category data.",
        "#scatter-view": "Scatterplot container ready for state comparisons.",
        "#model-line-one": "First related trend line will appear here.",
        "#model-line-two": "Second related trend line will appear here."
      };

      Object.entries(messages).forEach(([selector, message]) => {
        document.querySelector(selector).innerHTML = `<p class="empty-view-message">${message}</p>`;
      });

      app.subscribe(renderSelection);
      renderSelection(app.getState());
    }
  };

  function renderSelection(state) {
    const selection = document.querySelector("#selected-states");
    selection.textContent = state.selectedStates.length
      ? state.selectedStates.join(", ")
      : "None selected";
  }
})();
