import type { Route } from "next";
import Link from "next/link";
import Image from "next/image";
import { Container } from "./container";
import { PUBLIC_NAV } from "./nav-config";

/**
 * Hidden below lg — a footer under a fixed tab bar is unreachable dead weight.
 * Its links move into the "Mehr" sheet on mobile.
 */
export function AppFooter({ locale }: { locale: string }) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-12 hidden border-t border-[--color-border] bg-[--color-surface] py-10 lg:block">
      <Container className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <Image src="/footerlogo.svg" alt="DiTeLe" width={150} height={43} className="h-[43px] w-auto" />
          <nav aria-label="Fußzeilennavigation">
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {PUBLIC_NAV.filter((i) => i.path !== "").map((item) => (
                <li key={item.path}>
                  <Link
                    href={`/${locale}${item.path}` as Route}
                    className="text-[13px] text-[--color-fg-muted] hover:text-[--color-brand] hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="text-[13px] text-[--color-fg-subtle]">
          © {year} WAMOCON Academy
        </p>
      </Container>
    </footer>
  );
}
