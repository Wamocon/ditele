import Image from "next/image";
import Link from "next/link";

import type { Locale } from "@/shared/i18n/config";
import { localizedRoute } from "@/shared/i18n/routes";

export function BrandLink({ locale }: { locale: Locale }) {
  return (
    <Link className="brand-link" href={localizedRoute(locale, "")} aria-label="DiTeLe home">
      <Image src="/assets/ditele-logo.svg" alt="DiTeLe" width={150} height={40} priority />
    </Link>
  );
}
