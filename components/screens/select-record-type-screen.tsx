"use client"

import { ArrowLeft } from "lucide-react"
import Image from "next/image"

interface SelectRecordTypeScreenProps {
  department: string
  onSelectRecord: (recordType: string) => void
  onBack: () => void
}

const recordTypes: Record<string, string[]> = {
  Blowing: ["Daily Records (Preform Usage)"],
  "Alcohol and Blending": [
    "Daily Usage of Alcohol And Stock Level",
    "Daily Records for Alcohol and Blending",
    "Ginger Production",
    "Extraction Monitoring Records",
    "Caramel Stock",
  ],
  "Filling line": [
    "Filling Line Daily Records",
    "Caps Stock",
    "Labels Stock",
  ],
  Packaging: ["Packaging Daily Records"],
  Concentrate: ["Daily Records Alcohol For Concentrate", "Herbs Stock"],
}

export default function SelectRecordTypeScreen({ department, onSelectRecord, onBack }: SelectRecordTypeScreenProps) {
  const types = recordTypes[department] || []

  return (
    <div className="w-full max-w-2xl animate-fade-in-up">
      <div className="glass-panel p-8 space-y-6">
        <div className="flex items-center gap-4 pb-4 border-b border-emerald-100">
          <button
            onClick={onBack}
            className="p-2 rounded-full glass-button hover:bg-emerald-100/50 hover:scale-110 transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-emerald-700" />
          </button>
          <Image
            src="/logo.png"
            alt="Lawson LLC Logo"
            width={60}
            height={60}
            className="drop-shadow-md rounded-lg bg-white p-2"
          />
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-emerald-950">Select Record Type</h2>
            <p className="text-sm font-medium text-emerald-700/60 mt-0.5">{department} Department</p>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          {types.map((type) => (
            <button
              key={type}
              onClick={() => onSelectRecord(type)}
              className="w-full glass-button p-5 text-left border border-emerald-200/50 hover:border-emerald-400/70 hover:bg-emerald-50/50 transition-all text-emerald-950 font-semibold rounded-xl hover:scale-[1.02] hover:shadow-lg"
            >
              {type}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
