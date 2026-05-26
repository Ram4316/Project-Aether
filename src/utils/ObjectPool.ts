/**
 * ObjectPool — Generic reusable object pool to eliminate GC pressure.
 * Used for projectiles, particles, hit effects, and enemy recycling.
 */

export class ObjectPool<T> {
  private pool: T[] = [];
  private active: Set<T> = new Set();
  private factory: () => T;
  private reset: (obj: T) => void;
  private maxSize: number;

  constructor(
    factory: () => T,
    reset: (obj: T) => void,
    initialSize: number,
    maxSize = 100,
  ) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;

    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.factory());
    }
  }

  acquire(): T | null {
    let obj: T;

    if (this.pool.length > 0) {
      obj = this.pool.pop()!;
    } else if (this.active.size < this.maxSize) {
      obj = this.factory();
    } else {
      // Pool exhausted
      return null;
    }

    this.active.add(obj);
    return obj;
  }

  release(obj: T): void {
    if (!this.active.has(obj)) return;
    this.active.delete(obj);
    this.reset(obj);
    this.pool.push(obj);
  }

  releaseAll(): void {
    this.active.forEach((obj) => {
      this.reset(obj);
      this.pool.push(obj);
    });
    this.active.clear();
  }

  get activeCount(): number {
    return this.active.size;
  }

  get availableCount(): number {
    return this.pool.length;
  }

  dispose(destroyer?: (obj: T) => void): void {
    if (destroyer) {
      this.pool.forEach(destroyer);
      this.active.forEach(destroyer);
    }
    this.pool = [];
    this.active.clear();
  }
}
