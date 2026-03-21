/**
 * Timing utility for performance measurement
 */

export class Timer {
  private startTime: number = 0

  start(): void {
    this.startTime = performance.now()
  }

  elapsed(): number {
    return performance.now() - this.startTime
  }

  elapsedSeconds(): number {
    return this.elapsed() / 1000
  }

  reset(): void {
    this.startTime = 0
  }

  mark(label: string): void {
    const elapsed = this.elapsed()
    console.log(`[Timer] ${label}: ${elapsed.toFixed(2)}ms`)
  }
}
