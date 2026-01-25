/**
 * Request Queue for Offline Mode
 * Queues failed requests when offline and retries when connection is restored
 */

export interface QueuedRequest {
  id: string;
  url: string;
  options: RequestInit;
  timestamp: number;
  retries: number;
  resolve: (value: Response) => void;
  reject: (error: Error) => void;
}

class RequestQueue {
  private queue: QueuedRequest[] = [];
  private maxQueueSize = 50;
  private maxRetries = 3;
  private processing = false;

  /**
   * Add request to queue
   */
  enqueue(
    url: string,
    options: RequestInit,
    resolve: (value: Response) => void,
    reject: (error: Error) => void
  ): string {
    // Prevent queue from growing too large
    if (this.queue.length >= this.maxQueueSize) {
      const oldest = this.queue.shift();
      if (oldest) {
        oldest.reject(new Error('Request queue is full. Oldest request discarded.'));
      }
    }

    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const queuedRequest: QueuedRequest = {
      id,
      url,
      options,
      timestamp: Date.now(),
      retries: 0,
      resolve,
      reject,
    };

    this.queue.push(queuedRequest);
    return id;
  }

  /**
   * Process queued requests
   */
  async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && navigator.onLine) {
      const request = this.queue.shift();
      if (!request) break;

      try {
        const response = await fetch(request.url, {
          ...request.options,
          // Add a timeout to prevent hanging
          signal: AbortSignal.timeout(30000),
        });

        if (response.ok) {
          request.resolve(response);
        } else {
          // If still failing, retry or reject
          request.retries++;
          if (request.retries < this.maxRetries) {
            // Put back in queue for retry
            this.queue.push(request);
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, request.retries)));
          } else {
            request.reject(new Error(`Request failed after ${this.maxRetries} retries`));
          }
        }
      } catch (error) {
        request.retries++;
        if (request.retries < this.maxRetries && navigator.onLine) {
          // Put back in queue for retry
          this.queue.push(request);
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, request.retries)));
        } else {
          request.reject(error instanceof Error ? error : new Error('Request failed'));
        }
      }
    }

    this.processing = false;
  }

  /**
   * Get queue status
   */
  getStatus(): { queued: number; processing: boolean } {
    return {
      queued: this.queue.length,
      processing: this.processing,
    };
  }

  /**
   * Clear queue
   */
  clear(): void {
    this.queue.forEach(request => {
      request.reject(new Error('Request queue cleared'));
    });
    this.queue = [];
  }

  /**
   * Remove specific request from queue
   */
  remove(id: string): boolean {
    const index = this.queue.findIndex(req => req.id === id);
    if (index !== -1) {
      const request = this.queue.splice(index, 1)[0];
      request.reject(new Error('Request removed from queue'));
      return true;
    }
    return false;
  }
}

// Singleton instance
export const requestQueue = new RequestQueue();

// Auto-process queue when connection is restored
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    requestQueue.processQueue();
  });
}
