# Submission files

| File | What it is |
|---|---|
| `Founders-Five.pdf` | The 5-page PDF for Canvas (US Letter, clickable links) |
| `demo.mp4` | Screen recording of the app, 1280x800, about 50 seconds, H.264, no audio |
| `qr.png` | QR code for https://pjogilvie7.github.io/founders-five/ |
| `pdf.html`, `pdf.css` | The PDF source (print CSS). Numbers in it are filled from the repo when it is built |
| `shots/` | Screenshots the PDF uses, taken from the running app |

## Regenerate

Both scripts drive the app in a browser, so serve the project root first (from `founders-five/`):

```
python3 -m http.server 8800 --bind 127.0.0.1
```

Then, in a second terminal:

```
node scripts/make-pdf.mjs        # fresh screenshots into submission/shots/, then submission/Founders-Five.pdf
node scripts/record-demo.mjs     # records the app, converts to submission/demo.mp4 with ffmpeg
```

- Another server URL: add `--base http://127.0.0.1:PORT/` to either command.
- `node scripts/make-pdf.mjs --no-shots` re-renders the PDF from the shots already in `submission/shots/` (use it after editing `pdf.html` or `pdf.css`).
- `make-pdf.mjs` fills `{{asOf...}}`, test count, card counts and the build date from `data/` and from `node --test`, so rerun it after the data or tests change.
- `record-demo.mjs` expects ffmpeg at `/Users/pjogilvie/.local/bin/ffmpeg` (or on `PATH`). It fails if the file is over 15 MB and warns if the length is outside 45 to 60 seconds.
- Needs Playwright (`npm install` in `founders-five/`; Chromium installed with `npx playwright install chromium`). The PDF loads Cormorant SC, IBM Plex Sans and IBM Plex Mono from Google Fonts, so build it online.

## QR code

`qr.png` was made offline with the Python `qrcode` package in a throwaway venv (`research/venv-qr`, gitignored with the rest of `research/`):

```
python3 -m venv research/venv-qr && research/venv-qr/bin/pip install qrcode pillow
research/venv-qr/bin/python -c "import qrcode; q=qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=12, border=2); q.add_data('https://pjogilvie7.github.io/founders-five/'); q.make(fit=True); q.make_image(fill_color='#18262F', back_color='#F1ECDF').save('submission/qr.png')"
```

## Before you submit

- The live link, the QR code and the Pages/Actions/repository links in the PDF only work after the repo is created and Pages is on. That is still open: see `NEEDS-PJ.md` item 1. Until then the links return 404.
- Replace `[Team member 1]`, `[Team member 2]`, `[Team member 3]` on page 1 in `pdf.html` (change the count if the team is not three), then rerun `make-pdf.mjs --no-shots`.
- Rerun both scripts after the last UI and data changes so the screenshots, counts and video match what is live.
- Page 2 says "Due Monday, November 2 at 11:59 pm" and page 4 says a teammate still checks every tranche. Edit both if either stops being true.
