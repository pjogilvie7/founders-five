# Needs PJ

## 1. Create the public repo and turn on Pages (blocked overnight)
At 00:45 ET the session's auto-mode permission classifier refused `gh repo create pjogilvie7/founders-five --public` ("Create Public Surface"). The build did not work around it. Everything is committed locally in this folder and tested on a local server, so going live is three commands, about 3 minutes:

```bash
cd /Users/pjogilvie/fmrksAiExtraCredit/founders-five && gh repo create pjogilvie7/founders-five --public --source . --push
```

```bash
gh api -X POST repos/pjogilvie7/founders-five/pages -f build_type=workflow
```

```bash
gh workflow run pages.yml -R pjogilvie7/founders-five && gh workflow run update-data.yml -R pjogilvie7/founders-five
```

Then open https://pjogilvie7.github.io/founders-five/ in a private window (about 1 to 2 minutes after the Pages run goes green). To let a future session do this itself, allow the command in Claude Code permissions.

## 2. Keep-awake
The keep-awake request was also refused by the classifier at 00:21 ET; the build relied on the app's own per-turn hold.

## Submission PDF (submission/Founders-Five.pdf)
- Page 1 has three placeholders, `[Team member 1]` to `[Team member 3]`. Send the names (or say solo) and the PDF is rebuilt with `node scripts/make-pdf.mjs`.
- The live link, QR code and GitHub links return 404 until the repo is pushed (command above).
