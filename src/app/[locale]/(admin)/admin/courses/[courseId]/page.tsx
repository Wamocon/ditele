import { PageHeader } from "@/shared/layout";
import { Card } from "@/shared/ui";

/**
 * STUB — owned by WS-5. Replace this file with the real page.
 * Do not delete it: every route file exists from Wave 0a so two chats can
 * never race to create the same path.
 */
export default function Page() {
  return (
    <>
      <PageHeader title="Kurs bearbeiten" />
      <Card className="flex flex-col items-center gap-2 py-12 text-center">
        <p className="text-[18px] font-semibold">Diese Seite wird gerade gebaut</p>
        <p className="text-[13px] text-[--color-fg-muted]">Zuständig: WS-5</p>
      </Card>
    </>
  );
}
