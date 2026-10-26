import { useEffect, useState } from "react";
import { api } from "../api.ts";

export function useAiAvailable() {
  const [aiAvailable, setAiAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void api<{ available: boolean }>("/api/ai/status")
      .then((status) => {
        if (!cancelled) setAiAvailable(status.available);
      })
      .catch(() => {
        if (!cancelled) setAiAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return aiAvailable;
}
