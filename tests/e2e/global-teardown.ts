import { adminClient, deleteInvoices, TAG } from "./helpers";

// Backstop after the run: each test deletes what it created, and this removes anything tagged with
// this run's TEST-<runId> prefix that is still there (e.g. after a crash mid-test).
export default async function globalTeardown() {
  const { data } = await adminClient().from("invoices").select("id").like("supplier_name", `${TAG}%`);
  const ids = (data ?? []).map((r) => r.id);
  await deleteInvoices(ids);
  if (ids.length) console.log(`E2E teardown: deleted ${ids.length} leftover test invoices (${TAG})`);
}
