export type OooEntry = {
  id: string;
  user_id: string;
  member_name: string;
  /** YYYY-MM-DD inclusive. */
  start_date: string;
  /** YYYY-MM-DD inclusive. */
  end_date: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
};
