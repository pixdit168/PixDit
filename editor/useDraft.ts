import { useCallback, useEffect, useRef, useState } from "react";
import type { DesignDocument, DesignRecord } from "../shared/design-document";
import { api, ApiError } from "./api";
export function useDraft(
  initial: DesignRecord,
  document: DesignDocument,
  token: string,
) {
  const record = useRef(initial),
    current = useRef(document),
    saved = useRef(JSON.stringify(initial.document));
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const alive = useRef(true);
  const paused = useRef(false);
  const epoch = useRef(0);
  const [status, setStatus] = useState("Draf tersimpan"),
    [conflict, setConflict] = useState(false),
    [revision, setRevision] = useState(initial.revision);
  current.current = document;
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const flush = useCallback(async () => {
    const started = epoch.current;
    const work = chain.current
      .catch(() => {})
      .then(async () => {
        if (started !== epoch.current) return record.current;
        if (paused.current)
          throw new ApiError(409, "Selesaikan konflik revisi terlebih dahulu.");
        const snapshot = JSON.stringify(current.current);
        if (snapshot === saved.current) return record.current;
        if (alive.current) setStatus("Menyimpan draf…");
        try {
          const result = await api<{ design: DesignRecord }>(
            `/api/designs/${record.current.id}`,
            token,
            "PATCH",
            {
              expectedRevision: record.current.revision,
              document: JSON.parse(snapshot),
            },
          );
          if (started !== epoch.current) return record.current;
          record.current = result.design;
          saved.current = snapshot;
          if (alive.current) {
            setRevision(result.design.revision);
            setStatus(
              snapshot === JSON.stringify(current.current)
                ? "Draf tersimpan"
                : "Perubahan baru menunggu disimpan",
            );
          }
          return record.current;
        } catch (error) {
          if (alive.current && started === epoch.current) {
            if (error instanceof ApiError && error.status === 409) {
              paused.current = true;
              setConflict(true);
              setStatus("Konflik revisi — perubahan lokal dipertahankan");
            } else setStatus(`Gagal menyimpan: ${(error as Error).message}`);
          }
          throw error;
        }
      });
    chain.current = work;
    return work;
  }, [token]);
  const snapshot = JSON.stringify(document);
  useEffect(() => {
    if (snapshot === saved.current || paused.current) return;
    setStatus("Perubahan belum disimpan");
    const timer = setTimeout(() => void flush().catch(() => {}), 1000);
    return () => clearTimeout(timer);
  }, [snapshot, flush]);
  const reset = useCallback((next: DesignRecord) => {
    epoch.current++;
    record.current = next;
    current.current = next.document;
    saved.current = JSON.stringify(next.document);
    paused.current = false;
    setConflict(false);
    setRevision(next.revision);
    setStatus("Draf tersimpan");
  }, []);
  const markConflict = () => {
    paused.current = true;
    setConflict(true);
    setStatus("Konflik revisi — perubahan lokal dipertahankan");
  };
  const retry = () => {
    if (!conflict) {
      paused.current = false;
      void flush().catch(() => {});
    }
  };
  return {
    flush,
    reset,
    status,
    conflict,
    revision,
    record,
    current,
    markConflict,
    retry,
    dirty: () => JSON.stringify(current.current) !== saved.current,
  };
}
