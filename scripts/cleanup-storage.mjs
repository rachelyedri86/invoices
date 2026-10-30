// Finds (and optionally deletes) orphan files in the private Storage bucket "invoices".
//
// Why orphans exist: the browser uploads a file directly to Storage under
// <user id>/<uuid>.<ext> and only afterwards asks the server to link it to an invoice
// (invoices.file_path). If the user closes the tab, the network drops, extraction fails,
// or the user replaces a file, the uploaded object is never linked (or no longer linked)
// and stays in the bucket forever. Nothing else removes it, so the bucket grows without a cap.
//
// An object is an orphan when it is older than 24 hours (so uploads still in progress are
// left alone) and its full path does not appear in any invoices.file_path.
//
// Default is a DRY RUN that only lists the candidates. Pass --delete to remove them.
// Run: npm run storage:cleanup            (dry run)
//      npm run storage:cleanup -- --delete
import { admin } from "./lib.mjs";

const BUCKET = "invoices";
const PAGE = 1000;
const DELETE_BATCH = 100;
const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const doDelete = process.argv.includes("--delete");

function fail(label, error) {
  console.error(`שגיאה ב${label}:`, error.message);
  process.exit(1);
}

/** Lists every entry directly under `prefix`, page by page until a page is short. */
async function listAll(prefix) {
  const entries = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage
      .from(BUCKET)
      .list(prefix, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) fail(`רשימת הקבצים (${prefix || "שורש"})`, error);
    entries.push(...data);
    if (data.length < PAGE) return entries;
  }
}

/** All non-null invoices.file_path values (paged, since the API caps rows per request). */
async function linkedPaths() {
  const paths = new Set();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("invoices")
      .select("file_path")
      .not("file_path", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) fail("טעינת החשבוניות", error);
    for (const row of data) paths.add(row.file_path);
    if (data.length < PAGE) return paths;
  }
}

const formatSize = (bytes) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.ceil(bytes / 1024)}KB`;
const formatAge = (ms) => {
  const hours = Math.floor(ms / 3600000);
  return hours >= 48 ? `${Math.floor(hours / 24)} ימים` : `${hours} שעות`;
};

// ---------- Collect ----------
const linked = await linkedPaths();
const now = Date.now();
const candidates = [];
let scanned = 0;

// Top level: one folder per user id (folders come back with id === null).
for (const entry of await listAll("")) {
  const files = entry.id === null ? (await listAll(entry.name)).map((f) => ({ ...f, folder: entry.name })) : [entry];
  for (const file of files) {
    if (file.id === null) continue; // a deeper folder; uploads are never nested further
    scanned++;
    const path = file.folder ? `${file.folder}/${file.name}` : file.name;
    const age = now - new Date(file.created_at).getTime();
    if (!(age > MIN_AGE_MS) || linked.has(path)) continue;
    candidates.push({ path, size: file.metadata?.size ?? 0, age });
  }
}

// ---------- Report ----------
const totalSize = candidates.reduce((sum, c) => sum + c.size, 0);
for (const c of candidates) console.log(`  ${c.path}  ${formatSize(c.size)}  ${formatAge(c.age)}`);
console.log(
  `נסרקו ${scanned} קבצים, ${linked.size} מקושרים לחשבוניות. ` +
    `נמצאו ${candidates.length} קבצים יתומים בני יותר מ-24 שעות (${formatSize(totalSize)}).`,
);

if (!doDelete) {
  if (candidates.length) console.log("זו הרצת בדיקה בלבד, שום דבר לא נמחק. כדי למחוק: npm run storage:cleanup -- --delete");
  process.exit(0);
}

// ---------- Delete ----------
let deleted = 0;
for (let i = 0; i < candidates.length; i += DELETE_BATCH) {
  const paths = candidates.slice(i, i + DELETE_BATCH).map((c) => c.path);
  const { data, error } = await admin.storage.from(BUCKET).remove(paths);
  if (error) {
    console.error(`שגיאה במחיקה (נמחקו עד כה ${deleted}):`, error.message);
    process.exit(1);
  }
  deleted += data.length;
}
console.log(`✔ נמחקו ${deleted} קבצים יתומים.`);
