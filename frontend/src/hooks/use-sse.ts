import { useState, useEffect, useCallback, useRef } from "react";
import type { SSEMessage } from "@/types";

export function useSSE(url: string | null) {
  const [events, setEvents] = useState<SSEMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  const reset = useCallback(() => {
    setEvents([]);
    setError(null);
    setIsDone(false);
  }, []);

  useEffect(() => {
    if (!url) return;

    reset();
    const es = new EventSource(url);
    sourceRef.current = es;

    es.onopen = () => setIsConnected(true);
    es.onerror = () => {
      setIsConnected(false);
      if (!isDone) setError("Connection lost");
      es.close();
    };

    const handleEvent = (type: string) => (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const msg: SSEMessage = { event: type as SSEMessage["event"], data };
        setEvents((prev) => [...prev, msg]);

        if (type === "error") setError(data.message || "Unknown error");
        if (type === "done") {
          setIsDone(true);
          es.close();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.addEventListener("step", handleEvent("step"));
    es.addEventListener("result", handleEvent("result"));
    es.addEventListener("error", handleEvent("error"));
    es.addEventListener("done", handleEvent("done"));

    return () => {
      es.close();
      sourceRef.current = null;
      setIsConnected(false);
    };
  }, [url]);

  return { events, isConnected, error, isDone, reset };
}
