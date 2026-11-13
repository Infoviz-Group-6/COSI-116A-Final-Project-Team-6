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

  function bindForm() {
    const form = document.querySelector("#city-search");
    const status = document.querySelector("#city-search-status");
    const submitButton = form.querySelector("button[type='submit']");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
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
