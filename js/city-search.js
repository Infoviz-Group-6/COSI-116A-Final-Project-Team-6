// City search module: geocodes a typed US city and finds the closest data center.
// The map view draws the result (marker, connector, zoom) from state.searchLocation.
(() => {
  "use strict";

  const app = window.Team6App;

  // Geocodes the typed city with OpenStreetMap Nominatim (US results only).
  async function geocodeCity(query) {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      countrycodes: "us",
      limit: "1"
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Geocoder responded with ${response.status}`);

    const [match] = await response.json();
    if (!match) return null;

    return {
      label: match.display_name,
      latitude: Number(match.lat),
      longitude: Number(match.lon)
    };
  }

  // Great-circle (haversine) distance in miles
  function distanceMiles(lat1, lon1, lat2, lon2) {
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
    return 3958.8 * 2 * Math.asin(Math.sqrt(a));
  }

  // Returns { center, miles } for the closest center to location, or undefined.
  // Each center needs latitude and longitude fields.
  function findNearest(location, centers) {
    return d3.least(
      centers.map(center => ({
        center,
        miles: distanceMiles(
          location.latitude, location.longitude,
          center.latitude, center.longitude
        )
      })),
      d => d.miles
    );
  }

  // As-you-type city suggestions from Photon (OpenStreetMap data, built for autocomplete).
  // Nominatim's usage policy forbids autocomplete, so it is only used on submit.
  const MAX_SUGGESTIONS = 6;

  async function fetchSuggestions(query, signal) {
    const params = new URLSearchParams({
      q: query,
      limit: "10",
      lang: "en",
      // Rough bounding box around the US, including Alaska and Hawaii
      bbox: "-171,18,-66,72"
    });
    ["place:city", "place:town", "place:village"].forEach(tag => params.append("osm_tag", tag));

    const response = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
    if (!response.ok) throw new Error(`Suggestion service responded with ${response.status}`);

    const { features = [] } = await response.json();
    const seen = new Set();
    const suggestions = [];

    for (const { properties, geometry } of features) {
      if (properties.countrycode !== "US" || !properties.name) continue;
      const label = properties.state ? `${properties.name}, ${properties.state}` : properties.name;
      if (seen.has(label)) continue;
      seen.add(label);

      const [longitude, latitude] = geometry.coordinates;
      suggestions.push({ label, latitude, longitude });
      if (suggestions.length === MAX_SUGGESTIONS) break;
    }
    return suggestions;
  }

  // Returns a function that cancels any pending suggestion lookup.
  function bindSuggestions(input, list) {
    let items = [];
    let activeIndex = -1;
    let debounceTimer = null;
    let controller = null;

    function cancelPending() {
      clearTimeout(debounceTimer);
      controller?.abort();
      controller = null;
    }

    function close() {
      items = [];
      activeIndex = -1;
      list.replaceChildren();
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }

    function setActive(index) {
      activeIndex = index;
      [...list.children].forEach((li, i) => li.classList.toggle("is-active", i === index));
      if (index >= 0) {
        const li = list.children[index];
        input.setAttribute("aria-activedescendant", li.id);
        li.scrollIntoView({ block: "nearest" });
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    }

    function render(suggestions) {
      // A slow response may arrive after the user has moved on
      if (!suggestions.length || document.activeElement !== input) {
        close();
        return;
      }
      items = suggestions;
      activeIndex = -1;
      list.replaceChildren(...suggestions.map((item, i) => {
        const li = document.createElement("li");
        li.id = `city-suggestion-${i}`;
        li.setAttribute("role", "option");
        li.textContent = item.label;
        // mousedown (not click) so the pick lands before the input blurs
        li.addEventListener("mousedown", event => {
          event.preventDefault();
          choose(item);
        });
        li.addEventListener("mouseenter", () => setActive(i));
        return li;
      }));
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }

    // Coordinates are already known, so skip the Nominatim lookup entirely.
    function choose(item) {
      cancelPending();
      close();
      input.value = item.label;
      app.setState({ searchQuery: item.label, searchLocation: item });
    }

    input.addEventListener("input", () => {
      cancelPending();
      const query = input.value.trim();
      if (query.length < 2) {
        close();
        return;
      }

      debounceTimer = setTimeout(async () => {
        controller = new AbortController();
        try {
          render(await fetchSuggestions(query, controller.signal));
        } catch (error) {
          // Suggestions are optional; a normal submit still works.
          if (error.name !== "AbortError") {
            console.warn("City suggestions unavailable:", error);
            close();
          }
        }
      }, 250);
    });

    input.addEventListener("keydown", event => {
      if (list.hidden) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((activeIndex + 1) % items.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive(activeIndex <= 0 ? items.length - 1 : activeIndex - 1);
      } else if (event.key === "Enter" && activeIndex >= 0) {
        // Pick the highlighted city instead of submitting the raw text
        event.preventDefault();
        choose(items[activeIndex]);
      } else if (event.key === "Escape") {
        // Close the list without clearing the search field
        event.preventDefault();
        cancelPending();
        close();
      }
    });

    input.addEventListener("blur", close);

    return () => {
      cancelPending();
      close();
    };
  }

  function bindForm() {
    const form = document.querySelector("#city-search");
    const status = document.querySelector("#city-search-status");
    const submitButton = form.querySelector("button[type='submit']");
    const dismissSuggestions = bindSuggestions(
      document.querySelector("#city-query"),
      document.querySelector("#city-suggestions")
    );

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      dismissSuggestions();
      const searchQuery = document.querySelector("#city-query").value.trim();

      if (!searchQuery) {
        app.setState({ searchQuery: "", searchLocation: null });
        status.textContent = "Enter a city to find the closest listed data center.";
        return;
      }

      status.textContent = `Searching for ${searchQuery}…`;
      submitButton.disabled = true;

      try {
        const searchLocation = await geocodeCity(searchQuery);
        if (!searchLocation) {
          app.setState({ searchQuery, searchLocation: null });
          status.textContent = `Could not find "${searchQuery}" in the United States. Try "City, ST".`;
          return;
        }
        // The map view writes the closest-facility result into the status line.
        app.setState({ searchQuery, searchLocation });
      } catch (error) {
        console.error("City search error:", error);
        status.textContent = "City lookup failed. Check your connection and try again.";
      } finally {
        submitButton.disabled = false;
      }
    });
  }

  app.views.citySearch = {
    init: bindForm,
    findNearest
  };
})();
