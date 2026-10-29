export type Role = "customer" | "admin";
export type ClaimStatus = "Submitted" | "Approved" | "Rejected";

export interface SessionUser {
  id: number;
  username: string;
  role: Role;
  displayName: string;
}

/** Monetary values are decimal strings with 2 fraction digits, e.g. "600000.00". */
export interface PolicyDto {
  id: number;
  reference: string;
  customerId: number;
  customerUsername: string;
  customerName: string;
  startDate: string;
  endDate: string;
  sumInsured: string;
  pendingAmount: string;
  approvedAmount: string;
  remainingSumInsured: string;
  claimCount: number;
  createdAt: string;
}

export interface ClaimDto {
  id: number;
  reference: string;
  policyId: number;
  policyReference: string;
  customerId: number;
  customerUsername: string;
  customerName: string;
  incidentDate: string;
  amount: string;
  status: ClaimStatus;
  submittedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

export interface CustomerDto {
  id: number;
  username: string;
  displayName: string;
}
