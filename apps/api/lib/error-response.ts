/** The one error shape of /v1: `{ error: { code, messageKey, fields } }`, with `x-request-id`. */
export function errorResponse(
  status: number,
  code: string,
  requestId: string,
  {
    fields = {},
    headers = {},
  }: {
    fields?: Record<string, string>;
    headers?: Record<string, string>;
  } = {},
): Response {
  return Response.json(
    { error: { code, messageKey: `apiErrors.${code}`, fields } },
    { status, headers: { ...headers, "x-request-id": requestId } },
  );
}
