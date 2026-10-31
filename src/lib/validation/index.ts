import { z } from 'zod';

export const signUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(1, 'Full name is required'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const multiAgentPromptSchema = z.object({
  prompt: z.string().min(1, 'Prompt cannot be empty'),
  threadId: z.string().optional(),
  apiKey: z.string().optional(),
});

export const createThreadSchema = z.object({
  title: z.string().optional(),
});

export const createUserSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().optional(),
});
