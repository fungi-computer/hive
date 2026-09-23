import { DurableObject } from "cloudflare:workers";

// Temporary pause deployment for the disposable performance backend. It keeps
// the existing SQLite DO namespace and data, but retires every existing alarm
// on its next wake and refuses new work.
export class PublicEngineRegion extends DurableObject {
  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.close(1012, "performance preview paused"); } catch {}
    }
  }

  async fetch(): Promise<Response> {
    await this.ctx.storage.deleteAlarm();
    return Response.json({ error: "game-backend-paused" }, { status: 503 });
  }
}

export default {
  async fetch(): Promise<Response> {
    return Response.json({ error: "game-backend-paused" }, { status: 503 });
  },
};
