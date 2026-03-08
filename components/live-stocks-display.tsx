"use client"

import { useEffect, useState } from "react"
import { Activity } from "lucide-react"

interface LiveStockInfo {
  quantityProduced: number
  quantityLoaded: number
  available: number
}

interface LiveStocksData {
  bitters: LiveStockInfo
  ginger: LiveStockInfo
}

export function LiveStocksDisplay() {
  const [liveStocks, setLiveStocks] = useState<LiveStocksData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchLiveStocks()
    // Refresh every 30 seconds to show latest data
    const interval = setInterval(fetchLiveStocks, 30000)
    return () => clearInterval(interval)
  }, [])

  const fetchLiveStocks = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const response = await fetch("/api/live-stocks")
      if (!response.ok) {
        throw new Error("Failed to fetch live stocks")
      }
      const data = await response.json()
      setLiveStocks(data)
    } catch (err) {
      console.error("[v0] Error fetching live stocks:", err)
      setError("Unable to load live stocks")
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusColor = (available: number) => {
    if (available <= 0) return "bg-red-100 border-red-300"
    if (available <= 50) return "bg-yellow-100 border-yellow-300"
    return "bg-green-100 border-green-300"
  }

  const getIndicatorColor = (available: number) => {
    if (available <= 0) return "bg-red-500"
    if (available <= 50) return "bg-yellow-500"
    return "bg-green-500"
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Activity size={18} className="text-emerald-700 animate-pulse" />
        <span className="text-xs text-muted-foreground">Loading live stocks...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2">
        <Activity size={18} className="text-red-700" />
        <span className="text-xs text-red-600">{error}</span>
      </div>
    )
  }

  if (!liveStocks) {
    return (
      <div className="flex items-center gap-2">
        <Activity size={18} className="text-emerald-700" />
        <span className="text-xs text-muted-foreground">No stock data available</span>
      </div>
    )
  }

  const products = [
    { name: "Bitters", data: liveStocks.bitters },
    { name: "Ginger", data: liveStocks.ginger },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity size={18} className="text-emerald-700" />
        <h3 className="text-sm font-semibold text-emerald-950">Available Stocks (Cartons)</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {products.map((product) => (
          <div
            key={product.name}
            className={`p-3 rounded-lg border ${getStatusColor(product.data.available)}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="text-xs font-semibold text-emerald-950">{product.name}</p>
                <p className="text-lg font-bold text-emerald-700 mt-1">{product.data.available}</p>
                <p className="text-xs text-emerald-600/70 mt-1">Live Cartons Available</p>
              </div>
              <div
                className={`w-3 h-3 rounded-full ${getIndicatorColor(product.data.available)} flex-shrink-0 mt-1`}
              />
            </div>

            {/* Breakdown details - only show if values are greater than 0 */}
            {(product.data.quantityProduced > 0 || product.data.quantityLoaded > 0) && (
              <div className="mt-2 pt-2 border-t border-current/10 text-xs text-emerald-700/70 space-y-0.5">
                {product.data.quantityProduced > 0 && (
                  <div className="flex justify-between">
                    <span>Produced:</span>
                    <span className="font-medium">+{product.data.quantityProduced}</span>
                  </div>
                )}
                {product.data.quantityLoaded > 0 && (
                  <div className="flex justify-between">
                    <span>Loaded:</span>
                    <span className="font-medium">-{product.data.quantityLoaded}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
