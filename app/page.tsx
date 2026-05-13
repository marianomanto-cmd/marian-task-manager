import { redirect } from "next/navigation";

import { isAdminEmail } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  redirect(isAdminEmail(user?.email) ? "/inbox" : "/tasks");
}
