import Link from "next/link";
import { isAdmin } from "@/lib/admin-auth";
import { logout } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin – Naomi Katz Art" };

const NAV = [
  ["/admin", "Reservations"],
  ["/admin/stock", "Stock"],
  ["/admin/settings", "Settings"],
  ["/admin/alerts", "Alerts"],
  ["/admin/bigcartel", "Big Cartel"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const authed = await isAdmin();
  return (
    <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-5">
      {authed && (
        <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line pb-3 mb-6">
          <strong className="tracking-[0.25em] text-sm">NAOMI KATZ ADMIN</strong>
          <nav className="flex gap-4 text-sm">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className="hover:text-accent">
                {label}
              </Link>
            ))}
          </nav>
          <form action={logout} className="ml-auto">
            <button className="text-sm text-muted hover:text-accent">Log out</button>
          </form>
        </header>
      )}
      {children}
    </div>
  );
}
