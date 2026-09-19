"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Icon } from "./Icon";

type Toast = { id: number; msg: string; kind: "ok" | "err" };
const Ctx = createContext<(msg: string, kind?: "ok" | "err") => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const n = useRef(0);
  const push = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = ++n.current;
    setList((l) => [...l.slice(-3), { id, msg, kind }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 3600);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite" role="status">
        {list.map((t) => <div key={t.id} className={`toast ${t.kind}`}><Icon name={t.kind === "ok" ? "check" : "x"} size={15} />{t.msg}</div>)}
      </div>
    </Ctx.Provider>
  );
}
