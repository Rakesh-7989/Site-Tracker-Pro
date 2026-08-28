import { createContext, useContext } from "react";

type PartnerScope = string | null;

const Ctx = createContext<PartnerScope>(null);

export function PartnerScopeProvider({ value, children }: { value: PartnerScope; children: React.ReactNode }): JSX.Element {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePartnerScope(): PartnerScope {
  return useContext(Ctx);
}

export function useIsPartnerWriter(): boolean {
  const s = useContext(Ctx);
  return s === "contributor" || s === "manager";
}
