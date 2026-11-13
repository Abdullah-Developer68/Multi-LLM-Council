import { z } from 'zod';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address.'));

export const signUpSchema = z.object({
  email,
  password: z.string().min(8, 'Use at least 8 characters for your password.').max(200),
  fullName: z.string().trim().min(1, 'Tell us your name.').max(80),
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
});

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(1, 'Name cannot be empty.').max(80),
});

export const logoutSchema = z.object({
  everywhere: z.boolean().optional(),
});

export const councilSchema = z.object({
  prompt: z.string().trim().min(1, 'Write a question for the council.').max(8000, 'That prompt is too long.'),
  threadId: z.string().min(1).optional(),
  useContext: z.boolean().optional(),
});

export const updateThreadSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    pinned: z.boolean().optional(),
  })
  .refine((v) => v.title !== undefined || v.pinned !== undefined, 'Nothing to update.');

export const voteSchema = z.object({
  preferredAgentId: z.string().min(1).nullable(),
});

export const createUserSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required'),
  phone: z.string().optional(),
});
