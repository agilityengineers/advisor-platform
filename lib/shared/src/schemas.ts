import { z } from "zod/v4";
import { DNS_PROVIDERS, INTEGRATION_PROVIDERS, PERMISSION_AREAS, PERMISSION_LEVELS, ROLES } from "./platform";
import { LEAD_SOURCES } from "./pipeline";

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const passwordSchema = z.string().min(10, "Use at least 10 characters").max(200);
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Lowercase letters, numbers and hyphens only");
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour");

export const roleSchema = z.enum(ROLES);
export const permsSchema = z.partialRecord(z.enum(PERMISSION_AREAS), z.enum(PERMISSION_LEVELS));

export const LoginBody = z.object({
  /** Email address or the super admin's username. */
  identifier: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});
export type LoginBody = z.infer<typeof LoginBody>;

export const ForgotPasswordBody = z.object({ email: emailSchema });
export const ResetPasswordBody = z.object({ token: z.string().min(16).max(256), password: passwordSchema });
export const MagicLinkRequestBody = z.object({ email: emailSchema });
export const MagicLinkVerifyBody = z.object({ token: z.string().min(16).max(256) });
export const AcceptInviteBody = z.object({
  token: z.string().min(16).max(256),
  name: z.string().trim().min(2).max(120),
  password: passwordSchema,
});

export const CreateInviteBody = z.object({
  email: emailSchema,
  name: z.string().trim().min(2).max(120).optional(),
  role: z.enum(["admin", "manager", "advisor"]),
  perms: permsSchema.optional(),
});
export type CreateInviteBody = z.infer<typeof CreateInviteBody>;

export const UpdateMemberBody = z.object({
  role: z.enum(["admin", "manager", "advisor"]).optional(),
  perms: permsSchema.optional(),
  name: z.string().trim().min(2).max(120).optional(),
});

export const ChangePasswordBody = z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema });

// ---------------------------------------------------------------------------
// Company console
// ---------------------------------------------------------------------------

export const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/, "Enter a domain like www.yourcompany.com");

export const LeadCreateBody = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: z.string().trim().max(40).default(""),
  category: z.string().trim().max(60).default(""),
  linkedin: z.string().trim().max(300).default(""),
  goal: z.string().trim().max(2000).default(""),
  stageId: z.number().int().positive().optional(),
  source: z.enum(LEAD_SOURCES).default("manual"),
});
export type LeadCreateBody = z.infer<typeof LeadCreateBody>;

export const LeadUpdateBody = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: emailSchema.optional(),
  phone: z.string().trim().max(40).optional(),
  category: z.string().trim().max(60).optional(),
  linkedin: z.string().trim().max(300).optional(),
  goal: z.string().trim().max(2000).optional(),
  stageId: z.number().int().positive().optional(),
  ownerUserId: z.number().int().positive().nullable().optional(),
});

/** The six-field landing form. `website` is a honeypot and must stay empty. */
export const PublicLeadBody = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: z.string().trim().min(7).max(40),
  category: z.string().trim().max(60).default(""),
  linkedin: z.string().trim().max(300).default(""),
  goal: z.string().trim().max(2000).default(""),
  website: z.string().max(0).optional(),
});

export const LeadNoteBody = z.object({ body: z.string().trim().min(1).max(2000) });
export const LeadEmailBody = z.object({ templateKey: z.string().min(1).max(40), note: z.string().trim().max(2000).default("") });

export const StageInput = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(40),
  kind: z.enum(["open", "won", "lost"]),
  color: z.string().trim().max(20).default("blue"),
});
export const StagesBody = z.object({ stages: z.array(StageInput).min(2).max(12) });

export const ReviewBody = z.object({
  name: z.string().trim().min(2).max(120),
  role: z.string().trim().max(160).default(""),
  category: z.string().trim().max(60).default(""),
  linkedin: z.string().trim().max(300).default(""),
  quote: z.string().trim().min(10).max(1500),
  visible: z.boolean().default(true),
  reviewedOn: z.string().trim().max(40).default(""),
});
export const ReviewOrderBody = z.object({ ids: z.array(z.number().int().positive()).min(1) });

export const BrandingBody = z.object({
  companyName: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(140).default(""),
  logoUrl: z.string().trim().max(500).default(""),
  primaryColor: hexColorSchema,
  accentColor: hexColorSchema,
});

export const DomainBody = z.object({ domain: hostnameSchema, provider: z.enum(DNS_PROVIDERS).default("other") });
export const DomainProviderBody = z.object({ provider: z.enum(DNS_PROVIDERS) });

export const IntegrationSaveBody = z.object({
  config: z.record(z.string(), z.union([z.string().max(500), z.boolean()])).default({}),
  secrets: z.record(z.string(), z.string().max(500)).default({}),
});
export const integrationProviderSchema = z.enum(INTEGRATION_PROVIDERS);

/** Advisor Platform landing form: demo or trial request → the platform pipeline. */
export const PlatformLeadBody = z.object({
  name: z.string().trim().min(2).max(120),
  company: z.string().trim().min(1).max(160),
  email: emailSchema,
  linkedin: z.string().trim().max(300).default(""),
  intent: z.enum(["demo", "trial"]).default("demo"),
  website: z.string().max(0).optional(),
});

export const PlatformLeadUpdateBody = z.object({
  status: z.enum(["new", "contacted", "demo_booked", "trial_started", "converted", "closed"]).optional(),
  notes: z.string().trim().max(4000).optional(),
  convertedCompanyId: z.number().int().positive().nullable().optional(),
});

// ---------------------------------------------------------------------------
// Buying flow
// ---------------------------------------------------------------------------

export const CheckoutBody = z.object({
  offer: z.enum(["audit", "blueprint", "lab", "live", "voice", "exec"]),
  plan: z.enum(["full", "split"]).default("full"),
  bumps: z.object({ banner: z.boolean().optional(), rush: z.boolean().optional() }).default({}),
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: z.string().trim().max(40).default(""),
  leadId: z.string().trim().max(60).optional(),
  website: z.string().max(0).optional(),
});

export const IntakeBody = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).default(""),
  linkedin: z.string().trim().min(1, "Your LinkedIn URL is required.").max(300),
  knownFor: z.string().trim().min(10, "A sentence or two is plenty.").max(2000),
  audience: z.string().trim().max(500).default(""),
  access: z.enum(["upload", "self"]).default("upload"),
});

export const BookedBody = z.object({
  eventUri: z.string().trim().max(400).default(""),
  inviteeUri: z.string().trim().max(400).default(""),
});

export const ClientStageUpdateBody = z.object({
  status: z.enum(["pending", "current", "done", "scheduled"]),
  note: z.string().trim().max(500).optional(),
  notify: z.boolean().default(true),
});

export const ClientFileBody = z.object({
  name: z.string().trim().min(1).max(160),
  url: z.string().trim().url().max(2000),
  stageKey: z.string().trim().max(40).default(""),
  notify: z.boolean().default(false),
});

export const InstallmentActionBody = z.object({
  action: z.enum(["charge", "mark_paid", "cancel"]),
});
