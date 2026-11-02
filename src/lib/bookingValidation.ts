export interface AuthoritativeBookingResponse {
  ok: boolean;
  booking?: { id?: string } | null;
}

export function isAuthoritativeBookingAccepted(
  response: AuthoritativeBookingResponse
): boolean {
  return response.ok === true && Boolean(response.booking?.id);
}
