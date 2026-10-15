import { NextResponse } from "next/server";

// Domain errors thrown by the service layer. HTTP routes (and later MCP tools) translate
// them; services themselves never build HTTP responses.
export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// Map a service error to the JSON error response the routes have always returned
// (`{ error }` with 404/400). Anything else is unexpected and is rethrown.
export function errorResponse(e: unknown): NextResponse {
  if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
  if (e instanceof ValidationError) return NextResponse.json({ error: e.message }, { status: 400 });
  throw e;
}
