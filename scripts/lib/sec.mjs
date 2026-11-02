import { secGet, SourceError } from './http.mjs';

export const SPCX_CIK = '1181412';
export const URL_424B4 = 'https://www.sec.gov/Archives/edgar/data/1181412/000162828026042639/spaceexplorationtechnologi.htm';

const archiveUrl = (cik, acc, doc) => `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${acc.replace(/-/g, '')}/${doc}`;

// Submissions JSON -> {earnings:[{d,url}], reports:[{d,form,url}]} ascending by filing date.
// earnings = 8-K filings whose Items include 2.02; reports = 10-Q and 10-K (not amendments).
export async function fetchFilings(cik = SPCX_CIK) {
  const j = await secGet(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`, { as: 'json' });
  const r = j?.filings?.recent;
  if (!r?.form) throw new SourceError('sec', 'submissions JSON has no filings.recent');
  const earnings = [], reports = [];
  for (let i = 0; i < r.form.length; i++) {
    const url = archiveUrl(cik, r.accessionNumber[i], r.primaryDocument[i]);
    const items = String(r.items?.[i] || '').split(',').map((x) => x.trim());
    if (r.form[i] === '8-K' && items.includes('2.02')) earnings.push({ d: r.filingDate[i], url });
    else if (r.form[i] === '10-Q' || r.form[i] === '10-K') reports.push({ d: r.filingDate[i], form: r.form[i], url });
  }
  const byDate = (a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
  return { earnings: earnings.sort(byDate), reports: reports.sort(byDate) };
}

const strip = (html) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&#160;|&nbsp;|&#xa0;/gi, ' ').replace(/&#8217;|&rsquo;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

// Offer facts from the 424B4: gross proceeds (cover page) and Class A shares outstanding after the offering (The Offering, p. 17).
export async function fetchOfferFacts(url = URL_424B4) {
  const text = strip(await secGet(url));
  const gross = /Initial public offering price[\s.]*\$\s*135\.00\s*\$\s*([\d,]{9,})/i.exec(text);
  const after = /Class A common stock outstanding immediately after this offering[\s.]*([\d,]{9,}) shares/i.exec(text);
  if (!gross || !after) throw new SourceError('sec', '424B4 parse failed (gross proceeds or shares outstanding not found)');
  return { proceedsUSD: Number(gross[1].replace(/,/g, '')), sharesOutPost: Number(after[1].replace(/,/g, '')) };
}
