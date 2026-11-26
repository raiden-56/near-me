// Builds the illustrative category imagery pool from Wikimedia Commons.
//
//   node scripts/build-imagery.mjs --review              fetch candidates, write a contact sheet to public/_imagery-review.html
//   node scripts/build-imagery.mjs --write [--exclude restaurants:2,cafes:0]
//                                                         write src/data/imagery.generated.ts, hot-linking Wikimedia
//   node scripts/build-imagery.mjs --write --bundle       also download the photos into public/imagery (WebP, two sizes)
//                                                         and write public/imagery/CREDITS.md
//
// Images are real photographs under free licences. They illustrate a *type* of place and are
// always labelled "Illustrative" in the app; they are never presented as a specific business.
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = { 'User-Agent': 'nearme-imagery-builder/0.1 (development tool)' };
const CANDIDATES = new URL('./.imagery-candidates.json', import.meta.url);
const PER_CATEGORY = 6;
const KEEP = 6;

/** Search phrases per category. Earlier phrases are preferred. */
const TERMS = {
  restaurants: ['South Indian thali meal', 'masala dosa plate', 'restaurant interior tables India', 'biryani served'],
  cafes: ['cafe interior', 'cappuccino latte art cup', 'South Indian filter coffee'],
  bakeries: ['bakery display bread loaves', 'pastries in bakery showcase'],
  desserts: ['ice cream scoops bowl', 'Indian sweets mithai shop', 'gulab jamun'],
  'street-food': ['pani puri street food', 'street food stall India', 'chaat plate'],
  'fast-food': ['hamburger and french fries', 'pizza on table', 'sandwich plate'],
  bars: ['bar counter bottles interior', 'cocktail glass on bar', 'beer taps pub'],
  'emergency-care': ['ambulance India', 'hospital emergency entrance'],
  hospitals: ['hospital building India', 'hospital corridor'],
  clinics: ['stethoscope doctor desk', 'dental clinic chair'],
  'medical-stores': ['pharmacy shelves medicines', 'medical store India'],
  'diagnostic-labs': ['medical laboratory microscope', 'blood sample test tubes laboratory'],
  supermarkets: ['supermarket aisle shelves', 'supermarket India interior'],
  grocery: ['vegetable market India', 'fruit stall India', 'kirana grocery shop India'],
  malls: ['shopping mall interior atrium', 'shopping mall India'],
  electronics: ['electronics store interior', 'laptops on display store'],
  clothing: ['clothing store interior racks', 'sarees shop', 'shoe store display'],
  stores: ['bookshop interior shelves', 'stationery shop', 'hardware store interior'],
  'petrol-pumps': ['petrol pump India', 'fuel station forecourt'],
  'ev-charging': ['electric vehicle charging station', 'electric car charging'],
  'bike-repair': ['motorcycle repair workshop', 'motorcycle mechanic India'],
  'car-repair': ['car repair garage workshop', 'auto mechanic under car'],
  mechanics: ['mechanic tools workshop', 'tyre repair shop India'],
  'car-wash': ['car wash foam', 'automatic car wash'],
  parking: ['multi-storey car park interior', 'motorcycles parked India'],
  electricians: ['electrician working wires', 'electrical switchboard installation'],
  plumbers: ['plumber fixing pipe', 'plumbing tools pipes'],
  carpenters: ['carpenter workshop woodworking', 'carpenter at work India'],
  painters: ['house painter roller wall', 'paint cans brushes'],
  cleaning: ['cleaning supplies mop bucket', 'window cleaning'],
  'appliance-repair': ['air conditioner repair technician', 'washing machine repair'],
  yoga: ['yoga class studio', 'yoga pose outdoors India'],
  gyms: ['gym interior weights', 'fitness centre treadmills'],
  swimming: ['swimming pool lanes', 'outdoor swimming pool'],
  sports: ['badminton court indoor', 'cricket ground India', 'football turf floodlights'],
  parks: ['Lal Bagh Botanical Garden Bangalore', 'Cubbon Park Bangalore', 'city park walking path trees'],
  atms: ['ATM machine India', 'automated teller machine'],
  banks: ['bank branch building India', 'bank interior counter'],
  'public-toilets': ['public toilet building India', 'public restroom'],
  laundry: ['laundromat washing machines', 'dry cleaning clothes rack'],
  salons: ['hair salon interior', 'barber shop India'],
  'mobile-repair': ['mobile phone repair', 'mobile phone shop India'],
  courier: ['India Post office', 'red post box India'],
  hotels: ['hotel room interior bed', 'hotel lobby interior'],
  rentals: ['rental bicycles docking station', 'scooter rental'],
  attractions: ['Bangalore Palace', 'Vidhana Soudha', 'Indian temple gopuram'],
  events: ['theatre auditorium seats stage', 'cinema hall interior'],
  coworking: ['coworking space interior', 'shared office desks laptops'],
  police: ['police station India'],
  'fire-stations': ['fire engine India', 'fire station building'],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (v) => (v ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const BAD_TITLE = /logo|map|diagram|plan|icon|sign|drawing|illustration|poster|screenshot|chart|flag|stamp|label|advert|banner|portrait|\bcoat of arms\b/i;

async function search(term, quality) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrlimit: '12',
    gsrsearch: `${term} filetype:bitmap filew:>1400${quality ? ' incategory:"Quality images"' : ''}`,
    prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '500', iiextmetadatafilter: 'Artist|LicenseShortName',
  });
  // Wikimedia rate-limits anonymous API use: go slowly and back off when asked to.
  let res;
  for (let attempt = 0; attempt < 5; attempt++) {
    res = await fetch(`${API}?${params}`, { headers: UA });
    if (res.status !== 429) break;
    const wait = Math.min(120, Number(res.headers.get('retry-after')) || 25 * (attempt + 1));
    console.warn(`  rate limited, waiting ${wait}s`);
    await sleep(wait * 1000);
  }
  if (!res.ok) throw new Error(`Commons ${res.status}`);
  const json = await res.json();
  return Object.values(json.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((p) => {
      const i = p.imageinfo?.[0];
      if (!i?.thumburl || i.mime !== 'image/jpeg' || BAD_TITLE.test(p.title)) return null;
      const ratio = i.width / i.height;
      if (ratio < 1.2 || ratio > 1.95) return null;
      const artist = strip(i.extmetadata?.Artist?.value);
      const license = strip(i.extmetadata?.LicenseShortName?.value);
      return {
        thumbUrl: i.thumburl,
        url: i.thumbwidth === 500 && i.width >= 960 ? i.thumburl.replace('/500px-', '/960px-') : i.thumburl,
        title: p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, ''),
        credit: [artist && artist.length < 50 ? artist : null, license, 'Wikimedia Commons'].filter(Boolean).join(' · '),
        sourceUrl: i.descriptionurl,
      };
    })
    .filter(Boolean);
}

async function review() {
  // Resumable: categories that already have candidates are kept as they are.
  let out = {};
  try {
    out = JSON.parse(await readFile(CANDIDATES, 'utf8'));
  } catch {
    /* first run */
  }
  for (const [category, terms] of Object.entries(TERMS)) {
    if ((out[category]?.length ?? 0) >= 3) {
      console.log(`${category.padEnd(18)} ${out[category].length} (kept)`);
      continue;
    }
    const picked = [];
    const seen = new Set();
    for (const quality of [false]) {
      for (const term of terms) {
        if (picked.length >= PER_CATEGORY) break;
        try {
          // Round-robin across phrases so one phrase does not fill the whole pool.
          let taken = 0;
          for (const c of await search(term, quality)) {
            if (seen.has(c.thumbUrl) || picked.length >= PER_CATEGORY || taken >= 2) continue;
            seen.add(c.thumbUrl);
            picked.push(c);
            taken++;
          }
        } catch (e) {
          console.warn(`  ${category} / ${term}: ${e.message}`);
        }
        await sleep(1600);
      }
    }
    out[category] = picked;
    console.log(`${category.padEnd(18)} ${picked.length}`);
    await writeFile(CANDIDATES, JSON.stringify(out, null, 1));
  }

  const rows = Object.entries(out)
    .map(([cat, list]) => `<tr><th>${cat}</th>${list.map((c, i) => `<td><img src="${c.thumbUrl}" loading="eager"><b>${i}</b></td>`).join('')}</tr>`)
    .join('\n');
  await writeFile(
    new URL('../public/_imagery-review.html', import.meta.url),
    `<!doctype html><meta charset="utf-8"><title>Imagery review</title><style>body{margin:8px;font:12px system-ui;background:#fff}table{border-collapse:collapse}th{width:92px;text-align:left;font-size:11px;vertical-align:middle}td{position:relative;padding:2px}img{width:150px;height:100px;object-fit:cover;display:block}b{position:absolute;left:4px;top:4px;background:#000;color:#fff;padding:0 4px;font-size:11px}</style><table>${rows}</table>`,
  );
  console.log('\nWrote public/_imagery-review.html and scripts/.imagery-candidates.json');
}

/** Short stable id for a file name, so re-runs reuse what is already downloaded. */
function shortHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

async function fetchRetry(url, what) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.ok) return res;
    if (res.status !== 429 && res.status < 500) throw new Error(`${what}: HTTP ${res.status}`);
    const wait = Math.min(180, Number(res.headers.get('retry-after')) || 20 * (attempt + 1));
    console.warn(`  ${what}: HTTP ${res.status}, waiting ${wait}s`);
    await sleep(wait * 1000);
  }
  throw new Error(`${what}: gave up after repeated rate limiting`);
}

/** Full author and licence for each file, for the credits page. Keyed by the title with spaces. */
async function fetchLicences(fileTitles) {
  const out = new Map();
  for (let i = 0; i < fileTitles.length; i += 25) {
    const params = new URLSearchParams({
      action: 'query', format: 'json', titles: fileTitles.slice(i, i + 25).join('|'),
      prop: 'imageinfo', iiprop: 'extmetadata', iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl',
    });
    const json = await (await fetchRetry(`${API}?${params}`, 'licence lookup')).json();
    for (const page of Object.values(json.query?.pages ?? {})) {
      const meta = page.imageinfo?.[0]?.extmetadata ?? {};
      out.set(page.title.replace(/_/g, ' '), {
        artist: strip(meta.Artist?.value),
        license: strip(meta.LicenseShortName?.value),
        licenseUrl: strip(meta.LicenseUrl?.value),
      });
    }
    await sleep(1200);
  }
  return out;
}

const fileTitleOf = (sourceUrl) => decodeURIComponent(sourceUrl.split('/wiki/')[1] ?? '').replace(/_/g, ' ');
const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * Download every selected photo once, re-encode it as WebP at two widths, and write the credits
 * page. Photos already on disk are reused, so an interrupted run can simply be started again.
 */
async function bundle(selected) {
  const { default: sharp } = await import('sharp');
  const dir = new URL('../public/imagery/', import.meta.url);
  await mkdir(dir, { recursive: true });

  const all = Object.entries(selected).flatMap(([category, list]) => list.map((c) => ({ category, c })));
  const licences = await fetchLicences([...new Set(all.map(({ c }) => fileTitleOf(c.sourceUrl)))]);

  const out = {};
  const credits = [];
  const wanted = new Set(['CREDITS.md']);
  let downloaded = 0;
  let reused = 0;
  let failed = 0;
  let bytes = 0;

  for (const { category, c } of all) {
    const base = `${category}-${shortHash(c.sourceUrl)}`;
    const thumbName = `${base}.webp`;
    const largeName = `${base}-lg.webp`;
    const thumbFile = new URL(thumbName, dir);
    const largeFile = new URL(largeName, dir);
    const lic = licences.get(fileTitleOf(c.sourceUrl)) ?? { artist: '', license: '', licenseUrl: '' };
    const credit = [lic.artist ? clip(lic.artist, 60) : null, lic.license || null, 'Wikimedia Commons'].filter(Boolean).join(' · ');

    let local = existsSync(thumbFile) && existsSync(largeFile);
    if (local) reused++;
    else {
      try {
        const res = await fetchRetry(c.url.split('?')[0], c.title);
        const source = Buffer.from(await res.arrayBuffer());
        // rotate() applies EXIF orientation; the re-encode drops all other metadata.
        await sharp(source).rotate().resize({ width: 960, withoutEnlargement: true }).webp({ quality: 76 }).toFile(fileURLToPath(largeFile));
        await sharp(source).rotate().resize({ width: 480, withoutEnlargement: true }).webp({ quality: 72 }).toFile(fileURLToPath(thumbFile));
        local = true;
        downloaded++;
        await sleep(1300);
      } catch (e) {
        failed++;
        console.warn(`  kept remote: ${e.message}`);
      }
    }

    if (local) {
      wanted.add(thumbName).add(largeName);
      bytes += (await stat(thumbFile)).size + (await stat(largeFile)).size;
    }
    (out[category] ??= []).push({
      thumbUrl: local ? `/imagery/${thumbName}` : c.thumbUrl.split('?')[0],
      url: local ? `/imagery/${largeName}` : c.url.split('?')[0],
      title: c.title,
      credit: credit || c.credit,
      sourceUrl: c.sourceUrl,
    });
    credits.push({ file: local ? thumbName : '(not bundled)', title: c.title, ...lic, sourceUrl: c.sourceUrl });
    if ((downloaded + reused + failed) % 20 === 0) console.log(`  ${downloaded + reused + failed}/${all.length}`);
  }

  // Remove files left over from an earlier, different selection.
  for (const name of await readdir(dir)) if (!wanted.has(name)) await unlink(new URL(name, dir));

  const cell = (v) => String(v || '').replace(/\|/g, '\\|');
  const rows = credits
    .sort((a, b) => a.file.localeCompare(b.file))
    .map((r) => `| ${cell(r.file)} | [${cell(r.title)}](${r.sourceUrl}) | ${cell(r.artist) || 'See source page'} | ${r.licenseUrl ? `[${cell(r.license)}](${r.licenseUrl})` : cell(r.license) || 'See source page'} |`);
  await writeFile(
    new URL('CREDITS.md', dir),
    `# Photo credits

The photographs in this folder come from [Wikimedia Commons](https://commons.wikimedia.org) and are
used as illustrative category imagery in NearMe. Each one was resized and converted to WebP;
nothing else was changed. They remain under the licence of the original, linked below, and each
"-lg" file is the larger rendition of the file listed.

Generated by \`scripts/build-imagery.mjs --write --bundle\`. Do not edit by hand.

| File | Title and source | Author | Licence |
| --- | --- | --- | --- |
${rows.join('\n')}
`,
  );

  console.log(`Bundled ${downloaded} new, ${reused} already on disk, ${failed} left remote. public/imagery is ${(bytes / 1024 / 1024).toFixed(1)} MB.`);
  return out;
}

async function write(exclude, bundled) {
  const all = JSON.parse(await readFile(CANDIDATES, 'utf8'));
  const skip = new Set(exclude);
  const selected = {};
  for (const [category, list] of Object.entries(all)) {
    const kept = list.filter((_, i) => !skip.has(`${category}:${i}`)).slice(0, KEEP);
    if (kept.length) selected[category] = kept;
  }

  // Hot-linked by default; --bundle copies the photos into public/imagery and points at those.
  const out = bundled
    ? await bundle(selected)
    : Object.fromEntries(
        Object.entries(selected).map(([category, kept]) => [
          category,
          kept.map((c) => ({ thumbUrl: c.thumbUrl.split('?')[0], url: c.url.split('?')[0], title: c.title, credit: c.credit, sourceUrl: c.sourceUrl })),
        ]),
      );

  const body = `/**
 * Generated by scripts/build-imagery.mjs. Do not edit by hand.
 * Real photographs from Wikimedia Commons used as illustrative category imagery.
 * Keys are category ids or \`group:<groupId>\`. Authors and licences: public/imagery/CREDITS.md
 */
export interface ImageryEntry {
  /** About 480px wide, for cards. */
  thumbUrl: string;
  /** Up to 960px wide, for covers and the photo viewer. */
  url: string;
  title: string;
  credit: string;
  sourceUrl: string;
}

export const IMAGERY: Record<string, ImageryEntry[]> = ${JSON.stringify(out, null, 1)};
`;
  await writeFile(new URL('../src/data/imagery.generated.ts', import.meta.url), body);
  const total = Object.values(out).reduce((n, l) => n + l.length, 0);
  console.log(`Wrote src/data/imagery.generated.ts: ${total} photos across ${Object.keys(out).length} categories`);
}

/**
 * Candidates rejected in the visual review of the current candidate set (people as the subject,
 * historic or black-and-white photos, street scenes that do not show the category, duplicates).
 * Re-running --review produces a new set: review it again and replace this list.
 */
const REVIEWED_EXCLUDE = [
  'restaurants:5', 'cafes:3', 'bakeries:3', 'desserts:0', 'street-food:0', 'street-food:2', 'fast-food:1', 'fast-food:2', 'fast-food:3',
  'hospitals:1', 'clinics:0', 'clinics:1', 'medical-stores:2', 'medical-stores:3', 'diagnostic-labs:2', 'supermarkets:1', 'supermarkets:2',
  'electronics:3', 'clothing:2', 'stores:2', 'stores:3', 'stores:4', 'stores:5', 'car-repair:1', 'mechanics:2', 'parking:3',
  'electricians:0', 'electricians:2', 'carpenters:3', 'cleaning:0', 'cleaning:1', 'appliance-repair:2', 'appliance-repair:3',
  'sports:0', 'sports:1', 'parks:0', 'parks:3', 'atms:0', 'atms:1', 'banks:1', 'banks:3', 'public-toilets:0', 'laundry:3', 'salons:2',
  'mobile-repair:2', 'courier:0', 'courier:1', 'attractions:1', 'events:0', 'coworking:2',
  // Near-duplicates of a photo already kept for the same category.
  'cafes:5', 'police:1', 'plumbers:1', 'sports:5', 'attractions:3',
];

const args = process.argv.slice(2);
if (args.includes('--review')) await review();
else if (args.includes('--write')) {
  const i = args.indexOf('--exclude');
  await write(i >= 0 ? (args[i + 1] ?? '').split(',').filter(Boolean) : REVIEWED_EXCLUDE, args.includes('--bundle'));
} else console.log('Usage: node scripts/build-imagery.mjs --review | --write [--bundle] [--exclude cat:index,...]');
