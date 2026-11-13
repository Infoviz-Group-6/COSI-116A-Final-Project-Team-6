(() => {
  "use strict";

  const map = window.Team6Map = window.Team6Map || {};

  map.loadData = () => Promise.all([
    d3.json("data/us-states.topojson"),
    d3.csv("data/epoch-us-geocoded.csv"),
    d3.csv("data/epoch-data-center-timelines.csv"),
    d3.csv("data/epoch-us-unmatched.csv")
  ]);

  map.normalizeName = name => String(name ?? "").trim().toLowerCase();

  map.parsePower = value => {
    const text = String(value ?? "").trim();
    if (!text) return null;

    const number = Number(text);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };

  map.prepareCenters = (rawCenters, projection) => rawCenters
    .map(d => {
      const latitude = Number(d.latitude);
      const longitude = Number(d.longitude);

      return {
        name: d.name,
        owner: String(d.owner ?? "")
          .replace(/\s*#(?:confident|likely|uncertain)\b/gi, "")
          .trim(),
        address: d.address,
        latitude,
        longitude,
        position: projection([longitude, latitude])
      };
    })
    .filter(d => d.position !== null);

  map.prepareTimelines = rawTimelines => {
    const records = rawTimelines
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d["Date"]))
      .map(d => ({
        name: map.normalizeName(d["Data center"]),
        date: d["Date"],
        power: map.parsePower(d["IT power (MW)"]),
        status: d["Construction status"] || ""
      }));

    const timelines = d3.group(records, d => d.name);
    for (const recordsForCenter of timelines.values()) {
      recordsForCenter.sort((a, b) => a.date.localeCompare(b.date));
    }
    return timelines;
  };

  map.circleRadius = power => {
    if (power === 0) return 5;
    if (power < 200) return 6;
    if (power <= 800) return 13;
    return 22;
  };
})();
