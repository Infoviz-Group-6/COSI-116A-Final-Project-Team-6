
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

DATA = Path("data")


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def name_key(value):
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def coordinates(feature):
    geometry = feature.get("geometry") or {}

    if geometry.get("type") != "Point":
        return None

    values = geometry.get("coordinates") or []

    if len(values) < 2:
        return None

    try:
        lon, lat = float(values[0]), float(values[1])
    except (TypeError, ValueError):
        return None

    # Broad bounding box including Alaska and Hawaii.
    if not (-180 <= lon <= -60 and 18 <= lat <= 72):
        return None

    return lat, lon


epoch = read_csv(DATA / "epoch-data-centers.csv")
us_centers = [
    row for row in epoch
    if row["Country"].strip() == "United States"
]

existing = {
    name_key(row["name"]): row
    for row in read_csv(DATA / "epoch-us-geocoded.csv")
}

with (DATA / "research/nrg-data-centers.geojson").open() as f:
    features = json.load(f)["features"]

nrg_by_name = defaultdict(list)
epoch_feature_count = 0

for feature in features:
    props = feature.get("properties") or {}

    source_fields = [
        props.get("status_source_url", ""),
        props.get("power_mw_source_url", "")
    ]

    if not any("epoch.ai" in str(s).lower() for s in source_fields):
        continue

    epoch_feature_count += 1

    position = coordinates(feature)
    name = name_key(props.get("name"))

    if name and position:
        nrg_by_name[name].append(position)

output = []
unresolved = []

old_count = 0
new_count = 0

for center in us_centers:
    name = center["Name"]
    key = name_key(name)

    if key in existing:
        old = existing[key]

        output.append({
            **old,
            "coordinate_source": "US Census geocoder",
            "location_precision": "Address geocode; approximate",
            "coordinate_source_url":
                "https://geocoding.geo.census.gov/"
        })

        old_count += 1
        continue

    matches = nrg_by_name.get(key, [])

    if len(matches) == 1:
        lat, lon = matches[0]

        output.append({
            "name": name,
            "owner": center["Owner"],
            "address": center["Address"],
            "latitude": lat,
            "longitude": lon,
            "current_power_mw": center["Current power (MW)"],
            "coordinate_source": "NRG Map / OpenStreetMap",
            "location_precision":
                "Approximate; site precision unverified",
            "coordinate_source_url":
                "https://app.nrgmap.com/data/data-centers.geojson"
        })

        new_count += 1

    else:
        unresolved.append({
            "name": name,
            "address": center["Address"],
            "reason": (
                "No matching point"
                if not matches
                else "Multiple matching points"
            )
        })

fields = [
    "name", "owner", "address",
    "latitude", "longitude", "current_power_mw",
    "coordinate_source", "location_precision",
    "coordinate_source_url"
]

with (DATA / "epoch-us-locations-expanded.csv").open(
    "w", newline="", encoding="utf-8"
) as f:
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()
    writer.writerows(output)

with (DATA / "epoch-us-still-unmatched.csv").open(
    "w", newline="", encoding="utf-8"
) as f:
    writer = csv.DictWriter(
        f, fieldnames=["name", "address", "reason"]
    )
    writer.writeheader()
    writer.writerows(unresolved)

print("\n--- MATCHING RESULTS ---")
print("Original US centers:", len(us_centers))
print("NRG Epoch-derived features:", epoch_feature_count)
print("Retained Census matches:", old_count)
print("New NRG matches:", new_count)
print("Total locations:", len(output))
print("Still unmatched:", len(unresolved))

if unresolved:
    print("\nRemaining facilities:")
    for row in unresolved:
        print(f" - {row['name']}: {row['reason']}")
