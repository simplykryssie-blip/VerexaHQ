import { z } from "zod";

export const newConversationSchema = z.object({
  clientId: z.string().uuid("Choose a client."),
  subject: z.string().max(200).optional().nullable(),
  body: z.string().trim().min(1, "Enter a message."),
  clientVisible: z.boolean().default(true),
});
export type NewConversationInput = z.infer<typeof newConversationSchema>;

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, "Enter a message."),
  clientVisible: z.boolean().default(true),
  attachmentDocumentId: z.string().uuid().optional().nullable(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
