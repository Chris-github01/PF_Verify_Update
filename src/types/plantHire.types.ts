export interface PlantSettings {
  id: string;
  organisation_id: string;
  claim_period_end_day: number;
  default_currency: string;
  require_delivery_event_for_on_hire: boolean;
  require_collection_event_for_off_hire: boolean;
  strict_full_period_only: boolean;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface PlantCategory {
  id: string;
  organisation_id: string;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export type PlantAssetStatus = 'AVAILABLE' | 'ON_HIRE' | 'IN_MAINTENANCE' | 'INACTIVE';
export type HireUnit = 'HOUR' | 'DAY' | 'WEEK' | 'MONTH';

export interface PlantAsset {
  id: string;
  organisation_id: string;
  asset_code: string;
  asset_name: string;
  category_id: string | null;
  description: string | null;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  registration_number: string | null;
  size_capacity: string | null;
  default_hire_unit: HireUnit;
  purchase_date: string | null;
  current_location_id: string | null;
  current_status: PlantAssetStatus;
  notes: string | null;
  active: boolean;
  external_hire_supplier: string | null;
  rechargeable_to_client: boolean;
  internal_cost_centre: string | null;
  operator_required: boolean;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  category?: PlantCategory;
}

export interface PlantRateCard {
  id: string;
  organisation_id: string;
  asset_id: string;
  currency: string;
  on_hire_fixed: number | null;
  off_hire_fixed: number | null;
  hourly_rate: number | null;
  daily_rate: number | null;
  weekly_rate: number | null;
  monthly_rate: number | null;
  active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
}

export type BookingStatus = 'DRAFT' | 'BOOKED' | 'ON_HIRE' | 'OFF_HIRED' | 'CLOSED' | 'CANCELLED';

export interface PlantBooking {
  id: string;
  organisation_id: string;
  asset_id: string;
  project_id: string | null;
  site_location_id: string | null;
  booking_reference: string | null;
  cost_code: string | null;
  charging_basis: HireUnit;
  hire_start_date: string;
  planned_end_date: string | null;
  actual_off_hire_date: string | null;
  delivery_required: boolean;
  collection_required: boolean;
  notes: string | null;
  internal_reference: string | null;
  status: BookingStatus;
  created_at: string;
  created_by: string | null;
  updated_at: string;
  updated_by: string | null;
  asset?: PlantAsset;
  project?: { id: string; name: string; client: string | null } | null;
}

export type MovementEventType =
  | 'DELIVERED_TO_SITE'
  | 'COLLECTED_FROM_SITE'
  | 'RETURNED_TO_YARD'
  | 'SWAPPED'
  | 'EXTENDED'
  | 'CANCELLED';

export interface PlantMovement {
  id: string;
  organisation_id: string;
  booking_id: string;
  asset_id: string;
  event_type: MovementEventType;
  event_date: string;
  from_location_id: string | null;
  to_location_id: string | null;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  asset?: PlantAsset;
  booking?: PlantBooking;
}

export type ChargeType = 'ON_HIRE_FIXED' | 'OFF_HIRE_FIXED' | 'TIME_HIRE';

export interface PlantChargeEvent {
  id: string;
  organisation_id: string;
  booking_id: string;
  asset_id: string;
  movement_id: string | null;
  charge_type: ChargeType;
  charge_basis: HireUnit | null;
  charge_date: string;
  period_start: string | null;
  period_end: string | null;
  quantity: number;
  rate: number | null;
  amount: number | null;
  source_reference: string | null;
  is_claimed: boolean;
  claimed_in_period_id: string | null;
  created_at: string;
  created_by: string | null;
}

export type ClaimPeriodStatus = 'OPEN' | 'LOCKED' | 'FINALIZED';

export interface PlantClaimPeriod {
  id: string;
  organisation_id: string;
  period_name: string;
  period_start: string;
  period_end: string;
  period_end_day: number;
  status: ClaimPeriodStatus;
  created_at: string;
  created_by: string | null;
}

export interface PlantClaimLine {
  id: string;
  organisation_id: string;
  claim_period_id: string;
  booking_id: string | null;
  asset_id: string | null;
  charge_event_id: string | null;
  project_id: string | null;
  line_type: ChargeType;
  description: string | null;
  quantity: number;
  rate: number | null;
  amount: number | null;
  created_at: string;
  created_by: string | null;
  asset?: PlantAsset;
  booking?: PlantBooking;
  project?: { id: string; name: string; client: string | null } | null;
}

export interface PlantDashboardStats {
  total_assets: number;
  on_hire_count: number;
  available_count: number;
  maintenance_count: number;
  active_bookings: number;
  unclaimed_charges: number;
  current_period_value: number;
}

export interface PlantClaimSummary {
  total_on_hire_charges: number;
  total_off_hire_charges: number;
  total_time_charges: number;
  grand_total: number;
  line_count: number;
}
