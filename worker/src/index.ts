import type { ScheduledController, DurableObjectNamespace } from "@cloudflare/workers-types";
import type { Env as TickHandlerEnv } from "./tick-handler";
import { SchedulerDO } from "./scheduler-do";

// Export the DO class so wrangler can find it
export { SchedulerDO } from "./scheduler-do";

// Fetcher type for service bindings
interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

// Environment interface for main worker
export interface Env extends TickHandlerEnv {
  // Durable Object binding for scheduler
  SCHEDULER_DO: DurableObjectNamespace<SchedulerDO>;
}

/**
 * Cron fallback handler - ensures the DO scheduler is running
 * Called every minute to check and initialize the DO if needed
 */
async function scheduledHandler(
  controller: ScheduledController,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  try {
    // Get or create the singleton DO instance using a fixed name
    const id = env.SCHEDULER_DO.idFromName('scheduler');
    const stub = env.SCHEDULER_DO.get(id);
    
    // Check if DO has an alarm scheduled
    const statusResponse = await stub.fetch(new Request('http://internal/?action=status'));
    
    if (!statusResponse.ok) {
      console.error(`[Cron] Failed to check DO status: ${statusResponse.status}`);
      return;
    }
    
    const status = await statusResponse.json() as { 
      alarmScheduled: boolean; 
      nextAlarm: number | null;
      status: string;
    };
    
    if (!status.alarmScheduled || status.nextAlarm === null) {
      // No alarm scheduled, start the DO (this will schedule the first alarm)
      console.log('[Cron] Initializing DO scheduler (no alarm scheduled)');
      const startResponse = await stub.fetch(new Request('http://internal/?action=start'));
      
      if (startResponse.ok) {
        const result = await startResponse.json();
        console.log(`[Cron] DO scheduler started: ${JSON.stringify(result)}`);
      } else {
        console.error(`[Cron] Failed to start DO scheduler: ${startResponse.status}`);
      }
    } else {
      // Alarm already scheduled, DO is running - just log for monitoring
      const nextAlarmDate = new Date(status.nextAlarm);
      const timeUntil = status.nextAlarm - Date.now();
      console.log(`[Cron] DO scheduler is running (next alarm in ${Math.round(timeUntil / 1000)}s at ${nextAlarmDate.toISOString()})`);
    }
  } catch (error) {
    console.error('[Cron] Error in scheduled handler:', error);
    // Don't throw - cron should continue even if DO check fails
  }
}

// Export default handler using ExportedHandler pattern
// Using ExportedHandler pattern - ALL handlers must be on this object
// Cloudflare Workers will look for fetch, scheduled on the default export
const handler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Health endpoint (only public route)
    if (path === '/health' || path === '/') {
      return new Response(
        JSON.stringify({ status: 'ok' }),
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // 404 for unknown routes
    return new Response('Not Found', { status: 404 });
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    return scheduledHandler(controller, env, ctx);
  },
};

export default handler;
