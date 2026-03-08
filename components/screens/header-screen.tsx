"use client"

import { useState } from "react"
import { Lock } from "lucide-react"
import Image from "next/image"

interface HeaderScreenProps {
  onContinue: (department: string, supervisorInfo: { name: string; date: string; shift: string; group: number }) => void
  onAccessDashboard: () => void
}

export default function HeaderScreen({ onContinue, onAccessDashboard }: HeaderScreenProps) {
  const [supervisorName, setSupervisorName] = useState("")
  const [shift, setShift] = useState("")
  const [group, setGroup] = useState("")
  const [department, setDepartment] = useState("")

  const handleContinue = () => {
    if (supervisorName.trim() && shift && group && department) {
      const supervisorInfo = {
        name: supervisorName,
        date: document.querySelector('input[type="date"]')?.value || new Date().toISOString().split("T")[0],
        shift,
        group: Number.parseInt(group),
      }
      onContinue(department, supervisorInfo)
    }
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="w-full max-w-md animate-fade-in-up">
      <div className="glass-panel p-8 space-y-6 overflow-hidden relative">
        <div className="flex justify-between items-center mb-4">
          <Image
            src="/logo.png"
            alt="Lawson LLC Logo"
            width={80}
            height={80}
            className="drop-shadow-md rounded-lg bg-white p-2"
          />
          <button
            onClick={onAccessDashboard}
            className="p-3 rounded-full glass-button hover:bg-emerald-100/50 border border-emerald-200/50 transition-all hover:scale-110"
            title="Manager Dashboard"
          >
            <Lock className="w-5 h-5 text-emerald-700" />
          </button>
        </div>

        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-emerald-900 tracking-tight">Supervisor Portal</h1>
          <p className="text-sm font-medium text-emerald-700/60 uppercase tracking-wider">{today}</p>
        </div>

        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-sm font-semibold text-foreground/80 mb-2">Date</label>
            <input type="date" className="glass-input" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground/80 mb-2">Supervisor Name</label>
            <input
              type="text"
              value={supervisorName}
              onChange={(e) => setSupervisorName(e.target.value)}
              placeholder="Enter your name"
              className="glass-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-foreground/80 mb-2">Shift</label>
              <select
                value={shift}
                onChange={(e) => {
                  setShift(e.target.value)
                  setGroup("")
                  setDepartment("")
                }}
                className="glass-input"
              >
                <option value="">Select Shift</option>
                <option value="Morning">Morning</option>
                <option value="Afternoon">Afternoon</option>
                <option value="Night">Night</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground/80 mb-2">Group</label>
              <select
                value={group}
                onChange={(e) => {
                  setGroup(e.target.value)
                  setDepartment("")
                }}
                disabled={!shift}
                className={`glass-input ${!shift ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <option value="">Select Group</option>
                <option value="1">Group 1</option>
                <option value="2">Group 2</option>
                <option value="3">Group 3</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground/80 mb-2">Department</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              disabled={!group}
              className={`glass-input ${!group ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <option value="">Select Department</option>
              <option value="Blowing">Blowing</option>
              <option value="Alcohol and Blending">Alcohol and Blending</option>
              <option value="Filling line">Filling line</option>
              <option value="Packaging">Packaging</option>
              <option value="Concentrate">Concentrate</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleContinue}
          disabled={!supervisorName.trim() || !shift || !group || !department}
          className="w-full glass-button-primary disabled:opacity-50 disabled:cursor-not-allowed py-3 rounded-xl font-semibold text-lg transition-all"
        >
          Continue → Select Record Type
        </button>
      </div>
    </div>
  )
}
