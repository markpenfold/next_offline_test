import { z } from "zod";
import leoProfanity from 'leo-profanity';


/////////////////////////////////////////////////////////////////////////////////////////////////////////////
// HELPERS HELPERS HELPERS HELPERS HELPERS HELPERS HELPERS HELPERS HELPERS HELPERS HELPERS HELPERS HELPERS///
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

export function containsProfanity(text: string): boolean {
  if (!text) return false;
  // Clean spaces, hyphens, underscores, and numbers to catch obfuscated words
  const cleanedText = text.toLowerCase().replace(/[-_\s0-9]/g, '');
  
  // Also check the raw text just in case
  return leoProfanity.check(text.toLowerCase()) || leoProfanity.check(cleanedText);
}

export const RESERVED_WORDS = [
  'www',
  'admin',
  'administrator',
  'api',
  'app',
  'auth',
  'blog',
  'dashboard',
  'help',
  'login',
  'logout',
  'mail',
  'omen',
  'root',
  'settings',
  'signup',
  'smtp',
  'status',
  'support',
  'system',
  'test',
  'webmail',
];

export function isRestrictedText(text: string, checkReserved = false): boolean {
  if (!text) return false;

  const lower = text.trim().toLowerCase();
  const cleaned = lower.replace(/[-_\s0-9]/g, '');

  // 1. Check profanity (catches words anywhere in the string)
  if (leoProfanity.check(lower) || leoProfanity.check(cleaned)) {
    return true;
  }

  // 2. Check reserved system words (exact match only for slugs/usernames)
  if (checkReserved && RESERVED_WORDS.includes(lower)) {
    return true;
  }

  return false;
}


/////////////////////////////////////////////////////////////////////////////////////////////////////////////
// CHECKS  CHECKS  CHECKS  CHECKS  CHECKS  CHECKS  CHECKS  CHECKS  CHECKS  CHECKS  CHECKS  CHECKS  CHECKS ///
/////////////////////////////////////////////////////////////////////////////////////////////////////////////



// Reusable primitives
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Must contain one uppercase letter")
  .regex(/[0-9]/, "Must contain one number");

const emailSchema = z.string().email("Please enter a valid email address");


// Reusable field validator to avoid repeating the profanity check code
const cleanDisplaySchema = (fieldName: string, minLength = 2) =>
  z.string()
    .min(minLength, `${fieldName} must be at least ${minLength} characters`)
    .refine((val) => !isRestrictedText(val, false), {
      message: `${fieldName} contains restricted words.`,
    });

export const fullNameSchema = cleanDisplaySchema("Full name", 2)
  .refine((val) => !isRestrictedText(val, false), {
    message: "Full name contains restricted or inappropriate words.",
  })

export const usernameSchema = z.string()
  .min(3, "Username must be at least 3 characters")
  .max(20, "Username cannot exceed 20 characters")
  .toLowerCase()
  .regex(/^[a-z0-9_-]+$/, "Username can only contain letters, numbers, hyphens, and underscores")
  .refine((val) => !isRestrictedText(val, true), {
    message: "This username is reserved or not allowed.",
  })

export const accountNameSchema = cleanDisplaySchema("Account name", 2)
  .refine((val) => !isRestrictedText(val, true), {
    message: "This account name is reserved or not allowed.",
  })

export const blogNameSchema = cleanDisplaySchema("Blog name", 2)

export const blogSlugSchema = z.string()
  .min(2, "Blog URL is too short")
  .regex(/^[a-z0-9-]+$/, "Blog URL can only contain lowercase letters, numbers, and hyphens")
  .refine((slug) => !isRestrictedText(slug, true), {
    message: "This blog URL is reserved or not allowed.",
  })

// --- Main Combined Sign Up Schema ---

export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  full_name: fullNameSchema,
  account_name: accountNameSchema,
  blog_title: blogNameSchema,
  username: usernameSchema,
  blog_slug: blogSlugSchema,
  planChoice: z.string().min(1, "Plan is required"),
  invite_token: z.string().optional(),
})

export type SignUpPayload = z.infer<typeof signUpSchema>

// 2. Login
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"), // Don't validate strength on login
});

// 3. Forgot Password
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

// 4. Update Password (with confirmation)
export const updatePasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});


const MAX_FILE_SIZE = 512000; // 500KB
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];



export const avatarSchema = z.object({
  image: z
    .custom<File>()
    .refine((file) => file instanceof File, "Please select an image file.")
    .refine((file) => file?.size <= MAX_FILE_SIZE, `Max file size is 500KB.`)
    .refine(
      (file) => ACCEPTED_IMAGE_TYPES.includes(file?.type),
      ".jpg, .jpeg, .png and .webp files are accepted."
    ),
});


// Profile Validation
export const profileSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(20),
  full_name: z.string().min(1, "Name is required"),
  location: z.string().optional(),
  age: z.coerce.number().min(12, "Must be 12+").max(120).optional(),
});

// Project Validation (Includes the hidden account_id)
export const projectSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  content: z.any().optional(), // Or a more specific schema for your JSONB
  account_id: z.string().uuid("Invalid account ID"),
});

// Type inference (saves you from writing types twice)
export type ProfileInput = z.infer<typeof profileSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;