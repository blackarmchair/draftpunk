import React from 'react'
import type { PWOPRDataStrategy } from '../types'

interface DataStrategySelectorProps {
  value: PWOPRDataStrategy
  onChange: (strategy: PWOPRDataStrategy) => void
  disabled?: boolean
}

export function DataStrategySelector({
  value,
  onChange,
  disabled = false,
}: DataStrategySelectorProps) {
  return (
    <div className="data-strategy-selector">
      <label>Data Strategy:</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PWOPRDataStrategy)}
        disabled={disabled}
      >
        <option value="current-week">Current Week</option>
        <option value="recent-average">Recent Average (4 weeks)</option>
        <option value="season-average">Season Average</option>
      </select>
    </div>
  )
}
