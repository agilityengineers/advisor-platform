import { z } from "zod/v4";
import { PERMISSION_AREAS, PERMISSION_LEVELS, ROLES } from "./platform";

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
