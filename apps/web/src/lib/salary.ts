export function calculateSalary(revenue: number): number {
  if (revenue <= 7000) return 700
  return 700 + Math.ceil((revenue - 7000) / 1000) * 100
}
