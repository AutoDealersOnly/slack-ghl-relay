import { z } from "zod";

export const productionWebhookPayloadSchema = z.object({
  production_name: z.string().trim().min(1).max(255),
  proof_stage: z.string().trim().max(128).optional(),
  channel_name: z.string().trim().max(128).optional(),
  record_id: z.string().trim().max(128).optional(),
});

export type ProductionWebhookPayload = z.infer<typeof productionWebhookPayloadSchema>;

export const dealershipWebhookPayloadSchema = z.object({
  record_id: z.string().trim().min(1).max(128),
  verified: z.string().trim().max(128).optional(),
});

export type DealershipWebhookPayload = z.infer<typeof dealershipWebhookPayloadSchema>;

export const relayEventTypes = [
  "proof_status",
  "production_update",
  "create_channel",
  "push_campaign_values",
  "dealership_sync",
  "reschedule_archive",
  "cancel_archive",
] as const;

export type RelayEventType = (typeof relayEventTypes)[number];

export type ProductionProperties = {
  production?: string;
  event_start?: string;
  event_end?: string;
  scf_date?: string;
  deal_stage?: string;
  proof_stage?: string;
  mailer?: string;
  mailer_2?: string;
  mail_count?: number | string;
  job_numbers?: string;
  sales_rep?: string;
  closer?: string;
  greeter?: string;
  pin_code_ranges?: string;
};

export type DealershipProperties = {
  dealership_name?: string;
  street_address?: string;
  city?: string;
  state?: string;
  zip?: number | string;
  tracking?: string;
  tracking__2?: string;
  website?: string;
  alias?: string;
  alias_position?: string;
  hours?: string;
  crm_email?: string;
  brand?: string;
  crm_link?: string;
  passcode?: string;
  loc_id?: string;
  verified?: string;
  api_key?: string;
  qr_pass_page_url?: string;
};

export type GhlRelation = {
  objectKey: string;
  recordId: string;
};

export type GhlCustomObjectRecord<T> = {
  id?: string;
  properties: T;
  relations?: GhlRelation[];
};
