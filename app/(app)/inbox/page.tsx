import { Inbox } from "lucide-react";

import { PagePlaceholder } from "@/components/shell/page-placeholder";

export const metadata = {
  title: "Bandeja · Agency Board",
};

export default function InboxPage() {
  return (
    <PagePlaceholder
      title="Bandeja AI"
      description="Mails sincronizados con Gmail, clasificados y resumidos por Claude."
      icon={Inbox}
      phase="Fase 2 (sync Gmail) + Fase 3 (clasificación IA)"
    />
  );
}
