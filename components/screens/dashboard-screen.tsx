"use client"
import { Card } from "@/components/ui/card"
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Download, LogOut } from "lucide-react"

interface DashboardScreenProps {
  onLogout: () => void
}

const dashboardData = {
  blowing: [
    { hour: "6 AM", output: 450 },
    { hour: "9 AM", output: 620 },
    { hour: "12 PM", output: 580 },
    { hour: "3 PM", output: 710 },
    { hour: "6 PM", output: 680 },
  ],
  packaging: [
    { hour: "6 AM", output: 380 },
    { hour: "9 AM", output: 520 },
    { hour: "12 PM", output: 490 },
    { hour: "3 PM", output: 610 },
    { hour: "6 PM", output: 650 },
  ],
  alcohol: [
    { hour: "6 AM", usage: 45 },
    { hour: "9 AM", usage: 62 },
    { hour: "12 PM", usage: 58 },
    { hour: "3 PM", usage: 71 },
    { hour: "6 PM", usage: 68 },
  ],
  stock: [
    { item: "Raw Material A", level: 82 },
    { item: "Raw Material B", level: 65 },
    { item: "Packaging", level: 78 },
    { item: "Alcohol", level: 55 },
  ],
}

export function DashboardScreen({ onLogout }: DashboardScreenProps) {
  return (
    <div className="w-full max-w-7xl">
      {/* Header */}
      <div className="glass-panel p-6 mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Manager Dashboard
          </h1>
          <p className="text-sm text-foreground/60 mt-1">Real-time production metrics and analytics</p>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-2 glass-button py-2 px-4 text-destructive hover:bg-destructive/10"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>

      {/* Daily Summaries */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Blowing Output", value: "2,640", unit: "units", color: "from-primary" },
          { label: "Packaging Output", value: "2,650", unit: "units", color: "from-accent" },
          { label: "Alcohol Usage", value: "304L", unit: "liters", color: "from-secondary" },
          { label: "Stock Level", value: "70%", unit: "average", color: "from-chart-4" },
        ].map((stat) => (
          <Card key={stat.label} className="glass-panel p-6">
            <p className="text-sm text-foreground/60 mb-2">{stat.label}</p>
            <h3
              className={`text-2xl font-bold bg-gradient-to-r ${stat.color} to-transparent bg-clip-text text-transparent`}
            >
              {stat.value}
            </h3>
            <p className="text-xs text-foreground/40 mt-2">{stat.unit}</p>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Blowing Output Chart */}
        <Card className="glass-panel p-6">
          <h3 className="font-semibold text-foreground mb-4">Blowing Output Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={dashboardData.blowing}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 212, 255, 0.1)" />
              <XAxis dataKey="hour" stroke="rgba(224, 224, 255, 0.5)" />
              <YAxis stroke="rgba(224, 224, 255, 0.5)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(15, 15, 26, 0.95)",
                  border: "1px solid rgba(0, 212, 255, 0.3)",
                  borderRadius: "8px",
                }}
              />
              <Line type="monotone" dataKey="output" stroke="#00d4ff" strokeWidth={2} dot={{ fill: "#00ff88" }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Packaging Output Chart */}
        <Card className="glass-panel p-6">
          <h3 className="font-semibold text-foreground mb-4">Packaging Output Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={dashboardData.packaging}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 212, 255, 0.1)" />
              <XAxis dataKey="hour" stroke="rgba(224, 224, 255, 0.5)" />
              <YAxis stroke="rgba(224, 224, 255, 0.5)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(15, 15, 26, 0.95)",
                  border: "1px solid rgba(0, 255, 136, 0.3)",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey="output" fill="#00ff88" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Alcohol Usage Chart */}
        <Card className="glass-panel p-6">
          <h3 className="font-semibold text-foreground mb-4">Alcohol Usage Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={dashboardData.alcohol}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 212, 255, 0.1)" />
              <XAxis dataKey="hour" stroke="rgba(224, 224, 255, 0.5)" />
              <YAxis stroke="rgba(224, 224, 255, 0.5)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(15, 15, 26, 0.95)",
                  border: "1px solid rgba(124, 58, 237, 0.3)",
                  borderRadius: "8px",
                }}
              />
              <Line type="monotone" dataKey="usage" stroke="#7c3aed" strokeWidth={2} dot={{ fill: "#00d4ff" }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Stock Levels */}
        <Card className="glass-panel p-6">
          <h3 className="font-semibold text-foreground mb-4">Stock Levels</h3>
          <div className="space-y-4">
            {dashboardData.stock.map((stock) => (
              <div key={stock.item}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-foreground/80">{stock.item}</span>
                  <span className="text-xs font-semibold text-primary">{stock.level}%</span>
                </div>
                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden border border-glass-border">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-accent"
                    style={{ width: `${stock.level}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Export Buttons */}
      <div className="glass-panel p-6 flex gap-4">
        <button className="flex items-center gap-2 glass-button py-2 px-4 hover:border-primary/50">
          <Download className="w-4 h-4" />
          Export CSV
        </button>
        <button className="flex items-center gap-2 glass-button py-2 px-4 hover:border-accent/50">
          <Download className="w-4 h-4" />
          Export XLS
        </button>
      </div>
    </div>
  )
}
