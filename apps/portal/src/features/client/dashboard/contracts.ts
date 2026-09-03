export type ClientActor = Readonly<{
  userId: string;
  organizationId: string;
  clientId: string;
  role: "CLIENT";
}>;

export type ClientDashboard = Readonly<{
  clientId: string;
  displayName: string;
  status: "ACTIVE";
  locale: "fr-CA" | "en-CA";
  timezone: string;
}>;

export interface ClientSessionPort {
  requireClientActor(): Promise<ClientActor>;
}

export interface ClientDashboardReadPort {
  /** Must retain organization + client filters even when RLS is active. */
  findForActor(actor: ClientActor): Promise<ClientDashboard | null>;
}

export type ClientDashboardDependencies = Readonly<{
  session: ClientSessionPort;
  dashboards: ClientDashboardReadPort;
}>;
