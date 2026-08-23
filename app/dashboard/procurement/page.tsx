import { redirect } from "next/navigation"

// The procurement index previously hosted a second, stale "receive materials"
// form whose field names no longer matched the API (it silently recorded zeros)
// and which nothing linked to. The canonical flows are the stock dashboard and
// the receive/issue form, so this route now redirects to the dashboard.
export default function ProcurementIndex() {
  redirect("/dashboard/procurement/stock")
}
