import Link from "next/link"
import { ArrowRight, ShieldCheck, SlidersHorizontal, Users, Warehouse } from "lucide-react"
import { Card, Chip, PageHeader, SectionTitle } from "@/components/primitives"

// Admin landing. Was zinc-only — the ONLY screen in the app on a second neutral
// ramp, which made it look like a different product. Now on the shared tokens.
//
// With real navigation in place this no longer has to be the only route out, but
// it stays a hub: cards state what each area is for, which a tab label cannot.
//
// No "Submission history" card: an admin files no records, so the submissions log
// is not their work. Records are the supervisors' and the manager dashboard's.
const AREAS = [
  {
    href: "/dashboard/admin/users",
    Icon: Users,
    title: "User management",
    body: "Create accounts, assign roles, departments and rotation groups, reset passwords.",
  },
  {
    href: "/dashboard/procurement/stock",
    Icon: Warehouse,
    title: "Stock levels",
    body: "Every tracked material with its remaining balance and days of cover.",
  },
  {
    href: "/dashboard/admin/settings",
    Icon: SlidersHorizontal,
    title: "Settings",
    body: "The numbers behind every projection: the production forecast, what each container holds, and the per-carton recipes.",
  },
]

export function AdminDashboard() {
  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader title="Administrator" description="Manage users, roles, departments and access." />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {AREAS.map(({ href, Icon, title, body }) => (
          <Link key={href} href={href} className="group">
            <Card padded className="h-full hover-lift">
              <span className="w-11 h-11 rounded-xl bg-brand-subtle text-brand flex items-center justify-center shrink-0 transition-colors group-hover:bg-brand group-hover:text-brand-ink">
                <Icon className="w-5 h-5" aria-hidden="true" />
              </span>
              <div className="mt-3">
                <h3 className="text-base font-bold text-ink-primary flex items-center gap-1.5">
                  {title}
                  <ArrowRight className="w-3.5 h-3.5 text-ink-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </h3>
                <p className="text-sm text-ink-secondary mt-1">{body}</p>
              </div>
            </Card>
          </Link>
        ))}

        {/* Not a link, and says why — an unexplained disabled card reads as a bug. */}
        <Card padded className="h-full opacity-70">
          <span className="w-11 h-11 rounded-xl bg-surface-sunken text-ink-muted flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" aria-hidden="true" />
          </span>
          <div className="mt-3">
            <SectionTitle className="flex items-center gap-2">
              Permissions <Chip tone="neutral">Not yet available</Chip>
            </SectionTitle>
            <p className="text-sm text-ink-secondary mt-1">
              Roles currently carry fixed permissions, set in the database.
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
