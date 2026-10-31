// Generates the test invoices (PNG/PDF) and tests/fixtures/extractions.json, which tells the
// extraction mock (src/lib/extract-mock.ts) what to "read" from each file.
// Run: npm run fixtures:generate   (then commit the files; their hashes are recorded in the JSON)
//
// Everything here is invented: suppliers, tax ids and numbers are fake.
// Text rendering depends on the fonts installed (Hebrew needs e.g. Arial), so the PNG bytes can
// differ between machines. That is why the generated files are committed and not regenerated in CI.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { imageSignature } from "../../src/lib/image-signature.ts";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const OUT_DIR = "tests/fixtures/files";

const nulls = {
  is_invoice: true,
  supplier_name: null,
  supplier_tax_id: null,
  doc_type: null,
  invoice_number: null,
  invoice_date: null,
  allocation_number: null,
  amount_before_vat: null,
  vat_amount: null,
  total_amount: null,
  currency: null,
  category: null,
  items: [],
};

// ---------- SVG drawing ----------
const W = 1000;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Right-to-left text anchored at the right margin, or left-to-right at the left margin. */
const rtl = (y, text, { size = 26, weight = "normal", x = W - 60 } = {}) =>
  `<text x="${x}" y="${y}" direction="rtl" text-anchor="start" font-size="${size}" font-weight="${weight}">${esc(text)}</text>`;
const ltr = (y, text, { size = 26, weight = "normal", x = 60 } = {}) =>
  `<text x="${x}" y="${y}" direction="ltr" text-anchor="start" font-size="${size}" font-weight="${weight}">${esc(text)}</text>`;
const rule = (y) => `<line x1="60" y1="${y}" x2="${W - 60}" y2="${y}" stroke="#555" stroke-width="2"/>`;

/** A "logo" of dark squares that differs per document, so the image signatures are far apart. */
function logo(seed) {
  let out = "";
  for (let i = 0; i < 9; i++) {
    if (((seed * 7 + 3) >> i) & 1 || i === seed % 9) {
      out += `<rect x="${60 + (i % 3) * 44}" y="${50 + Math.floor(i / 3) * 44}" width="40" height="40" fill="#1e293b"/>`;
    }
  }
  return out;
}

// Faint 4x4 background tiles, one pattern per document (any two differ in at least 6 of the 16
// tiles), so that documents with a similar layout still look different to the image signature.
const TILE_PATTERNS = [0b1010010110100101, 0b0101101001011010, 0b1100110000110011, 0b0011001111001100, 0b1111000000001111, 0b0000111111110000];

function tiles(seed, height) {
  const pattern = TILE_PATTERNS[(seed - 1) % TILE_PATTERNS.length];
  let out = "";
  for (let i = 0; i < 16; i++) {
    if ((pattern >> i) & 1) {
      out += `<rect x="${(i % 4) * (W / 4)}" y="${Math.floor(i / 4) * (height / 4)}" width="${W / 4}" height="${height / 4}" fill="#e5e7eb"/>`;
    }
  }
  return out;
}

/** Each document also gets its own page height. */
function svgPage(seed, contentHeight, body) {
  const height = Math.max(contentHeight, 900 + seed * 150);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">
<rect width="100%" height="100%" fill="#ffffff"/>
${tiles(seed, height)}
<g font-family="Arial, 'Noto Sans Hebrew', 'DejaVu Sans', sans-serif" fill="#111">${body}</g></svg>`;
}

const money = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * An Israeli-style document in Hebrew. `rows` are [label, value] pairs printed under the items;
 * a value of null leaves the line out (e.g. an invoice whose total is missing).
 */
function hebrewDocument({ seed, supplier, taxIdLine, address, title, dateLine, extraLines = [], items, rows, footer }) {
  let y = 90;
  const parts = [logo(seed)];
  parts.push(rtl(y, supplier, { size: 40, weight: "bold" }));
  y += 46;
  parts.push(rtl(y, taxIdLine, { size: 24 }));
  y += 36;
  parts.push(rtl(y, address, { size: 22 }));
  y += 40;
  parts.push(rule(y));
  y += 60;
  parts.push(rtl(y, title, { size: 34, weight: "bold" }));
  y += 46;
  parts.push(rtl(y, dateLine));
  for (const line of extraLines) {
    y += 38;
    parts.push(rtl(y, line));
  }
  y += 40;
  parts.push(rtl(y, "לכבוד: חברת הדגמה בע\"מ", { size: 24 }));
  y += 50;
  parts.push(rtl(y, "תיאור", { weight: "bold" }), rtl(y, "כמות", { weight: "bold", x: 420 }), ltr(y, "סה\"כ", { weight: "bold" }));
  y += 14;
  parts.push(rule(y));
  for (const item of items) {
    y += 44;
    parts.push(rtl(y, item.description), ltr(y, String(item.quantity), { x: 380 }), ltr(y, money(item.amount)));
  }
  y += 24;
  parts.push(rule(y));
  for (const [label, value, bold] of rows) {
    if (value == null) continue;
    y += 46;
    parts.push(rtl(y, label, { weight: bold ? "bold" : "normal", size: bold ? 30 : 26 }));
    parts.push(ltr(y, value, { weight: bold ? "bold" : "normal", size: bold ? 30 : 26 }));
  }
  y += 80;
  if (footer) parts.push(rtl(y, footer, { size: 22 }));
  return svgPage(seed, y + 80, parts.join("\n"));
}

/** An English document (foreign supplier). */
function englishDocument({ seed, supplier, address, title, lines, items, rows, currency }) {
  let y = 90;
  const parts = [logo(seed)];
  const x = 260;
  parts.push(ltr(y, supplier, { size: 40, weight: "bold", x }));
  y += 46;
  parts.push(ltr(y, address, { size: 22, x }));
  y += 60;
  parts.push(rule(y));
  y += 60;
  parts.push(ltr(y, title, { size: 34, weight: "bold" }));
  for (const line of lines) {
    y += 40;
    parts.push(ltr(y, line));
  }
  y += 60;
  parts.push(ltr(y, "Description", { weight: "bold" }), ltr(y, "Qty", { weight: "bold", x: 620 }), ltr(y, `Amount (${currency})`, { weight: "bold", x: 720 }));
  y += 14;
  parts.push(rule(y));
  for (const item of items) {
    y += 44;
    parts.push(ltr(y, item.description), ltr(y, String(item.quantity), { x: 620 }), ltr(y, money(item.amount), { x: 720 }));
  }
  y += 24;
  parts.push(rule(y));
  for (const [label, value, bold] of rows) {
    y += 46;
    parts.push(ltr(y, label, { weight: bold ? "bold" : "normal", x: 420 }), ltr(y, value, { weight: bold ? "bold" : "normal", x: 720 }));
  }
  return svgPage(seed, y + 120, parts.join("\n"));
}

/** A photo-like picture that is not an invoice at all. */
function landscape() {
  const body = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e3a8a"/><stop offset="1" stop-color="#93c5fd"/></linearGradient></defs>
<rect width="1000" height="750" fill="url(#sky)"/>
<circle cx="760" cy="180" r="90" fill="#fde047"/>
<polygon points="0,750 260,330 520,750" fill="#334155"/>
<polygon points="300,750 620,260 940,750" fill="#1f2937"/>
<rect y="620" width="1000" height="130" fill="#166534"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="750">${body}</svg>`;
}

// ---------- Minimal PDF ----------
/** A one-page PDF with Helvetica text lines ([x, y, size, text]). Latin text only (no font embedding). */
function minimalPdf(lines) {
  const escPdf = (s) => s.replace(/[\\()]/g, (c) => `\\${c}`);
  const stream = lines.map(([x, y, size, text]) => `BT /F1 ${size} Tf ${x} ${y} Td (${escPdf(text)}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

// ---------- The scenarios ----------
// `scenario` is what the E2E test does with the file; `extraction` is what the mock returns
// (and what a correct real extraction should return).
const FIXTURES = [
  {
    name: "tax-invoice",
    scenario: "חשבונית מס בשקלים, מתחת לסף",
    file: `${OUT_DIR}/tax-invoice.png`,
    render: () =>
      hebrewDocument({
        seed: 1,
        supplier: "דפוס הגליל בע\"מ",
        taxIdLine: "ח.פ 515300418 · טל' 04-6001234",
        address: "רח' החרושת 7, כרמיאל",
        title: "חשבונית מס מספר 7731",
        dateLine: "תאריך: 12/10/2026",
        extraLines: ["מספר הקצאה: 301245778"],
        items: [
          { description: "הדפסת עלונים A5", quantity: 2000, amount: 900 },
          { description: "עיצוב גרפי", quantity: 1, amount: 350 },
        ],
        rows: [
          ["סה\"כ לפני מע\"מ", "1,250.00 ₪"],
          ["מע\"מ 18%", "225.00 ₪"],
          ["סה\"כ לתשלום", "1,475.00 ₪", true],
        ],
        footer: "תודה שבחרתם בדפוס הגליל",
      }),
    extraction: {
      ...nulls,
      supplier_name: "דפוס הגליל בע\"מ",
      supplier_tax_id: "515300418",
      doc_type: "tax_invoice",
      invoice_number: "7731",
      invoice_date: "2026-10-12",
      allocation_number: "301245778",
      amount_before_vat: 1250,
      vat_amount: 225,
      total_amount: 1475,
      currency: "ILS",
      category: "ציוד משרדי",
      items: [
        { description: "הדפסת עלונים A5", quantity: 2000, amount: 900 },
        { description: "עיצוב גרפי", quantity: 1, amount: 350 },
      ],
    },
  },
  {
    name: "invoice-receipt",
    scenario: "חשבונית מס/קבלה (קבלה מבית קפה), הסכום לפני מע\"מ מחושב",
    file: "samples/receipt-cafe.png",
    extraction: {
      ...nulls,
      supplier_name: "קפה הגפן",
      supplier_tax_id: "038215476",
      doc_type: "tax_invoice_receipt",
      invoice_number: "7781",
      invoice_date: "2026-10-22",
      vat_amount: 18,
      total_amount: 118,
      currency: "ILS",
      category: "כיבוד וארוחות",
      items: [
        { description: "קפה הפוך", quantity: 2, amount: 28 },
        { description: "כריך טונה", quantity: 1, amount: 42 },
        { description: "סלט יווני", quantity: 1, amount: 48 },
      ],
    },
  },
  {
    name: "receipt",
    scenario: "קבלה בלבד, בלי פירוט מע\"מ",
    file: `${OUT_DIR}/receipt.png`,
    render: () =>
      hebrewDocument({
        seed: 2,
        supplier: "חניון המרכז",
        taxIdLine: "עוסק פטור 557812340",
        address: "רח' הנביאים 30, חיפה",
        title: "קבלה מספר R-55821",
        dateLine: "תאריך: 20/10/2026",
        items: [{ description: "חניה יומית", quantity: 1, amount: 48 }],
        rows: [["סה\"כ שולם", "48.00 ₪", true]],
        footer: "עוסק פטור - לא נגבה מע\"מ",
      }),
    extraction: {
      ...nulls,
      supplier_name: "חניון המרכז",
      supplier_tax_id: "557812340",
      doc_type: "receipt",
      invoice_number: "R-55821",
      invoice_date: "2026-10-20",
      total_amount: 48,
      currency: "ILS",
      category: "נסיעות ודלק",
      items: [{ description: "חניה יומית", quantity: 1, amount: 48 }],
    },
  },
  {
    name: "usd-above-threshold",
    scenario: "חשבונית בדולרים מעל סף האישור הנוסף (2,400$ ≈ 8,880 ₪)",
    file: `${OUT_DIR}/usd-above-threshold.png`,
    render: () =>
      hebrewDocument({
        seed: 3,
        supplier: "סייבר-טק פתרונות בע\"מ",
        taxIdLine: "ח.פ 516204771",
        address: "שד' רוטשילד 100, תל אביב",
        title: "חשבונית מס מספר ST-2026-118",
        dateLine: "תאריך: 05/10/2026",
        extraLines: ["מטבע: דולר ארה\"ב (USD)"],
        items: [{ description: "רישיון שנתי לתוכנת אבטחה", quantity: 1, amount: 2033.9 }],
        rows: [
          ["סה\"כ לפני מע\"מ", "$2,033.90"],
          ["מע\"מ 18%", "$366.10"],
          ["סה\"כ לתשלום", "$2,400.00", true],
        ],
      }),
    extraction: {
      ...nulls,
      supplier_name: "סייבר-טק פתרונות בע\"מ",
      supplier_tax_id: "516204771",
      doc_type: "tax_invoice",
      invoice_number: "ST-2026-118",
      invoice_date: "2026-10-05",
      amount_before_vat: 2033.9,
      vat_amount: 366.1,
      total_amount: 2400,
      currency: "USD",
      category: "מחשוב ותוכנה",
      items: [{ description: "רישיון שנתי לתוכנת אבטחה", quantity: 1, amount: 2033.9 }],
    },
  },
  {
    name: "missing-total",
    scenario: "חשבונית בלי שורת סה\"כ: הסה\"כ מחושב מהסכום לפני מע\"מ ומהמע\"מ",
    file: `${OUT_DIR}/missing-total.png`,
    render: () =>
      hebrewDocument({
        seed: 4,
        supplier: "הסעות דרור",
        taxIdLine: "עוסק מורשה 032145698",
        address: "רח' הגפן 3, באר שבע",
        title: "חשבונית מס מספר 4521",
        dateLine: "תאריך: 18/10/2026",
        items: [{ description: "הסעת צוות לכנס", quantity: 1, amount: 850 }],
        rows: [
          ["סה\"כ לפני מע\"מ", "850.00 ₪"],
          ["מע\"מ 18%", "153.00 ₪"],
        ],
      }),
    extraction: {
      ...nulls,
      supplier_name: "הסעות דרור",
      supplier_tax_id: "032145698",
      doc_type: "tax_invoice",
      invoice_number: "4521",
      invoice_date: "2026-10-18",
      amount_before_vat: 850,
      vat_amount: 153,
      currency: "ILS",
      category: "נסיעות ודלק",
      items: [{ description: "הסעת צוות לכנס", quantity: 1, amount: 850 }],
    },
  },
  {
    name: "unknown-currency",
    scenario: "חשבונית בליש\"ט (GBP), מטבע שלא מוגדר במערכת",
    file: `${OUT_DIR}/unknown-currency.png`,
    render: () =>
      englishDocument({
        seed: 5,
        supplier: "London Training Ltd",
        address: "12 Fleet Street, London EC4Y 1AA, UK",
        title: "INVOICE",
        lines: ["Invoice no: LT-9034", "Date: 2026-10-08", "Bill to: Demo Company Ltd, Israel"],
        currency: "GBP",
        items: [{ description: "Online workshop seat", quantity: 2, amount: 420 }],
        rows: [["Total due (GBP)", "£420.00", true]],
      }),
    extraction: {
      ...nulls,
      supplier_name: "London Training Ltd",
      invoice_number: "LT-9034",
      invoice_date: "2026-10-08",
      total_amount: 420,
      currency: "GBP",
      category: "הדרכות וכנסים",
      items: [{ description: "Online workshop seat", quantity: 2, amount: 420 }],
    },
  },
  {
    name: "not-invoice",
    scenario: "תמונה שאינה חשבונית",
    file: `${OUT_DIR}/not-invoice.png`,
    render: landscape,
    extraction: { ...nulls, is_invoice: false },
  },
  {
    name: "pdf-eur",
    scenario: "PDF באירו מספק זר",
    file: `${OUT_DIR}/pdf-eur.pdf`,
    pdf: () =>
      minimalPdf([
        [50, 780, 22, "EuroDev Summit GmbH"],
        [50, 758, 11, "Friedrichstrasse 50, 10117 Berlin, Germany - VAT ID DE298765432"],
        [50, 700, 18, "INVOICE"],
        [50, 676, 12, "Invoice no: EDS-2026-0457"],
        [50, 660, 12, "Date: 2026-09-30"],
        [50, 644, 12, "Bill to: Demo Company Ltd, Israel"],
        [50, 600, 12, "Description"],
        [400, 600, 12, "Qty"],
        [470, 600, 12, "Amount (EUR)"],
        [50, 580, 12, "Conference ticket - EuroDev Summit 2026"],
        [400, 580, 12, "2"],
        [470, 580, 12, "252.10"],
        [300, 540, 12, "Net amount"],
        [470, 540, 12, "EUR 252.10"],
        [300, 522, 12, "VAT 19%"],
        [470, 522, 12, "EUR 47.90"],
        [300, 500, 14, "Total"],
        [470, 500, 14, "EUR 300.00"],
      ]),
    extraction: {
      ...nulls,
      supplier_name: "EuroDev Summit GmbH",
      invoice_number: "EDS-2026-0457",
      invoice_date: "2026-09-30",
      amount_before_vat: 252.1,
      vat_amount: 47.9,
      total_amount: 300,
      currency: "EUR",
      category: "הדרכות וכנסים",
      items: [{ description: "Conference ticket - EuroDev Summit 2026", quantity: 2, amount: 252.1 }],
    },
  },
  {
    name: "office-png",
    scenario: "חשבונית מס לדוגמה (samples), תמונה",
    file: "samples/invoice-office.png",
    extraction: officeExtraction(),
  },
  {
    name: "office-pdf",
    scenario: "אותה חשבונית כ-PDF: כפילות של office-png",
    file: "samples/invoice-office.pdf",
    extraction: officeExtraction(),
  },
];

function officeExtraction() {
  return {
    ...nulls,
    supplier_name: "א.ב. ציוד משרדי בע\"מ",
    supplier_tax_id: "514782963",
    doc_type: "tax_invoice",
    invoice_number: "20431",
    invoice_date: "2026-10-14",
    allocation_number: "204871356",
    amount_before_vat: 780,
    vat_amount: 140.4,
    total_amount: 920.4,
    currency: "ILS",
    category: "ציוד משרדי",
    items: [
      { description: "נייר צילום A4 (קרטון)", quantity: 4, amount: 480 },
      { description: "עטים כחולים (חבילה)", quantity: 10, amount: 180 },
      { description: "קלסרים", quantity: 12, amount: 120 },
    ],
  };
}

// ---------- Write ----------
await mkdir(path.join(ROOT, OUT_DIR), { recursive: true });
const entries = [];
for (const fixture of FIXTURES) {
  const target = path.join(ROOT, fixture.file);
  if (fixture.render) await writeFile(target, await sharp(Buffer.from(fixture.render())).png({ compressionLevel: 9 }).toBuffer());
  if (fixture.pdf) await writeFile(target, fixture.pdf());
  const bytes = await readFile(target);
  const isPdf = fixture.file.endsWith(".pdf");
  entries.push({
    name: fixture.name,
    scenario: fixture.scenario,
    file: fixture.file,
    mime: isPdf ? "application/pdf" : "image/png",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    signature: isPdf ? null : await imageSignature(bytes),
    extraction: fixture.extraction,
  });
  console.log(`✔ ${fixture.file}`);
}

const json = {
  $comment:
    "Generated by tests/fixtures/generate.mjs. The extraction mock matches an upload by sha256, or for images by the closest signature (the browser re-encodes photos).",
  fixtures: entries,
};
await writeFile(path.join(ROOT, "tests/fixtures/extractions.json"), `${JSON.stringify(json, null, 2)}\n`);
console.log(`✔ tests/fixtures/extractions.json (${entries.length} fixtures)`);
