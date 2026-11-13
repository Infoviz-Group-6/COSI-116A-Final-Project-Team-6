
import csv
import json
import time
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DATA = Path("data")

# Read the original Epoch AI dataset.
with open(DATA / "epoch-data-centers.csv", encoding="utf-8-sig") as f:
    rows = list(csv.DictReader(f))

# Only keep data centers in the United States.
us_centers = [
    row for row in rows
    if row["Country"].strip() == "United States"
]

print("Total worldwide:", len(rows))
print("Total US centers:", len(us_centers))

# Convert an address into coordinates using Census.
def geocode(address):
    base = (
        "https://geocoding.geo.census.gov/"
        "geocoder/locations/onelineaddress"
    )

    params = urlencode({
        "address": address,
        "benchmark": "Public_AR_Current",
        "format": "json"
    })

    request = Request(
        base + "?" + params,
        headers={"User-Agent": "COSI116A-Student-Project/1.0"}
    )

    with urlopen(request, timeout=12) as response:
        result = json.load(response)

    matches = result.get("result", {}).get("addressMatches", [])

    # Avoid automatically choosing ambiguous locations.
    if len(matches) != 1:
        return None

    return matches[0]["coordinates"]

success = []
unmatched = []
network_errors = 0

for i, center in enumerate(us_centers, 1):
    name = center["Name"]
    address = center["Address"].strip()

    print(f"[{i}/{len(us_centers)}] {name}")

    if not address:
        unmatched.append({"name": name, "address": address})
        continue

    try:
        coords = geocode(address)
        network_errors = 0
    except Exception as error:
        print("  Geocoding error:", error)
        unmatched.append({"name": name, "address": address})
        network_errors += 1

        if network_errors >= 3:
            print("Stopping: geocoding service may be unavailable.")
            break
        continue

    if coords is None:
        unmatched.append({"name": name, "address": address})
        print("  No unique address match.")
    else:
        success.append({
            "name": name,
            "owner": center["Owner"],
            "address": address,
            "latitude": coords["y"],
            "longitude": coords["x"],
            "current_power_mw": center["Current power (MW)"]
        })

    time.sleep(0.25)

# Save matched facilities.
with open(DATA / "epoch-us-geocoded.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=[
        "name", "owner", "address", "latitude",
        "longitude", "current_power_mw"
    ])
    writer.writeheader()
    writer.writerows(success)

# Save failed matches for manual review.
with open(DATA / "epoch-us-unmatched.csv", "w", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["name", "address"])
    writer.writeheader()
    writer.writerows(unmatched)

print("\n--- RESULTS ---")
print("US centers:", len(us_centers))
print("Successfully geocoded:", len(success))
print("Unmatched:", len(unmatched))
print("Saved to data/epoch-us-geocoded.csv")
print("Saved unmatched addresses to data/epoch-us-unmatched.csv")
