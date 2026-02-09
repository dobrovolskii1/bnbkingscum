
export interface KingdomData {
  gold: number;
  gems: number;
  perHour: number;
  alliesCount: number;
  alliesEarned: number;
  claimTime: number;
  battleTime: number;
}

export interface GlobalState {
  totalDeposited: bigint;
  totalKings: number;
  deploymentTime: bigint;
  totalDeposits: number;
}

export interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error';
  timestamp: string;
}
