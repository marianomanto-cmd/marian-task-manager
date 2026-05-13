import { ListChecks } from "lucide-react";

import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = {
  title: "Tareas · Agency Board",
};

export default function TasksPage() {
  return (
    <PagePlaceholder
      title="Tareas"
      description="CRUD de tareas con estado, prioridad y fecha de entrega."
      icon={ListChecks}
      phase="Fase 1"
    />
  );
}
