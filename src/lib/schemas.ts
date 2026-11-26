import { z } from 'zod';

/** Validation shared by forms (React Hook Form) and services, so bad input is rejected in both places. */

const text = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, min === 1 ? `${label} is required` : `${label} needs at least ${min} characters`)
    .max(max, `${label} can be at most ${max} characters`);

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');
export const passwordSchema = z.string().min(8, 'Use at least 8 characters').max(72, 'Use at most 72 characters');
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s-]{7,16}$/, 'Enter a valid phone number');

export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password') });
export const signUpSchema = z.object({ name: text(2, 60, 'Name'), email: emailSchema, password: passwordSchema });
export const forgotSchema = z.object({ email: emailSchema });
export const profileSchema = z.object({ name: text(2, 60, 'Name'), homeArea: z.string().trim().max(80).optional(), bio: z.string().trim().max(240, 'Keep it under 240 characters').optional() });

export const reviewSchema = z.object({
  rating: z.number().int().min(1, 'Tap a star to rate').max(5),
  aspects: z.record(z.string(), z.number().int().min(1).max(5)),
  text: text(12, 1500, 'Your review'),
  photos: z.array(z.string()).max(4, 'You can attach up to 4 photos'),
});

export const reportSchema = z.object({
  type: z.enum(['queue', 'wait_time', 'availability', 'parking', 'traffic', 'road', 'closure', 'event', 'price', 'outage', 'service']),
  title: text(3, 90, 'Update'),
  level: z.enum(['good', 'moderate', 'bad', 'info']),
  value: z.number().min(0).max(100000).optional(),
  note: z.string().trim().max(280, 'Keep the note under 280 characters').optional(),
});

export const collectionSchema = z.object({ name: text(2, 40, 'Collection name'), description: z.string().trim().max(120).optional() });

export const suggestionSchema = z.object({
  name: text(2, 80, 'Name'),
  categoryId: z.string().optional(),
  details: text(10, 600, 'Details'),
});

export const eventSchema = z
  .object({
    title: text(4, 80, 'Title'),
    description: text(20, 600, 'Description'),
    kind: z.enum(['music', 'market', 'sports', 'community', 'food', 'workshop', 'culture', 'wellness']),
    venueName: text(2, 80, 'Venue'),
    date: z.string().min(1, 'Pick a date'),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a start time'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Pick an end time'),
    price: z.string().trim().max(30).default('Free'),
  })
  .refine((v) => v.endTime > v.startTime, { path: ['endTime'], message: 'End time must be after the start' });

export const dealSchema = z
  .object({
    title: text(6, 70, 'Title'),
    description: text(12, 300, 'Description'),
    kind: z.enum(['discount', 'offer', 'happy_hour', 'seasonal', 'event', 'limited']),
    badge: text(2, 18, 'Badge'),
    code: z.string().trim().max(16).optional(),
    terms: z.string().trim().max(200).optional(),
    startsOn: z.string().min(1, 'Pick a start date'),
    endsOn: z.string().min(1, 'Pick an end date'),
  })
  .refine((v) => v.endsOn >= v.startsOn, { path: ['endsOn'], message: 'End date must be on or after the start date' });

export const businessDetailsSchema = z.object({
  name: text(2, 80, 'Business name'),
  description: text(20, 500, 'Description'),
  categoryId: z.string().min(1, 'Choose a category'),
});

export const businessContactSchema = z.object({
  phone: phoneSchema,
  email: emailSchema.optional().or(z.literal('')),
  website: z
    .string()
    .trim()
    .max(200)
    .refine((v) => !v || /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v), 'Enter a valid website address')
    .optional(),
  address: text(8, 200, 'Address'),
});

/* ── Uploads ────────────────────────────────────────────────────────────── */

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateImage(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return 'Use a JPG, PNG or WebP image.';
  if (file.size > MAX_IMAGE_BYTES) return 'That image is larger than 5 MB.';
  return null;
}

/** Downscale and re-encode an image in the browser so uploads stay small and carry no EXIF location. */
export async function compressImage(file: File, maxSide = 1280, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type ReportInput = z.infer<typeof reportSchema>;
