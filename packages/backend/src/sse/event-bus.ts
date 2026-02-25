import { EventEmitter } from 'events';
import type { Response } from 'express';
import type { DeploymentEvent } from '@skaha-orc/shared';

class EventBus extends EventEmitter {
  private clients: Set<Response> = new Set();

  addClient(res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(':\n\n'); // heartbeat

    this.clients.add(res);

    res.on('close', () => {
      this.clients.delete(res);
    });
  }

  broadcast(event: DeploymentEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      client.write(data);
    }
    this.emit('event', event);
  }

  broadcastNamed(name: string, payload: unknown): void {
    const data = `event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.clients) {
      client.write(data);
    }
  }
}

export const eventBus = new EventBus();
