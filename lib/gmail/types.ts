export type EmailAttachment = {
  id: string;
  filename: string;
  mime: string;
  size: number;
};

export type Email = {
  id: string;
  user_id: string;
  gmail_message_id: string;
  gmail_thread_id: string;
  project_id: string | null;
  sender_name: string | null;
  sender_email: string | null;
  subject: string | null;
  snippet: string | null;
  body_preview: string | null;
  received_at: string;
  has_attachments: boolean;
  attachments_meta: EmailAttachment[] | null;
  is_archived: boolean;
  created_at: string;
};

export type SyncLogRow = {
  id: string;
  user_id: string;
  started_at: string;
  finished_at: string | null;
  messages_fetched: number;
  messages_inserted: number;
  messages_processed_ai: number;
  messages_skipped_already_processed: number;
  total_tokens_input: number;
  total_tokens_output: number;
  estimated_cost_usd: number;
  error: string | null;
};
