#!/usr/bin/env python3
"""Build tests/golden.xlsx: live-formula cross-check of golden tests 1, 3, 4, 5, 8, 9 (PRD section 8).

    node scripts/check-golden-xlsx.mjs                      # writes tests/golden-js.json from the engine
    research/venv/bin/python scripts/make-golden-xlsx.py    # builds, recalculates with LibreOffice, verifies

Every number on the test sheets is either a labeled input (blue on yellow) or an Excel formula. The Summary sheet's
"JS value" column is the only pasted data: it comes from tests/golden-js.json (the engine's own output).
"""
import datetime as dt
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.formatting.rule import CellIsRule

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "tests" / "golden.xlsx"
JS = json.loads((ROOT / "tests" / "golden-js.json").read_text())

BLUE = Font(color="0000FF")
BOLD = Font(bold=True)
TITLE = Font(bold=True, size=14)
NOTE = Font(italic=True, color="666666")
INPUT_FILL = PatternFill("solid", fgColor="FFF8DC")
RESULT_FILL = PatternFill("solid", fgColor="E8F0E8")
HEAD_FILL = PatternFill("solid", fgColor="DDDDDD")


def sheet(wb, name, title, note=None, widths=(44, 18, 18, 18, 14, 14, 18, 16)):
    ws = wb.create_sheet(name)
    ws["A1"] = title
    ws["A1"].font = TITLE
    if note:
        ws["A2"] = note
        ws["A2"].font = NOTE
    for i, w in enumerate(widths):
        ws.column_dimensions["ABCDEFGH"[i]].width = w
    return ws


def inp(ws, ref, value, label=None, fmt=None):
    ws[ref] = value
    ws[ref].font = BLUE
    ws[ref].fill = INPUT_FILL
    if fmt:
        ws[ref].number_format = fmt
    if label:
        ws["A" + ref[1:]] = label


def calc(ws, ref, formula, label=None, fmt=None, result=False):
    ws[ref] = formula
    if fmt:
        ws[ref].number_format = fmt
    if result:
        ws[ref].fill = RESULT_FILL
        ws[ref].font = BOLD
    if label:
        ws["A" + ref[1:]] = label


def header(ws, row, labels):
    for i, t in enumerate(labels):
        c = ws.cell(row=row, column=i + 1, value=t)
        c.font = BOLD
        c.fill = HEAD_FILL
        c.alignment = Alignment(horizontal="center", wrap_text=True)


wb = Workbook()
wb.remove(wb.active)
summary = wb.create_sheet("Summary")  # filled last

# ------------------------------------------------------------------ Test 1: Black-Scholes put and zero-cost call
ws = sheet(wb, "T1_BlackScholes", "Test 1: Black-Scholes put and zero-cost call strike",
           "European, no dividends, continuous rate r. Put and call use the same vol. Blue-on-yellow cells are inputs.")
inp(ws, "B4", 134.72, "Spot S", "0.00")
inp(ws, "B5", 114.512, "Put strike K (85% of S)", "0.000")
inp(ws, "B6", 1, "Time to expiry T (years)", "0.00")
inp(ws, "B7", 0.04, "Risk-free rate r (continuous)", "0.00%")
inp(ws, "B8", 0.537, "Volatility", "0.0%")
calc(ws, "B10", "=B8*SQRT(B6)", "sd = vol*sqrt(T)", "0.000000")
calc(ws, "B11", "=(LN(B4/B5)+(B7+B8^2/2)*B6)/B10", "d1", "0.000000")
calc(ws, "B12", "=B11-B10", "d2", "0.000000")
calc(ws, "B13", "=EXP(-B7*B6)", "Discount factor e^(-rT)", "0.000000")
calc(ws, "B14", "=B5*B13*_xlfn.NORM.S.DIST(-B12,TRUE)-B4*_xlfn.NORM.S.DIST(-B11,TRUE)", "PUT value  K e^-rT N(-d2) - S N(-d1)", "0.0000", True)
calc(ws, "B15", "=B4*_xlfn.NORM.S.DIST(B11,TRUE)-B5*B13*_xlfn.NORM.S.DIST(B12,TRUE)", "Call value at K (for the parity check)", "0.0000")
calc(ws, "B16", "=B15-B14-(B4-B5*B13)", "Put-call parity residual C - P - (S - K e^-rT)", "0.0E+00")
calc(ws, "A18", "Zero-cost call strike: bisection on [S, 5S]; the call is worth more than the put when its strike is too low, so move lo up.")
ws["A18"].font = NOTE
calc(ws, "B19", "=D62", "ZERO-COST CALL STRIKE (last midpoint)", "0.0000", True)
ws["A19"] = "ZERO-COST CALL STRIKE (last midpoint)"
calc(ws, "B20", "=G62", "Call value at that strike", "0.0000")
calc(ws, "B21", "=B14-B20", "Collar mark, put - call (should be ~0)", "0.000000", True)
header(ws, 22, ["Step", "lo", "hi", "mid", "d1 at mid", "d2 at mid", "Call(mid)", "Call(mid) > put?"])
for i in range(40):
    r = 23 + i
    ws[f"A{r}"] = i + 1
    if i == 0:
        ws[f"B{r}"] = "=B4"
        ws[f"C{r}"] = "=5*B4"
    else:
        ws[f"B{r}"] = f"=IF(H{r-1},D{r-1},B{r-1})"
        ws[f"C{r}"] = f"=IF(H{r-1},C{r-1},D{r-1})"
    ws[f"D{r}"] = f"=(B{r}+C{r})/2"
    ws[f"E{r}"] = f"=(LN($B$4/D{r})+($B$7+$B$8^2/2)*$B$6)/$B$10"
    ws[f"F{r}"] = f"=E{r}-$B$10"
    ws[f"G{r}"] = f"=$B$4*_xlfn.NORM.S.DIST(E{r},TRUE)-D{r}*$B$13*_xlfn.NORM.S.DIST(F{r},TRUE)"
    ws[f"H{r}"] = f"=G{r}>$B$14"
    for col in "BCD":
        ws[f"{col}{r}"].number_format = "0.000000"
    for col in "EF":
        ws[f"{col}{r}"].number_format = "0.0000"
    ws[f"G{r}"].number_format = "0.000000"
# final row is 62
assert 23 + 39 == 62

# ------------------------------------------------------------------ Test 3: XIRR
ws = sheet(wb, "T3_XIRR", "Test 3: XIRR", "Excel XIRR discounts on a 365-day year: sum of amount / (1+r)^(days/365) = 0.")
header(ws, 4, ["Flow", "Date", "Amount"])
ws["A5"], ws["A6"] = "Invest", "Receive"
inp(ws, "B5", dt.date(2020, 1, 1), fmt="yyyy-mm-dd")
inp(ws, "B6", dt.date(2021, 12, 31), fmt="yyyy-mm-dd")
inp(ws, "C5", -100, fmt="0.00")
inp(ws, "C6", 121, fmt="0.00")
calc(ws, "B8", "=B6-B5", "Days between flows", "0")
calc(ws, "B9", "=XIRR(C5:C6,B5:B6)", "XIRR (Excel)", "0.000000%", True)
calc(ws, "B10", "=(C6/-C5)^(365/B8)-1", "Closed form (121/100)^(365/days) - 1", "0.000000%")
calc(ws, "B11", "=C5+C6/(1+B9)^(B8/365)", "NPV at the XIRR (should be ~0)", "0.0E+00")

# ------------------------------------------------------------------ Test 4: Sharpe
ws = sheet(wb, "T4_Sharpe", "Test 4: Sharpe ratio", "mean(R - rf) / sample stdev(R - rf) * sqrt(252), daily returns, rf = 0.")
header(ws, 4, ["Day", "Daily return R", "Daily rf", "Excess R - rf"])
for i, v in enumerate([0.01, -0.005, 0.02, 0, -0.01]):
    r = 5 + i
    ws[f"A{r}"] = i + 1
    inp(ws, f"B{r}", v, fmt="0.0%")
    inp(ws, f"C{r}", 0, fmt="0.000%")
    calc(ws, f"D{r}", f"=B{r}-C{r}", fmt="0.000%")
calc(ws, "B11", "=AVERAGE(D5:D9)", "Mean excess return", "0.0000%")
calc(ws, "B12", "=_xlfn.STDEV.S(D5:D9)", "Sample stdev (n-1)", "0.0000%")
calc(ws, "B13", "=252", "Trading days per year", "0")
ws["B13"] = 252
ws["B13"].font = BLUE
ws["B13"].fill = INPUT_FILL
calc(ws, "B14", "=B11/B12*SQRT(B13)", "SHARPE", "0.0000", True)

# ------------------------------------------------------------------ Test 5: max drawdown
ws = sheet(wb, "T5_MaxDrawdown", "Test 5: Max drawdown", "Drawdown at each point = value / running peak - 1. Max drawdown = the minimum.")
header(ws, 4, ["Day", "Value", "Running peak", "Drawdown"])
for i, v in enumerate([100, 120, 90, 95, 130, 104]):
    r = 5 + i
    ws[f"A{r}"] = i + 1
    inp(ws, f"B{r}", v, fmt="0.00")
    calc(ws, f"C{r}", f"=MAX($B$5:B{r})", fmt="0.00")
    calc(ws, f"D{r}", f"=B{r}/C{r}-1", fmt="0.00%")
calc(ws, "B12", "=MIN(D5:D10)", "MAX DRAWDOWN", "0.00%", True)
calc(ws, "B13", "=INDEX(A5:A10,MATCH(B12,D5:D10,0))", "Trough day", "0")

# ------------------------------------------------------------------ Test 8: loan
ws = sheet(wb, "T8_Loan", "Test 8: Single-stock loan", "Closed forms from engine/loan.js. Worked example: 1,000,000 shares pledged at $100 (collateral $100M).")
inp(ws, "B4", 0.25, "Max advance / cure target LTV", "0.00%")
inp(ws, "B5", 0.35, "Maintenance call LTV", "0.00%")
inp(ws, "B6", 1_000_000, "Pledged shares", "#,##0")
inp(ws, "B7", 100, "Starting price", "0.00")
calc(ws, "B8", "=B6*B7", "Collateral value C", "#,##0")
calc(ws, "B9", "=B4*B8", "Loan balance L = 25% of C (max advance)", "#,##0")
calc(ws, "B10", "=1-B4/B5", "FALL TO CALL  1 - 0.25/0.35", "0.0000%", True)
calc(ws, "B11", "=B9/(B8*(1-B10))", "LTV after that fall (should be 35.00%)", "0.0000%", True)
ws["A13"] = "Cure example: price falls 30%"
ws["A13"].font = BOLD
inp(ws, "B14", 0.30, "Fall", "0%")
calc(ws, "B15", "=B8*(1-B14)", "Collateral after the fall", "#,##0")
calc(ws, "B16", "=MAX(0,B9-B4*B15)", "CURE: repay to bring LTV back to 25%", "#,##0", True)
calc(ws, "B17", "=(B9-B16)/B15", "LTV after the cure (should be 25%)", "0.0000%")
ws["A19"] = "Forced sale example: bank sells shares at the post-fall price"
ws["A19"].font = BOLD
calc(ws, "B20", "=B7*(1-B14)", "Price P after the fall", "0.00")
inp(ws, "B21", 1, "Cost basis per share", "0.00")
inp(ws, "B22", 0.0025, "Sale cost rate", "0.00%")
inp(ws, "B23", 0.238, "Tax rate on gains", "0.0%")
calc(ws, "B24", "=B20*(1-B22)", "Net of cost per share", "0.0000")
calc(ws, "B25", "=B24-B23*MAX(0,B24-B21)", "a = cash to loan per share sold (after cost and tax)", "0.0000", True)
calc(ws, "B26", "=B25-B4*B20", "a - 0.25 P", "0.0000")
calc(ws, "B27", "=(B9-B4*B6*B20)/B26", "n exact = (L - 0.25 C') / (a - 0.25 P)", "#,##0.0000")
calc(ws, "B28", "=IF(B9>B4*B6*B20,IF(B26>0,MIN(B6,MAX(0,ROUNDUP(B27-0.000000001,0))),B6),0)", "FORCED-SALE SHARES (rounded up, capped at pledged)", "#,##0", True)
calc(ws, "B29", "=(B9-B28*B25)/((B6-B28)*B20)", "LTV after the sale (<= 25%)", "0.0000%")
calc(ws, "B30", "=(B9-(B28-1)*B25)/((B6-B28+1)*B20)", "LTV if one share fewer were sold (> 25%)", "0.0000%")

# ------------------------------------------------------------------ Test 9: tax
ws = sheet(wb, "T9_Tax", "Test 9: Tax on a sale", "Flat 23.8% (20% federal + 3.8% NIIT) on realized gain. Zero sale cost here.")
inp(ws, "B4", 100000, "Shares sold", "#,##0")
inp(ws, "B5", 150, "Sale price", "0.00")
inp(ws, "B6", 1.35, "Cost basis per share", "0.00")
inp(ws, "B7", 0, "Sale cost rate", "0.00%")
inp(ws, "B8", 0.238, "Tax rate", "0.0%")
calc(ws, "B10", "=B4*B5", "Proceeds", "#,##0.00")
calc(ws, "B11", "=B10*B7", "Sale cost", "#,##0.00")
calc(ws, "B12", "=B10-B11-B4*B6", "Realized gain", "#,##0.00")
calc(ws, "B13", "=B8*B12", "TAX OWED", "$#,##0.00", True)

# ------------------------------------------------------------------ Summary
ws = summary
ws.sheet_properties.tabColor = "336633"
ws["A1"] = "Founder's Five: golden-test spreadsheet cross-check"
ws["A1"].font = TITLE
ws["A2"] = "Spreadsheet value = live formula on the test sheet. JS value = engine output (tests/golden-js.json). PASS needs |sheet - JS| <= tolerance and |sheet - PRD| <= PRD tolerance."
ws["A2"].font = NOTE
header(ws, 4, ["ID", "Quantity", "Spreadsheet value", "JS value", "|diff|", "Tol (sheet vs JS)", "PRD target", "PRD tol", "Result"])
for col, w in zip("ABCDEFGHI", (6, 52, 20, 20, 12, 16, 16, 12, 10)):
    ws.column_dimensions[col].width = w
ws.row_dimensions[4].height = 30
rows = [
    # id, label, sheet formula, number format, tol vs JS, PRD target, PRD tol
    ("1a", "T1 Black-Scholes put, S 134.72 K 114.512", "=T1_BlackScholes!B14", "0.0000", 1e-6, 15.325, 0.01),
    ("1b", "T1 zero-cost call strike (JS stops at a $0.01 bracket)", "=T1_BlackScholes!B19", "0.0000", 0.01, 186.99, 0.05),
    ("1c", "T1 collar mark put - call at that strike", "=T1_BlackScholes!B21", "0.000000", 0.01, 0, 0.01),
    ("3", "T3 XIRR, -100 on 2020-01-01, +121 on 2021-12-31", "=T3_XIRR!B9", "0.0000%", 1e-6, 0.10, 0.0001),
    ("4", "T4 Sharpe of [1%, -0.5%, 2%, 0, -1%], rf 0", "=T4_Sharpe!B14", "0.0000", 1e-9, 3.95, 0.01),
    ("5", "T5 max drawdown of [100,120,90,95,130,104]", "=T5_MaxDrawdown!B12", "0.00%", 1e-12, -0.25, 1e-9),
    ("8a", "T8 fall that takes LTV 25% to 35%", "=T8_Loan!B10", "0.0000%", 1e-12, 0.2857, 0.00005),
    ("8b", "T8 LTV after that fall", "=T8_Loan!B11", "0.0000%", 1e-12, 0.35, 1e-9),
    ("8c", "T8 cure after a 30% fall (balance $25M)", "=T8_Loan!B16", "#,##0.00", 1e-6, None, None),
    ("8d", "T8 forced-sale shares (P $70, pledged 1,000,000, basis $1)", "=T8_Loan!B28", "#,##0", 0, None, None),
    ("8e", "T8 net cash to loan per share sold", "=T8_Loan!B25", "0.0000", 1e-9, None, None),
    ("9", "T9 tax, 100,000 sh at $150, basis $1.35", "=T9_Tax!B13", "$#,##0.00", 0.005, 3537870, 0.005),
]
first = 5
for i, (tid, label, f, fmt, tol, prd, prdtol) in enumerate(rows):
    r = first + i
    ws[f"A{r}"] = tid
    ws[f"B{r}"] = label
    ws[f"C{r}"] = f
    ws[f"D{r}"] = JS[tid]
    ws[f"E{r}"] = f"=ABS(C{r}-D{r})"
    ws[f"F{r}"] = tol
    if prd is not None:
        ws[f"G{r}"] = prd
        ws[f"H{r}"] = prdtol
    ws[f"I{r}"] = f'=IF(AND(E{r}<=F{r},IF(G{r}="",TRUE,ABS(C{r}-G{r})<=H{r})),"PASS","FAIL")'
    for col in "CD":
        ws[f"{col}{r}"].number_format = fmt
    ws[f"G{r}"].number_format = fmt
    ws[f"E{r}"].number_format = "0.0E+00"
    ws[f"F{r}"].number_format = "0.0E+00"
    ws[f"H{r}"].number_format = "0.0E+00"
    ws[f"I{r}"].font = BOLD
    ws[f"I{r}"].alignment = Alignment(horizontal="center")
last = first + len(rows) - 1
ws[f"B{last+2}"] = "OVERALL"
ws[f"B{last+2}"].font = BOLD
ws[f"I{last+2}"] = f'=IF(COUNTIF(I{first}:I{last},"PASS")=ROWS(I{first}:I{last}),"ALL PASS","FAIL")'
ws[f"I{last+2}"].font = BOLD
ws[f"I{last+2}"].alignment = Alignment(horizontal="center")
green = PatternFill("solid", bgColor="C6EFCE")
red = PatternFill("solid", bgColor="FFC7CE")
rng = f"I{first}:I{last+2}"
ws.conditional_formatting.add(rng, CellIsRule(operator="equal", formula=['"FAIL"'], fill=red))
ws.conditional_formatting.add(rng, CellIsRule(operator="notEqual", formula=['"FAIL"'], fill=green))
ws.freeze_panes = "A5"

# ------------------------------------------------------------------ save, recalculate with LibreOffice, verify
OUT.parent.mkdir(exist_ok=True)
tmp = Path(tempfile.mkdtemp(prefix="golden-xlsx-"))
raw = tmp / "golden.xlsx"
wb.save(raw)
soffice = shutil.which("soffice") or "/Applications/LibreOffice.app/Contents/MacOS/soffice"
outdir = tmp / "recalc"
outdir.mkdir()
subprocess.run([soffice, "--headless", "--calc", "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", str(outdir), str(raw)],
               check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180)
shutil.copy(outdir / "golden.xlsx", OUT)
print(f"recalculated with LibreOffice -> {OUT.relative_to(ROOT)}")

chk = load_workbook(OUT, data_only=True)
fchk = load_workbook(OUT)  # formulas survive the round trip
s = chk["Summary"]
bad = 0
print(f"{'id':3} {'spreadsheet':>20} {'js':>20}  result")
for r in range(first, last + 1):
    print(f"{s[f'A{r}'].value:3} {s[f'C{r}'].value!r:>20} {s[f'D{r}'].value!r:>20}  {s[f'I{r}'].value}")
    bad += s[f"I{r}"].value != "PASS"
print("overall:", s[f"I{last+2}"].value)
nform = sum(1 for w in fchk.worksheets for row in w.iter_rows() for c in row if isinstance(c.value, str) and c.value.startswith("="))
print(f"{nform} live formulas in the workbook")
for w in chk.worksheets:  # no error values anywhere
    for row in w.iter_rows():
        for c in row:
            if isinstance(c.value, str) and c.value.startswith("#"):
                print("ERROR VALUE", w.title, c.coordinate, c.value)
                bad += 1
sys.exit(1 if bad else 0)
