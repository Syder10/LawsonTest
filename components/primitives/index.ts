// Barrel for the app's design-system primitives.
//
// components/ui/*        shadcn primitives (token-driven, mostly unused)
// components/primitives/ THIS — the app's own design system
// components/features/*  feature composition built from the above
//
// Import from here so a view never reaches for a raw literal:
//   import { Card, StatTile, DataTable } from "@/components/primitives"

export { Card, CardHeader } from "./card"
export { Chip } from "./chip"
export { DataTable, type Column } from "./data-table"
export { EmptyState } from "./empty-state"
export { Choice, Field, NumberInput, Select, TextArea, TextInput } from "./field"
export { PageHeader } from "./page-header"
export { StatTile, compact } from "./stat-tile"
export { StatusBadge } from "./status-badge"
export { Eyebrow, SectionTitle } from "./text"
