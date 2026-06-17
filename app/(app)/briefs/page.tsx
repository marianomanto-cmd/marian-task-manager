import { redirect } from "next/navigation";

import { BriefsBoard } from "@/components/briefs/briefs-board";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Briefs · Agency Board",
};

export default async function BriefsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <BriefsBoard />;
}
