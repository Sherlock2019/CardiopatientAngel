import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { tokenStore } from "./api";
import type { Severity } from "./types";

export interface LiveEvent {
  event: "alarm" | "alarm_updated";
  alarm_id: number;
  patient_id?: string;
  care_unit?: string;
  alarm_type?: string;
  severity?: Severity;
  status?: string;
  received: number;
}

const Ctx = createContext<{ connected: boolean; events: LiveEvent[] }>({ connected: false, events: [] });

/** Subscribes to the backend SSE stream and refreshes alarm/summary queries on every event. */
export function LiveProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    const token = tokenStore.get();
    if (!token) return;
    const es = new EventSource(`/api/stream?token=${encodeURIComponent(token)}`);
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (m) => {
      try {
        const ev = { ...JSON.parse(m.data), received: Date.now() } as LiveEvent;
        setEvents((prev) => [ev, ...prev].slice(0, 50));
      } catch {
        return;
      }
      // debounce refetches when the simulator is bursting
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["alarms"] });
        qc.invalidateQueries({ queryKey: ["summary"] });
        qc.invalidateQueries({ queryKey: ["patient-alarms"] });
      }, 600);
    };
    return () => {
      es.close();
      setConnected(false);
    };
  }, [enabled, qc]);

  return <Ctx.Provider value={{ connected, events }}>{children}</Ctx.Provider>;
}

export const useLive = () => useContext(Ctx);
