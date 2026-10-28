import { redirect } from "next/navigation"
import { requireQcAccess } from "@/lib/auth/guards"
import { QcRecordForm } from "@/components/features/qc/qc-record-form"

export default async function NewQcRecordPage() {
  const auth = await requireQcAccess()
  if (!auth.ok) redirect("/dashboard")

  return <QcRecordForm />
}
