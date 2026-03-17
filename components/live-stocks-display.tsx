"use client"

import { useEffect, useState } from "react"
import { Activity, AlertTriangle } from "lucide-react"

interface LiveStockInfo {
  quantityProduced: number
  quantityLoaded: number
  available: number
  minimumThreshold: number
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

  const isLowStock = (available: number, threshold: number) => {
    // If the database has a threshold > 0, use it. Otherwise, default to 50 for safety.
    const activeThreshold = threshold > 0 ? threshold : 50;
    return available <= activeThreshold;
  }

  const getStatusClasses = (available: number, threshold: number) => {
    if (available <= 0) return "bg-red-50 border-red-300"
    if (isLowStock(available, threshold)) return "bg-red-50 border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
    return "bg-emerald-50 border-emerald-200"
  }

  const getIndicatorColor = (available: number, threshold: number) => {
    if (available <= 0) return "bg-red-600"
    if (isLowStock(available, threshold)) return "bg-red-500 animate-pulse"
    return "bg-emerald-500"
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
        {products.map((product) => {
          const isDanger = isLowStock(product.data.available, product.data.minimumThreshold)
          
          return (
            <div
              key={product.name}
              className={`p-3 rounded-lg border transition-all duration-500 ${getStatusClasses(product.data.available, product.data.minimumThreshold)}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`text-xs font-semibold ${isDanger ? 'text-red-900' : 'text-emerald-950'}`}>
                      {product.name}
                    </p>
                    {isDanger && (
                      <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full animate-pulse">
                        <AlertTriangle size={10} />
                        Low Stock
                      </span>
                    )}
                  </div>
                  
                  <p className={`text-xl font-bold mt-1.5 ${isDanger ? 'text-red-700' : 'text-emerald-700'}`}>
                    {product.data.available}
                  </p>
                  
                  <div className="flex items-center gap-2 mt-1">
                    <p className={`text-xs ${isDanger ? 'text-red-600/70' : 'text-emerald-600/70'}`}>
                      Live Cartons Available
                    </p>
                    {product.data.minimumThreshold > 0 && (
                      <span className="text-[10px] text-muted-foreground bg-black/5 px-1.5 py-0.5 rounded">
                        Min: {product.data.minimumThreshold}
                      </span>
                    )}
                  </div>
                </div>
                <div
                  className={`w-3 h-3 rounded-full ${getIndicatorColor(product.data.available, product.data.minimumThreshold)} flex-shrink-0 mt-1`}
                />
              </div>

              {/* Breakdown details - only show if values are greater than 0 */}
              {(product.data.quantityProduced > 0 || product.data.quantityLoaded > 0) && (
                <div className={`mt-3 pt-2 border-t text-xs space-y-1 ${isDanger ? 'border-red-200 text-red-800/70' : 'border-emerald-200/50 text-emerald-700/70'}`}>
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
          )
        })}
      </div>
    </div>
  )
}
