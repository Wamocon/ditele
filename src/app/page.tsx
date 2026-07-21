import { redirect } from "next/navigation";
import { defaultLocale } from "@/shared/i18n/config";

/** Root redirect into the default locale. */
export default function RootPage() {
  redirect(`/${defaultLocale}`);
}
