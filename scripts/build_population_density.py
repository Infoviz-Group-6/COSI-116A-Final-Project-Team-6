"""Build data/state-population-density.csv from two U.S. Census source files.

Inputs (both in data/):
  sc-est2025-alldata6.csv      Vintage 2025 state population estimates by
                               sex, Hispanic origin, race, and age.
  2024_Gaz_state_national.txt  2024 Gazetteer (tab-separated) with land area.

Output:
  state-population-density.csv  One row per state per year:
                                state,fips,year,population,land_sq_mi,density_per_sq_mi

Run from the repository root:  python scripts/build_population_density.py
"""

import csv
from collections import defaultdict
from pathlib import Path

DATA = Path("data")
ESTIMATES = DATA / "sc-est2025-alldata6.csv"
GAZETTEER = DATA / "2024_Gaz_state_national.txt"
OUTPUT = DATA / "state-population-density.csv"
YEARS = range(2020, 2026)


def read_land_area():
    with GAZETTEER.open(encoding="utf-8-sig", newline="") as f:
        rows = csv.DictReader(f, delimiter="\t")
        return {
            row["NAME"].strip(): {
                "fips": row["GEOID"].strip(),
                "land_sq_mi": float(row["ALAND_SQMI"]),
            }
            for row in (
                {key.strip(): (value or "").strip() for key, value in raw.items()}
                for raw in rows
            )
        }


def read_population():
    # SEX=0 and ORIGIN=0 are the "both sexes" / "total" rows; summing those
    # over every race and age gives the state's total population.
    totals = defaultdict(lambda: defaultdict(int))
    with ESTIMATES.open(encoding="latin-1", newline="") as f:
        for row in csv.DictReader(f):
            if row["SEX"] != "0" or row["ORIGIN"] != "0":
                continue
            for year in YEARS:
                totals[row["NAME"]][year] += int(row[f"POPESTIMATE{year}"])
    return totals


def main():
    land = read_land_area()
    population = read_population()

    missing = sorted(set(population) - set(land))
    if missing:
        raise SystemExit(f"No Gazetteer land area for: {', '.join(missing)}")

    with OUTPUT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(
            ["state", "fips", "year", "population", "land_sq_mi", "density_per_sq_mi"]
        )
        for state in sorted(population):
            area = land[state]["land_sq_mi"]
            for year in YEARS:
                pop = population[state][year]
                writer.writerow(
                    [state, land[state]["fips"], year, pop, area, round(pop / area, 1)]
                )

    print(f"Wrote {len(population) * len(YEARS)} rows for {len(population)} states to {OUTPUT}")


if __name__ == "__main__":
    main()
