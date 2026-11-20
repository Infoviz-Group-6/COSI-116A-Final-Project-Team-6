"""Build data/state-poverty-rate.csv from U.S. Census SAIPE files.

Inputs (in data/):
  census-saipe-est{YY}all.txt   Small Area Income and Poverty Estimates (SAIPE),
                                state and county file for each year, from
                                https://www2.census.gov/programs-surveys/saipe/datasets/20YY/20YY-state-and-county/estYYall.txt
  state-population-density.csv  Used only for the state names and FIPS codes
                                (from scripts/build_population_density.py).

The SAIPE file is whitespace-separated. State rows have county FIPS 0.
Columns used: [0] state FIPS, [2] people in poverty (all ages),
[3]/[4] its 90% confidence interval, [5] poverty rate (%), [6]/[7] its
90% confidence interval.

Output:
  state-poverty-rate.csv
    state,fips,year,people_in_poverty,poverty_rate,rate_ci_low,rate_ci_high

Run from the repository root:  python scripts/build_poverty_rate.py
"""

import csv
import re
from pathlib import Path

DATA = Path("data")
POPULATION = DATA / "state-population-density.csv"
OUTPUT = DATA / "state-poverty-rate.csv"


def main():
    with POPULATION.open(encoding="utf-8", newline="") as f:
        names = {r["fips"]: r["state"] for r in csv.DictReader(f)}

    rows = []
    for path in sorted(DATA.glob("census-saipe-est*all.txt")):
        year = 2000 + int(re.search(r"est(\d{2})all", path.name).group(1))
        found = set()
        with path.open(encoding="latin-1") as f:
            for line in f:
                tokens = line.split()
                fips = tokens[0].zfill(2)
                if tokens[1] != "0" or fips not in names:
                    continue  # county row, U.S. total, or not in our state list
                found.add(fips)
                rows.append([
                    names[fips], fips, year,
                    int(tokens[2]),
                    float(tokens[5]), float(tokens[6]), float(tokens[7]),
                ])
        missing = sorted(names[f] for f in set(names) - found)
        if missing:
            raise SystemExit(f"{path.name} is missing: {', '.join(missing)}")

    with OUTPUT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["state", "fips", "year", "people_in_poverty",
                         "poverty_rate", "rate_ci_low", "rate_ci_high"])
        writer.writerows(sorted(rows))

    years = sorted({r[2] for r in rows})
    print(f"Wrote {len(rows)} rows ({', '.join(map(str, years))}) to {OUTPUT}")


if __name__ == "__main__":
    main()
