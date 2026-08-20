export type MessageThreadRow = {
  id: string;
  subject: string | null;
  channel: string;
  status: string;
  entity_type: string;
  entity_id: string;
  last_message_at: string | null;
  contextLabel?: string;
};

export type MessageRow = {
  id: string;
  thread_id: string;
  sender_type: string;
  sender_id: string | null;
  body: string;
  is_internal: boolean;
  read_at: string | null;
  created_at: string;
};
