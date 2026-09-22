import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

export type ToastKind = "error" | "success" | "info";

type ToastItem = {
  id: number;
  message: string;
  kind: ToastKind;
};

type ToastApi = {
  push: (message: string, kind?: ToastKind) => void;
  error: (message: string) => void;
  success: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = nextId++;
      setItems((prev) => [...prev.slice(-4), { id, message, kind }]);
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      error: (message) => push(message, "error"),
      success: (message) => push(message, "success"),
      info: (message) => push(message, "info"),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
        <AnimatePresence initial={false}>
          {items.map((t) => (
            <motion.div
              key={t.id}
              className={`toast toast-${t.kind}`}
              role={t.kind === "error" ? "alert" : "status"}
              initial={{ opacity: 0, y: 12, x: 8 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, y: 8, x: 8 }}
              transition={{ duration: 0.2 }}
              onClick={() => dismiss(t.id)}
            >
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
