import { redirect } from "next/navigation";

import { ProjectsBoard } from "@/components/projects/projects-board";
import { isAdminEmail } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Proyectos · Agency Board",
};

export default async function ProjectsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The proxy already redirects non-admins; this keeps a defensive guard.
  const isAdmin = isAdminEmail(user.email);
  return <ProjectsBoard canEdit={isAdmin} />;
}
