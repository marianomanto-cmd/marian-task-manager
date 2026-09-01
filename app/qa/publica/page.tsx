import { notFound } from "next/navigation";

import Inner from "./inner";

/**
 * QA harness, development only.
 *
 * Mounts the Gantt over a fixed fixture so the Playwright suite in `qa/` can
 * drive every interaction without a session or a database. It renders nothing
 * in production — there is no reason for a debug surface to exist there.
 */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Inner />;
}
