// A small shared state store connects controls, the map, timeline, and detail charts.
(() => {
  "use strict";

  const listeners = new Set();
  let state = Object.freeze({
    layer: null,
    year: 2026,
    selectedStates: [],
    selectedFacility: null,
    searchQuery: ""
  });

  window.Team6App = {
    views: {},

    getState() {
      return state;
    },

    setState(changes) {
      state = Object.freeze({ ...state, ...changes });
      listeners.forEach((listener) => listener(state));
      window.dispatchEvent(new CustomEvent("team6:statechange", { detail: state }));
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
})();
