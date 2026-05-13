import { FolderKanban } from "lucide-react";

import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = {
  title: "Proyectos · Agency Board",
};

export default function ProjectsPage() {
  return (
    <PagePlaceholder
      title="Proyectos"
      description="Campañas detectadas a partir de códigos en mails entrantes."
      icon={FolderKanban}
      phase="Fase 4"
    />
  );
}
