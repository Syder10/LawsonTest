"use client"

import { Card } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"

interface RecordTypeScreenProps {
  department: string
  onSelectRecord: (recordType: string) => void
  onBack: () => void
}

const RECORD_TYPES = {
  Packaging: ["Production Output", "Defect Report", "Machine Status"],
  Blowing: ["Bottle Production", "Scrap Report", "Temperature Log"],
  Filling: ["Fill Level Check", "Quality Report", "Downtime Log"],
  "Alcohol & Blending": ["Alcohol Usage", "Blend Report", "Inventory Check"],
}

export function RecordTypeScreen({ department, onSelectRecord, onBack }: RecordTypeScreenProps) {
  const records = RECORD_TYPES[department as keyof typeof RECORD_TYPES] || []

  return (
    <div className="w-full max-w-2xl">
      <Card className="glass-panel p-8 space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-white/10 border border-glass-border transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-primary" />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Select Record Type</h2>
            <p className="text-sm text-foreground/60 mt-1">Department: {department}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {records.map((record) => (
            <button
              key={record}
              onClick={() => onSelectRecord(record)}
              className="glass-panel p-6 text-left hover:bg-white/10 hover:border-primary/50 transition-all duration-300 hover:shadow-lg hover:neon-glow group"
            >
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{record}</h3>
              <p className="text-xs text-foreground/60 mt-2">Click to enter record</p>
            </button>
          ))}
        </div>
      </Card>
    </div>
  )
}
