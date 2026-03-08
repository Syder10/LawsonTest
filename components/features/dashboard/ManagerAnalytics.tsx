"use client"

import { useEffect, useState } from "react"
import { TrendingUp, Package, Droplets, Activity } from "lucide-react"

interface KPIs {
    total_production_cartons: number
    bitters_cartons: number
    ginger_cartons: number
    live_bitters_stock: number
    live_ginger_stock: number
    total_alcohol_used_litres: number
}

export function ManagerAnalytics() {
    const [kpis, setKpis] = useState<KPIs | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchKPIs()
        const interval = setInterval(fetchKPIs, 60000) // refresh every minute
        return () => clearInterval(interval)
    }, [])

    const fetchKPIs = async () => {
        try {
            setIsLoading(true)
            setError(null)
            // Since we want today's data, we construct the request with current year and month.
            // Wait, the API endpoint by default filters by year/month if provided, otherwise all time.
            // Let's pass the current month to get the month's stats.
            const now = new Date()
            const year = now.getFullYear()
            const month = now.getMonth() + 1 // 1-indexed

            const response = await fetch(`/api/analytics/kpis?year=${year}&month=${month}`)
            if (!response.ok) {
                throw new Error("Failed to fetch KPIs")
            }
            const data = await response.json()
            setKpis(data)
        } catch (err) {
            console.error("[ManagerAnalytics] Error fetching KPIs:", err)
            setError("Unable to load analytics")
        } finally {
            setIsLoading(false)
        }
    }

    if (isLoading) {
        return (
            <div className="space-y-6">
                <div className="bg-emerald-600 p-6 rounded-3xl shadow-md text-white flex items-center gap-2">
                    <Activity className="w-5 h-5 animate-pulse" />
                    <span>Loading analytics...</span>
                </div>
            </div>
        )
    }

    if (error || !kpis) {
        return (
            <div className="space-y-6">
                <div className="bg-red-50 p-6 rounded-3xl shadow-sm border border-red-100 text-red-700">
                    {error || 'No data found'}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Total Production Card */}
            <div className="bg-emerald-600 p-6 rounded-3xl shadow-md text-white">
                <div className="flex items-center gap-3 mb-2">
                    <TrendingUp className="w-6 h-6 text-emerald-200" />
                    <h3 className="text-lg font-bold">This Month's Production</h3>
                </div>
                <p className="text-4xl font-extrabold">{kpis.total_production_cartons}</p>
                <p className="text-emerald-200 text-sm mt-1">Total cartons produced</p>

                <div className="mt-4 pt-4 border-t border-emerald-500/50 flex gap-4 text-sm font-medium">
                    <div>
                        <span className="opacity-80">Bitters: </span>
                        <span>{kpis.bitters_cartons}</span>
                    </div>
                    <div>
                        <span className="opacity-80">Ginger: </span>
                        <span>{kpis.ginger_cartons}</span>
                    </div>
                </div>
            </div>

            {/* Alcohol Used Card */}
            <div className="bg-emerald-50 p-6 rounded-3xl shadow-sm border border-emerald-100">
                <div className="flex items-center gap-3 mb-2">
                    <Droplets className="w-6 h-6 text-emerald-600" />
                    <h3 className="text-lg font-bold text-emerald-950">Alcohol Used</h3>
                </div>
                <p className="text-2xl font-bold text-emerald-800">{kpis.total_alcohol_used_litres.toLocaleString()} L</p>
                <p className="text-slate-500 text-xs mt-1">Total liters utilized this month</p>
            </div>

        </div>
    )
}
