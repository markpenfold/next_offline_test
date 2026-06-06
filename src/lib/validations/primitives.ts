import { z } from "zod";

// Reusable primitives
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Must contain one uppercase letter")
  .regex(/[0-9]/, "Must contain one number");

const emailSchema = z.string().email("Please enter a valid email address");

// 1. Sign Up
export const signUpSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  full_name: z.string().min(2, "Full name must be at least 2 characters"),
  username: z.string().min(3, "Username must be at least 3 characters").toLowerCase(),
  account_name: z.string().min(2, "Account name is required"),
  planChoice: z.string().min(1, "Plan is required"),
  invite_token: z.string().optional(),
});

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