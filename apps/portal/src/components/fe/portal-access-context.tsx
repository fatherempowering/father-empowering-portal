"use client";

import { createContext, useContext, type ReactNode } from "react";

type PortalAccess = Readonly<{
  isStaff: boolean;
}>;

const PortalAccessContext = createContext<PortalAccess>({ isStaff: false });

export function PortalAccessProvider({
  isStaff,
  children,
}: Readonly<{
  isStaff: boolean;
  children: ReactNode;
}>) {
  return (
    <PortalAccessContext.Provider value={{ isStaff }}>
      {children}
    </PortalAccessContext.Provider>
  );
}

export function usePortalAccess(): PortalAccess {
  return useContext(PortalAccessContext);
}
