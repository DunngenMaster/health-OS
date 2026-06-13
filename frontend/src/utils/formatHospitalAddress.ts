/** Format hospital address for display — never show raw coordinates to users */
export function formatHospitalAddress(name: string, address: string): string {
  if (address && !/^Near\s+[-\d.]/i.test(address.trim())) {
    return address
  }
  const lower = name.toLowerCase()
  if (lower.includes('san francisco') || lower.includes('ucsf') || lower.includes('cpmc') || lower.includes('zuckerberg')) {
    return 'San Francisco, CA'
  }
  if (lower.includes('oakland') || lower.includes('alameda')) {
    return 'Oakland, CA'
  }
  if (lower.includes('berkeley')) {
    return 'Berkeley, CA'
  }
  return 'Bay Area, California'
}

export function formatHospitalSubtitle(): string {
  return 'Real facility data · Scenario routing · Actionable improvement intelligence'
}
