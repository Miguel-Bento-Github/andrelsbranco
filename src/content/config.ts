import { defineCollection, z } from 'astro:content';

// Photo schema for portraits and bits-pieces
const photoSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  image: z.string(),
  thumbnail: z.string().optional(),
  width: z.number(),
  height: z.number(),
  featured: z.boolean().default(false),
  date: z.coerce.date(),
  order: z.number().default(0)
});

// Video schema for film
const videoSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  video: z.string(),
  thumbnail: z.string(),
  thumbnailWidth: z.number(),
  thumbnailHeight: z.number(),
  featured: z.boolean().default(false),
  date: z.coerce.date(),
  order: z.number().default(0)
});

// Define collections
const portraits = defineCollection({
  type: 'content',
  schema: photoSchema
});

const bitsPieces = defineCollection({
  type: 'content',
  schema: photoSchema
});

const film = defineCollection({
  type: 'content',
  schema: videoSchema
});

const overview = defineCollection({
  type: 'content',
  schema: photoSchema
});

export const collections = {
  'portraits': portraits,
  'bits-pieces': bitsPieces,
  'film': film,
  'overview': overview
};
