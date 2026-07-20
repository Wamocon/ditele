import Link from "next/link";

import { StatePanel } from "@/shared/ui/state-panel";

export default function NotFound() {
  return (
    <main className="container content-section">
      <StatePanel
        title="Page not found"
        description="The page may have moved, or your account may not have access to it."
        action={<Link className="button" href="/en">Return home</Link>}
      />
    </main>
  );
}
