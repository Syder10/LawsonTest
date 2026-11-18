import { redirect, notFound } from "next/navigation"
import { requireQcAccess } from "@/lib/auth/guards"
import { QcDetailClient } from "@/components/features/qc/qc-detail-client"

export default async function QcDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const auth = await requireQcAccess()
  if (!auth.ok) redirect("/dashboard")

  const { id } = await props.params
  if (!id) notFound()

  return <QcDetailClient recordId={id} />
}
