import { redirect } from "next/navigation";

import { TimelinerBoard } from "@/components/timeliner/timeliner-board";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Timeliner · Agency Board",
};

export default async function TimelinerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <TimelinerBoard />;
}
