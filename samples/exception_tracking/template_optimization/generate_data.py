#!/usr/bin/env python3
"""Generate isolated two-date acceptance CSVs for template optimization.

Usage:
    python samples/exception_tracking/template_optimization/generate_data.py \
        /tmp/template-optimization-data

The output directory is created if needed and contains four UTF-8 CSV files.
The script never reads or writes application databases or user data.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

HEADERS = (
    "ACCOUNT_ID",
    "STATUS",
    "REGION",
    "SEGMENT",
    "PORTFOLIO",
    "BALANCE",
)


def write_pair(output: Path, label: str, identifiers: range | tuple[int, ...]) -> None:
    for side, candidate in (("baseline", False), ("candidate", True)):
        path = output / f"{side}_{label}.csv"
        with path.open("w", encoding="utf-8", newline="") as stream:
            writer = csv.writer(stream, lineterminator="\n")
            writer.writerow(HEADERS)
            for index in identifiers:
                writer.writerow(
                    (
                        f"A{index:03d}",
                        "inactive" if candidate else "active",
                        ("EMEA", "APAC", "AMER")[index % 3],
                        ("Retail", "Institutional", "SME")[index % 3],
                        f"P-{index:03d}",
                        1000 + index,
                    )
                )


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(f"Usage: {Path(sys.argv[0]).name} OUTPUT_DIRECTORY")
    output = Path(sys.argv[1]).expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    write_pair(output, "2026-08-31", range(65))
    # 45 previously uncommented IDs, 20 IDs with commentary entered after the
    # August run, plus 25 IDs absent in August.
    september_ids = (*range(70), *range(90, 110))
    write_pair(output, "2026-09-30", september_ids)
    print(f"Generated isolated acceptance data in {output}")


if __name__ == "__main__":
    main()
