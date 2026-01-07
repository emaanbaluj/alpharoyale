import { DurableObject } from "cloudflare:workers";
import type { DurableObjectState } from "@cloudflare/workers-types";
import type { Env } from "./tick-handler";
import { executeGameTick } from "./tick-handler";

/**
 * Scheduler Durable Object
 * 
 * Uses alarms to trigger game ticks every 10 seconds.
 * Self-reschedules after each tick to maintain the 10-second interval.
 */
export class SchedulerDO extends DurableObject<Env> {
  /**
   * Alarm handler - executed every 10 seconds to run game tick
   * @param alarmInfo - Optional info about retry status
   */
  async alarm(alarmInfo?: { retryCount: number; isRetry: boolean }): Promise<void> {
    const state = this.ctx as DurableObjectState;
    const env = this.env;
    
    if (alarmInfo?.isRetry) {
      console.log(`[SchedulerDO] Alarm is a retry (attempt ${alarmInfo.retryCount})`);
    }
    
    try {
      const startTime = Date.now();
      console.log(`[SchedulerDO] Alarm triggered at ${new Date(startTime).toISOString()}`);
      
      // Execute the game tick
      await executeGameTick(env);
      
      const executionTime = Date.now() - startTime;
      console.log(`[SchedulerDO] Tick completed in ${executionTime}ms`);
      
      // Schedule next alarm in 10 seconds
      const nextAlarmTime = Date.now() + 10000;
      await state.storage.setAlarm(nextAlarmTime);
      console.log(`[SchedulerDO] Next alarm scheduled for ${new Date(nextAlarmTime).toISOString()}`);
      
    } catch (error) {
      console.error('[SchedulerDO] Error in alarm handler:', error);
      
      // Always schedule next alarm even on error to keep the chain going
      // DO retry mechanism will handle the failed execution
      const nextAlarmTime = Date.now() + 10000;
      await state.storage.setAlarm(nextAlarmTime);
      console.log(`[SchedulerDO] Scheduled next alarm despite error for ${new Date(nextAlarmTime).toISOString()}`);
      
      // Re-throw to trigger DO's automatic retry mechanism
      throw error;
    }
  }

  /**
   * Fetch handler - for internal control/status checks
   * Called by cron fallback to check status and initialize if needed
   */
  async fetch(request: Request): Promise<Response> {
    const state = this.ctx as DurableObjectState;
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'status';
    
    try {
      if (action === 'start' || action === 'wakeup') {
        // Check if alarm is already scheduled
        const currentAlarm = await state.storage.getAlarm();
        
        if (currentAlarm === null) {
          // No alarm scheduled, start it now
          const nextAlarmTime = Date.now() + 10000;
          await state.storage.setAlarm(nextAlarmTime);
          console.log(`[SchedulerDO] Started via ${action} - alarm scheduled for ${new Date(nextAlarmTime).toISOString()}`);
          return new Response(JSON.stringify({ 
            status: 'started', 
            nextAlarm: nextAlarmTime,
            message: 'Scheduler started successfully'
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } else {
          // Alarm already scheduled, just return status
          console.log(`[SchedulerDO] Already running - next alarm at ${new Date(currentAlarm).toISOString()}`);
          return new Response(JSON.stringify({ 
            status: 'running', 
            nextAlarm: currentAlarm,
            message: 'Scheduler is already running'
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      
      if (action === 'status') {
        const alarm = await state.storage.getAlarm();
        const currentTime = Date.now();
        
        return new Response(JSON.stringify({ 
          alarmScheduled: alarm !== null,
          nextAlarm: alarm,
          currentTime: currentTime,
          timeUntilAlarm: alarm ? alarm - currentTime : null,
          status: alarm ? 'running' : 'stopped'
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ error: 'Unknown action' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error('[SchedulerDO] Error in fetch handler:', error);
      return new Response(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}
