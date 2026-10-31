import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { requireTestEnv } from "../env";
import type { ExtractionFixture } from "../../src/lib/extract-mock";

export const RUN_ID = process.env.TEST_RUN_ID ?? "local";
/** Every invoice the tests submit gets this supplier-name prefix (deleted in teardown). */
export const TAG = `TEST-${RUN_ID}`;
export const REAL_EXTRACTION = process.env.EXTRACTION_PROVIDER === "anthropic";

export const DEMO_USERS = {
  employee: "עדי עובדת",
  manager: "משה מנהל",
  senior: "דנה בכירה",
  accounting: "חן חשבונות",
  admin: "אדמין דמו",
} as const;
export type DemoRole = keyof typeof DEMO_USERS;

const ROOT = path.resolve(__dirname, "../..");

export function fixtures(): ExtractionFixture[] {
  return JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/extractions.json"), "utf8")).fixtures;
}

export function fixture(name: string): ExtractionFixture & { path: string } {
  const f = fixtures().find((x) => x.name === name);
  if (!f) throw new Error(`fixture ${name} not found in tests/fixtures/extractions.json`);
  return { ...f, path: path.join(ROOT, f.file) };
}

/** Service-key client for setup checks and cleanup (never used to act on behalf of a user). */
export function adminClient() {
  const env = requireTestEnv();
  return createClient(env.supabaseUrl, env.secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** A fresh browser context signed in as a demo user through the development quick-login button. */
export async function signIn(browser: Browser, role: DemoRole): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`^${DEMO_USERS[role]}`) }).click();
  await expect(page).not.toHaveURL(/\/login/);
  return page;
}

export async function closePage(page: Page) {
  await page.context().close();
}

/** Uploads a file through the "upload a file" input and waits for the review screen. Returns the invoice id. */
export async function upload(page: Page, file: string): Promise<{ id: string; url: URL }> {
  await page.goto("/invoices/new");
  await page.locator('input[type="file"][accept*="pdf"]').setInputFiles(file);
  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]{36}/, { timeout: REAL_EXTRACTION ? 120_000 : 60_000 });
  const url = new URL(page.url());
  return { id: url.pathname.split("/").pop()!, url };
}

/** Editor fields by the start of their label (labels also hold badges such as "חסר" or "✨ חושב"). */
export const field = {
  supplier: (p: Page) => p.getByLabel(/^שם ספק/),
  taxId: (p: Page) => p.getByLabel(/^עוסק מורשה/),
  docType: (p: Page) => p.getByLabel(/^סוג מסמך/),
  number: (p: Page) => p.getByLabel(/^מספר חשבונית/),
  date: (p: Page) => p.getByLabel(/^תאריך/),
  allocation: (p: Page) => p.getByLabel(/^מספר הקצאה/),
  currency: (p: Page) => p.getByLabel(/^מטבע/),
  before: (p: Page) => p.getByLabel(/^לפני מע״מ/),
  vat: (p: Page) => p.getByLabel(/^מע״מ/),
  total: (p: Page) => p.getByLabel(/^סה״כ לתשלום/),
  category: (p: Page) => p.getByLabel(/^קטגוריה/),
};

/** Deletes invoices (and their files) with the service key. */
export async function deleteInvoices(ids: string[]) {
  if (!ids.length) return;
  const admin = adminClient();
  const { data } = await admin.from("invoices").select("file_path").in("id", ids);
  await admin.from("invoices").delete().in("id", ids);
  const files = (data ?? []).map((r) => r.file_path).filter(Boolean) as string[];
  if (files.length) await admin.storage.from("invoices").remove(files);
}
