import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import "../styles/toasts.css";

const ToastContext = createContext(null);
let nextToastId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message, type = "info", options = {}) => {
    if (!message) return null;
    const id = nextToastId++;
    const duration = options.duration ?? 5000;
    setToasts((current) => [...current, { id, message: String(message), type }]);
    if (duration > 0) {
      window.setTimeout(() => dismissToast(id), duration);
    }
    return id;
  }, [dismissToast]);

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`global-toast ${toast.type}`} role={toast.type === "error" ? "alert" : "status"}>
            <span>{toast.message}</span>
            <button type="button" onClick={() => dismissToast(toast.id)} aria-label="Dismiss message">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider.");
  return context;
}

export function useToastMessage(initialType = "error") {
  const { showToast } = useToast();
  const typeRef = useRef(initialType);
  const setMessageType = useCallback((type) => { typeRef.current = type; }, []);
  const setMessage = useCallback((value) => {
    if (typeof value === "function") return;
    if (value) {
      const type = typeRef.current === "auto"
        ? (/could not|failed|invalid|error|must |not found|expired|incorrect/i.test(String(value)) ? "error" : "success")
        : typeRef.current;
      showToast(value, type);
    }
  }, [showToast]);

  // The empty value keeps legacy inline message blocks from rendering while
  // callers are migrated without changing their request/error logic.
  return ["", setMessage, typeRef.current, setMessageType];
}
