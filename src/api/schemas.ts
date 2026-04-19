import { z } from "@hono/zod-openapi";

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** Query parameters for paginated list endpoints. */
export const PaginationRequestSchema = z
  .object({
    pageSize: z
      .string()
      .optional()
      .transform((v) => (v === undefined || v === "" ? 50 : Number(v)))
      .pipe(z.number().int().min(0).max(100))
      .openapi({
        description: "Maximum number of results per page (0–100, default 50).",
        example: 50,
      }),
    pageToken: z.string().optional().openapi({
      description: "Opaque cursor from a previous response's nextPageToken.",
      example: "",
    }),
  })
  .openapi("PaginationRequest");

/** Fields included in every paginated response. */
export const PaginationResponseSchema = z
  .object({
    nextPageToken: z.string().openapi({
      description: "Opaque cursor for the next page. Empty string indicates the last page.",
      example: "",
    }),
    totalSize: z.number().int().openapi({
      description: "Total number of items matching the query.",
      example: 42,
    }),
  })
  .openapi("PaginationResponse");

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/** Standard error response body. */
export const ErrorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({
        description: "Machine-readable error code.",
        example: "not_found",
      }),
      message: z.string().openapi({
        description: "Human-readable error message.",
        example: "The requested resource was not found.",
      }),
    }),
  })
  .openapi("ErrorResponse");

// ---------------------------------------------------------------------------
// Embedded objects
// ---------------------------------------------------------------------------

/** Minimal user reference embedded in API responses. */
export const EmbeddedUserSchema = z
  .object({
    id: z
      .string()
      .uuid()
      .openapi({ description: "User ID.", example: "550e8400-e29b-41d4-a716-446655440000" }),
    displayName: z.string().openapi({ description: "User display name.", example: "Alice" }),
  })
  .openapi("EmbeddedUser");

/** User reference with avatar URL. */
export const EmbeddedUserWithAvatarSchema = z
  .object({
    id: z
      .string()
      .uuid()
      .openapi({ description: "User ID.", example: "550e8400-e29b-41d4-a716-446655440000" }),
    displayName: z.string().openapi({ description: "User display name.", example: "Alice" }),
    avatarUrl: z.string().url().nullable().openapi({
      description: "URL of the user's avatar image.",
      example: "https://example.com/avatar.png",
    }),
  })
  .openapi("EmbeddedUserWithAvatar");

/** Usergroup reference embedded in API responses. */
export const EmbeddedUsergroupSchema = z
  .object({
    id: z
      .string()
      .uuid()
      .openapi({ description: "Usergroup ID.", example: "660e8400-e29b-41d4-a716-446655440000" }),
    name: z.string().openapi({ description: "Usergroup name.", example: "Backend Team" }),
    handle: z
      .string()
      .openapi({ description: "Usergroup handle (mention name).", example: "backend" }),
  })
  .openapi("EmbeddedUsergroup");

/** Task creator reference. */
export const CreatedBySchema = z
  .object({
    id: z
      .string()
      .uuid()
      .openapi({ description: "User ID.", example: "550e8400-e29b-41d4-a716-446655440000" }),
    displayName: z.string().openapi({ description: "User display name.", example: "Bob" }),
  })
  .openapi("CreatedBy");
