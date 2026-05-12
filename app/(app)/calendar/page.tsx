import { Calendar } from "lucide-react";

import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = {
  title: "Calendario · Agency Board",
};

export default function CalendarPage() {
  return (
    <PagePlaceholder
      title="Calendario"
      description="Vista mensual con feriados de PA, US, AR y ES, más deadlines de tareas."
      icon={Calendar}
      phase="Fase 5"
    />
  );
}
