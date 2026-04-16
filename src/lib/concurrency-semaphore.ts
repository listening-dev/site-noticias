/**
 * Semaphore: Controls concurrent execution to prevent resource exhaustion
 *
 * Use case: When you have 100 tasks but connection pool is limited to 10,
 * this ensures only 10 run at a time, queueing the rest.
 */

export interface SemaphoreOptions {
  maxConcurrent?: number
  timeout?: number // ms to wait before rejecting
}

export class Semaphore {
  private maxConcurrent: number
  private currentCount: number = 0
  private queue: Array<() => void> = []
  private timeout: number

  constructor(options: SemaphoreOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 10
    this.timeout = options.timeout ?? 30000
  }

  /**
   * Acquire a permit to run a task
   * If maxConcurrent is reached, waits in queue
   */
  async acquire(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.currentCount < this.maxConcurrent) {
        this.currentCount++
        resolve()
        return
      }

      // Queued: wait for a slot
      const timeoutHandle = setTimeout(() => {
        const index = this.queue.indexOf(resolve)
        if (index > -1) {
          this.queue.splice(index, 1)
        }
        reject(new Error(`Semaphore acquire timeout after ${this.timeout}ms`))
      }, this.timeout)

      this.queue.push(() => {
        clearTimeout(timeoutHandle)
        this.currentCount++
        resolve()
      })
    })
  }

  /**
   * Release a permit (must call after task completes)
   */
  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()
      if (next) next()
    } else {
      this.currentCount--
    }
  }

  /**
   * Helper: run a task with automatic acquire/release
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    } finally {
      this.release()
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      running: this.currentCount,
      queued: this.queue.length,
      maxConcurrent: this.maxConcurrent,
      available: Math.max(0, this.maxConcurrent - this.currentCount),
    }
  }
}

/**
 * Process array with semaphore concurrency control
 */
export async function processBatchWithSemaphore<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  maxConcurrent: number = 10,
  options?: { onProgress?: (completed: number, total: number) => void }
): Promise<R[]> {
  const semaphore = new Semaphore({ maxConcurrent })
  const results: R[] = []
  let completed = 0

  await Promise.all(
    items.map(async (item, index) => {
      const result = await semaphore.run(() => processor(item))
      results[index] = result
      completed++
      options?.onProgress?.(completed, items.length)
    })
  )

  return results
}
