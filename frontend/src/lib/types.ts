/**
 * TypeScript type definitions for Fantasy Sports Auction App
 * Based on Express backend API structures
 */

// ===== PLAYER TYPES =====

/** Player position types */
export type PlayerType = 'BAT' | 'AR' | 'BOWL' | 'WK';

/** Base player structure from CSV */
export interface Player {
  name: string;
  team: string;
  type: PlayerType;
  basePrice: number | null;
  soldPrice?: number | null;
}

/** Player with purchase information */
export interface PurchasedPlayer extends Player {
  boughtPrice: number;
  boughtAt: string;
  buyerTeam: string;
}

/** Player for auction display */
export interface AuctionPlayer {
  name: string;
  team: string;
  type: PlayerType;
  basePrice: number;
}

/** Blind bid player (no base price) */
export interface BlindBidPlayer {
  name: string;
  team: string;
  type: PlayerType;
}

// ===== TEAM TYPES =====

/** Team/User structure */
export interface Team {
  username: string;
  budget: number;
  players: PurchasedPlayer[];
}

/** Enhanced team data with computed fields */
export interface TeamState extends Team {
  spentAmount: number;
  playerCount: number;
  canBuyMore: boolean;
  remainingBudget: number;
  playersByType: Record<PlayerType, PurchasedPlayer[]>;
}

// ===== ROOM TYPES =====

/** Room configuration */
export interface RoomConfig {
  roomId: string;
  users: string[];
  budgetPerUser: number;
  maxPlayersPerTeam: number;
}

/** Room state from backend */
export interface RoomState {
  roomId: string;
  users: TeamState[];
  currentType: PlayerType | null;
  nextType: PlayerType | null;
  remainingPlayers: number;
  totalPlayersSent: number;
  blindBidPlayersCount: number;
  mainAuctionPlayersCount: number;
  soldPlayersCount: number;
  auctionPhase: AuctionPhase;
}

/** Room data structure */
export interface Room {
  roomId: string;
  users: Record<string, Team>;
  budgetPerUser: number;
  createdAt: string;
  lastActivity: string;
  soldPlayers?: Set<string>;
}

// ===== AUCTION TYPES =====

/** Auction phases */
export type AuctionPhase = 'setup' | 'blind' | 'main' | 'completed';

/** Batch configuration for main auction */
export interface BatchConfig {
  BAT: number;
  AR: number;
  BOWL: number;
  WK: number;
}

/** Current batch response */
export interface BatchResponse {
  success: boolean;
  players: AuctionPlayer[];
  currentType: PlayerType;
  nextType: PlayerType;
  batchSize: number;
  playersInBatch: number;
  totalSentPlayers: number;
  batchComplete?: boolean;
  auctionComplete?: boolean;
}

/** Player selection request */
export interface PlayerSelectionRequest {
  roomId: string;
  playerName: string;
  soldPrice: number;
  buyerTeam: string;
}

/** Player selection response */
export interface PlayerSelectionResponse {
  success: boolean;
  message: string;
  player: {
    name: string;
    soldPrice: number;
    buyerTeam: string;
  };
  remainingBudget: number;
  teamPlayerCount: number;
}

// ===== API TYPES =====

/** Generic API response wrapper */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

/** Room creation request */
export interface CreateRoomRequest {
  roomId: string;
  users: string[];
  budgetPerUser?: number;
}

/** Room creation response */
export interface CreateRoomResponse {
  success: boolean;
  roomId: string;
  users: string[];
  budgetPerUser: number;
  maxPlayersPerTeam: number;
  blindBidPlayersAvailable: number;
  mainAuctionPlayersAvailable: number;
}

/** Health check response */
export interface HealthResponse {
  success: boolean;
  message: string;
  timestamp: string;
  activeRooms: number;
  storage: string;
  csvPlayersLoaded: number;
  blindBidPlayers: number;
  mainAuctionPlayers: number;
}

/** Blind bid players response */
export interface BlindBidPlayersResponse {
  success: boolean;
  players: BlindBidPlayer[];
  count: number;
}

// ===== FORM TYPES =====

/** Create room form data */
export interface CreateRoomFormData {
  roomId: string;
  users: string[];
  budgetPerUser: number;
}

/** Join room form data */
export interface JoinRoomFormData {
  roomId: string;
  teamName: string;
}

/** Bid form data */
export interface BidFormData {
  playerId: string;
  bidAmount: number;
  teamName: string;
}

// ===== UI TYPES =====

/** Toast notification types */
export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

/** Toast notification */
export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  persistent?: boolean;
  createdAt: number;
}

/** Notification */
export interface Notification {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  roomId?: string;
}

/** Theme options */
export type Theme = 'light' | 'dark' | 'system';

/** Connection status */
export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

// ===== COMPONENT PROPS =====

/** Button variants */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'success';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/** Card variants */
export type CardVariant = 'default' | 'elevated' | 'outlined' | 'filled';
export type CardSize = 'sm' | 'md' | 'lg';

/** Input variants */
export type InputVariant = 'default' | 'filled' | 'outlined';
export type InputSize = 'sm' | 'md' | 'lg';

/** Modal sizes */
export type ModalSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';

// ===== STORE TYPES =====

/** Loading states for different operations */
export interface LoadingStates {
  createRoom: boolean;
  joinRoom: boolean;
  fetchBatch: boolean;
  selectPlayer: boolean;
  fetchRoomState: boolean;
  [key: string]: boolean;
}

/** Error states */
export interface ErrorStates {
  room: string | null;
  auction: string | null;
  player: string | null;
  network: string | null;
  [key: string]: string | null;
}

// ===== HOOK TYPES =====

/** useRoom hook return type */
export interface UseRoomReturn {
  room: RoomState | null;
  teams: TeamState[];
  loading: boolean;
  error: string | null;
  createRoom: (data: CreateRoomRequest) => Promise<void>;
  joinRoom: (roomId: string, teamName: string) => Promise<void>;
  refreshRoom: () => Promise<void>;
  isConnected: boolean;
}

/** useAuction hook return type */
export interface UseAuctionReturn {
  currentBatch: AuctionPlayer[];
  blindBidPlayers: BlindBidPlayer[];
  auctionPhase: AuctionPhase;
  currentType: PlayerType | null;
  nextType: PlayerType | null;
  loading: boolean;
  error: string | null;
  getNextBatch: () => Promise<void>;
  selectPlayer: (player: AuctionPlayer, price: number, team: string) => Promise<void>;
  submitBlindBid: (player: BlindBidPlayer, bid: number, team: string) => Promise<void>;
  refreshBatch: () => Promise<void>;
  remainingPlayers: number;
  batchProgress: number;
  canPurchase: (team: string, price: number) => boolean;
}

/** useSocket hook return type */
export interface UseSocketReturn {
  socket: any | null;
  connected: boolean;
  connecting: boolean;
  error: string | null;
  emit: (event: string, data: any) => void;
  on: (event: string, callback: Function) => void;
  off: (event: string, callback?: Function) => void;
  joinRoom: (roomId: string) => void;
  leaveRoom: (roomId: string) => void;
}

/** useLocalStorage hook return type */
export interface UseLocalStorageReturn<T> {
  value: T;
  setValue: (value: T | ((prev: T) => T)) => void;
  removeValue: () => void;
  loading: boolean;
  error: string | null;
}

// ===== STATISTICS TYPES =====

/** Team statistics */
export interface TeamStats {
  totalSpent: number;
  averagePlayerPrice: number;
  playersByType: Record<PlayerType, number>;
  budgetUtilization: number;
  mostExpensivePlayer: PurchasedPlayer | null;
  cheapestPlayer: PurchasedPlayer | null;
}

/** Room statistics */
export interface RoomStats {
  totalPlayers: number;
  soldPlayers: number;
  remainingPlayers: number;
  totalBudget: number;
  spentBudget: number;
  averagePlayerPrice: number;
  mostExpensiveSale: PurchasedPlayer | null;
  teamStats: Record<string, TeamStats>;
}

// ===== UTILITY TYPES =====

/** Sorting options */
export type SortOption = 'name' | 'price' | 'type' | 'team';
export type SortDirection = 'asc' | 'desc';

/** Filter options */
export interface FilterOptions {
  type: PlayerType | 'ALL';
  priceRange: [number, number];
  team: string | 'ALL';
  searchTerm: string;
}

/** Pagination */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ===== CONSTANTS TYPES =====

/** Validation rule structure */
export interface ValidationRule {
  MIN_LENGTH?: number;
  MAX_LENGTH?: number;
  PATTERN?: RegExp;
  MIN?: number;
  MAX?: number;
  REQUIRED?: boolean;
}

/** Color configuration */
export interface ColorConfig {
  PLAYER_TYPES: Record<PlayerType, string>;
  BUDGET_INDICATORS: {
    HEALTHY: string;
    MODERATE: string;
    LOW: string;
    CRITICAL: string;
  };
  THEME: Record<Theme, Record<string, string>>;
}

// ===== EXPORT ALL TYPES =====
export type {
  // Re-export commonly used types for easier imports
  Player as PlayerData,
  Team as TeamData,
  Room as RoomData,
  Toast as ToastNotification,
  ApiResponse as APIResponse,
};