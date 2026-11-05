import { createContext, useContext, useEffect } from "react";

export const NavigationContext = createContext<
  (guard: () => boolean) => () => void
>(() => () => {});

export function useNavigationGuard(pending: boolean) {
  const register = useContext(NavigationContext);
  useEffect(() => register(() => pending), [pending, register]);
  useEffect(() => {
    if (!pending) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [pending]);
}
