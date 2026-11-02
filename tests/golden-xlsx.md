# Golden spreadsheet cross-check

`tests/golden.xlsx` re-derives golden tests 1, 3, 4, 5, 8 and 9 (PRD section 8) with live Excel formulas, so a person can click a cell and see the arithmetic. The `Summary` sheet puts each spreadsheet value next to the value the JS engine produces and says PASS or FAIL.

## Open it

Open `tests/golden.xlsx` in Excel, Numbers, Google Sheets or LibreOffice. Start on `Summary`: the last row says `ALL PASS`. Then click through the sheets:

| Sheet | Test | What to look at |
|---|---|---|
| `T1_BlackScholes` | 1 | Put value (B14) = 15.3249. Zero-cost call strike (B19) = 186.99, found by a 40-row bisection table (rows 23-62): each row halves the bracket [S, 5S] and keeps the half where the call is still worth more than the put. |
| `T3_XIRR` | 3 | `=XIRR(...)` = 10.00% (730 days; Excel uses a 365-day year). A closed-form row and an NPV-at-the-rate row check it. |
| `T4_Sharpe` | 4 | `AVERAGE / STDEV.S * SQRT(252)` = 3.9549, shown as 3.95 in the PRD. |
| `T5_MaxDrawdown` | 5 | Running-peak and drawdown columns; the minimum is -25.00%. |
| `T8_Loan` | 8 | Worked example: 1,000,000 shares at $100 pledged, loan $25M (25% LTV). Fall to the 35% call = 28.57%. After a 30% fall (price $70) the cure is $7.5M. Forced sale at $70 with $1 basis, 0.25% cost, 23.8% tax: 208,655 shares (rounded up from the closed form `n = (L - 0.25 C) / (a - 0.25 P)`). |
| `T9_Tax` | 9 | 100,000 shares at $150, basis $1.35, 23.8% = $3,537,870. |

Blue text on a yellow fill marks an inputs cell; change one and everything downstream recalculates. The `JS value` column on `Summary` is the only pasted data in the workbook.

## Rebuild and re-check

```
node scripts/check-golden-xlsx.mjs                      # engine values -> tests/golden-js.json
research/venv/bin/python scripts/make-golden-xlsx.py    # build, recalculate with LibreOffice, check
node scripts/check-golden-xlsx.mjs --verify             # independent check of the saved workbook's cached values
```

- Setup, once: `python3 -m venv research/venv && research/venv/bin/pip install openpyxl`. `research/` is gitignored, so the venv is not committed.
- `make-golden-xlsx.py` writes the workbook with openpyxl (formulas only), then recalculates it headlessly with LibreOffice (`soffice --headless --convert-to xlsx`) and saves the recalculated copy as `tests/golden.xlsx`, so the cached values show even in viewers that do not recalculate. It exits non-zero on any FAIL or any error value.
- `check-golden-xlsx.mjs --verify` unzips the saved workbook, reads the cached `Summary` values with no spreadsheet library, and compares them to the engine values again.

## Tolerances

A row passes when |spreadsheet - JS| is within the tolerance in column F and |spreadsheet - PRD target| is within column H. Most are 1e-6 or tighter. Two are looser by design: the zero-cost call strike (0.01), because the JS solver stops at a $0.01 bracket while the sheet runs 40 halvings, and the collar mark (0.01) for the same reason.
