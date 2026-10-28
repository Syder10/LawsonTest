import { redirect } from "next/navigation"
import { requireStockWrite } from "@/lib/auth/guards"
import { DonationForm } from "./donation-form"

export default async function NewDonationPage() {
  const auth = await requireStockWrite()
  if (!auth.ok) redirect("/dashboard/stock/donations")
  return <DonationForm />
}
