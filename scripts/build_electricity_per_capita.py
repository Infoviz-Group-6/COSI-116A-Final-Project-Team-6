"""Build data/state-electricity-per-capita.csv from U.S. EIA sales tables.

Inputs (all in data/):
  eia-epa-table-2-08-2024.xlsx   Electric Power Annual 2024, Table 2.8:
                                 retail sales by state, 2024 and 2023.
  eia-epa-table-2-08-2025.xlsx   Electric Power Annual 2025, Table 2.8:
                                 retail sales by state, 2025 and 2024.
  eia-epm-table-5-04-b-ytd.xlsx  Electric Power Monthly, Table 5.4.B:
                                 year-to-date sales by state, this year and last.
  state-population-density.csv   Census population per state and year
                                 (from scripts/build_population_density.py).

Sources:
  https://www.eia.gov/electricity/annual/archive/2024/xls/epa_02_08.xlsx
  https://www.eia.gov/electricity/annual/xls/epa_02_08.xlsx
  https://www.eia.gov/electricity/monthly/xls/table_5_04_b.xlsx

The newest year is only partly reported, so it is estimated as
  last full year x (this year's YTD / last year's same-period YTD)
and flagged with is_estimate=1. Years without a Census estimate use the
latest available population.

Output:
  state-electricity-per-capita.csv
    state,year,sales_mwh,population,population_year,mwh_per_person,is_estimate,ytd_through

Run from the repository root:  python scripts/build_electricity_per_capita.py
"""

import csv
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

DATA = Path("data")
ANNUAL_FILES = [DATA / "eia-epa-table-2-08-2024.xlsx", DATA / "eia-epa-table-2-08-2025.xlsx"]
YTD_FILE = DATA / "eia-epm-table-5-04-b-ytd.xlsx"
POPULATION = DATA / "state-population-density.csv"
OUTPUT = DATA / "state-electricity-per-capita.csv"

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def read_xlsx_rows(path):
    """Return the first worksheet as a list of {column letter: text} dicts."""
    with zipfile.ZipFile(path) as z:
        shared = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            shared = ["".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t"))
                      for si in root.findall("m:si", NS)]
        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))

    rows = []
    for row in sheet.iter(f"{{{NS['m']}}}row"):
        cells = {}
        for c in row.findall("m:c", NS):
            column = re.match(r"[A-Z]+", c.get("r")).group()
            if c.get("t") == "s":
                text = shared[int(c.find("m:v", NS).text)]
            elif c.get("t") == "inlineStr":
                text = "".join(t.text or "" for t in c.iter(f"{{{NS['m']}}}t"))
            else:
                v = c.find("m:v", NS)
                text = v.text if v is not None else ""
            cells[column] = (text or "").strip()
        rows.append(cells)
    return rows


def read_all_sector_sales(path, states):
    """Read 'All Sectors' sales (thousand MWh) per state for both columns.

    Returns ({column header: {state: thousand MWh}}, title text).
    """
    rows = read_xlsx_rows(path)
    title = " ".join(r.get("A", "") for r in rows[:2])
    header = next(r for r in rows if r.get("J", "").strip() and r.get("A", "").startswith("Census"))
    labels = {"J": header["J"], "K": header["K"]}
    sales = {label: {} for label in labels.values()}
    for r in rows:
        state = r.get("A", "")
        if state in states:
            for column, label in labels.items():
                sales[label][state] = float(r[column])
    missing = states - set(sales[labels["J"]])
    if missing:
        raise SystemExit(f"{path.name} is missing: {', '.join(sorted(missing))}")
    return sales, title


def main():
    with POPULATION.open(encoding="utf-8", newline="") as f:
        pop_rows = list(csv.DictReader(f))
    population = {(r["state"], int(r["year"])): int(r["population"]) for r in pop_rows}
    states = {r["state"] for r in pop_rows}
    latest_pop_year = max(int(r["year"]) for r in pop_rows)

    # Annual totals, e.g. "Year 2024" -> 2024. Later files win if years overlap.
    annual = {}
    for path in ANNUAL_FILES:
        sales, _ = read_all_sector_sales(path, states)
        for label, by_state in sales.items():
            annual[int(re.search(r"\d{4}", label).group())] = by_state

    # Year-to-date, e.g. "August 2026 YTD" and "August 2025 YTD".
    ytd, _ = read_all_sector_sales(YTD_FILE, states)
    (this_label, this_ytd), (last_label, last_ytd) = sorted(
        ytd.items(), key=lambda item: item[0][-8:], reverse=True
    )
    this_year = int(re.search(r"\d{4}", this_label).group())
    month = this_label.split()[0]
    if this_year - 1 not in annual:
        raise SystemExit(f"Need {this_year - 1} annual data to scale the {this_year} YTD figures")

    rows = []
    for year in sorted(annual):
        for state in sorted(states):
            rows.append((state, year, annual[year][state] * 1000, False, ""))
    if this_year not in annual:
        # Last month of the year-to-date figures, e.g. "August".
        for state in sorted(states):
            estimate = annual[this_year - 1][state] * this_ytd[state] / last_ytd[state]
            rows.append((state, this_year, estimate * 1000, True, month))

    with OUTPUT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["state", "year", "sales_mwh", "population", "population_year",
                         "mwh_per_person", "is_estimate", "ytd_through"])
        for state, year, mwh, is_estimate, ytd_through in sorted(rows):
            pop_year = min(year, latest_pop_year)
            pop = population[(state, pop_year)]
            writer.writerow([state, year, round(mwh), pop, pop_year,
                             round(mwh / pop, 2), int(is_estimate), ytd_through])

    years = sorted({r[1] for r in rows})
    print(f"Wrote {len(rows)} rows ({years[0]}-{years[-1]}) for {len(states)} states to {OUTPUT}")


if __name__ == "__main__":
    main()
