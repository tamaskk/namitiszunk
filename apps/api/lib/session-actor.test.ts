import { beforeEach, describe, expect, it, vi } from "vitest";

// "server-only" throws outside a React Server Components bundle.
vi.mock("server-only", () => ({}));

// Better Auth is the boundary: a session exists only under the app's own cookie name.
const auth = vi.hoisted(() => ({
  getAuth: vi.fn(async (app: string) => ({ app })),
  userActorFromHeaders: vi.fn(
    async (_auth: unknown, app: string, headers: Headers) => {
      const cookie = headers.get("cookie") ?? "";
      const bearer = headers.get("authorization");
      return cookie.includes(`nmi-${app}.session_token=`) ||
        (app === "order" && bearer === "Bearer mobile")
        ? { kind: "user", id: `user:${app}`, userId: app, memberships: [] }
        : null;
    },
  ),
  isStaffDevice: vi.fn((request: Request) =>
    Boolean(request.headers.get("cookie")?.includes("nmi-device=")),
  ),
  staffActorFromRequest: vi.fn(async (request: Request) =>
    request.headers.get("cookie")?.includes("nmi-staff=")
      ? { kind: "staff", id: "staff:1", venueId: "v", memberId: "1" }
      : null,
  ),
}));
vi.mock("@namitiszunk/auth", () => auth);

const { getSessionActor } = await import("./session-actor");

const request = (headers: Record<string, string>, method = "GET") =>
  new Request("https://api.namitiszunk.hu/v1/ping", { method, headers });

beforeEach(() => vi.clearAllMocks());

describe("getSessionActor", () => {
  it("reads the session of the app the allowlisted Origin belongs to", async () => {
    const req = request({
      origin: "https://admin.namitiszunk.hu",
      cookie: "nmi-order.session_token=a; nmi-admin.session_token=b",
    });

    const actor = await getSessionActor(req);

    expect(actor).toMatchObject({ id: "user:admin" });
    expect(auth.getAuth).toHaveBeenCalledWith("admin");
  });

  it("gives no session for an admin cookie on an HQ request", async () => {
    const req = request({
      origin: "https://hq.namitiszunk.hu",
      cookie: "nmi-admin.session_token=b",
    });

    const actor = await getSessionActor(req);

    expect(actor).toBeNull();
    expect(auth.getAuth).toHaveBeenCalledWith("hq");
  });

  it("gives no session for an unknown or non-app origin", async () => {
    const cookie = "nmi-admin.session_token=b";

    const results = await Promise.all([
      getSessionActor(request({ origin: "https://evil.example", cookie })),
      getSessionActor(request({ origin: "https://namitiszunk.hu", cookie })),
    ]);

    expect(results).toEqual([null, null]);
    expect(auth.getAuth).not.toHaveBeenCalled();
  });

  it("rejects a cookie-authenticated POST without Origin (CSRF)", async () => {
    const req = request({ cookie: "nmi-admin.session_token=b" }, "POST");

    const actor = await getSessionActor(req);

    expect(actor).toBeNull();
    expect(auth.getAuth).not.toHaveBeenCalled();
  });

  it("accepts an order-app Bearer token without Origin and ignores its cookies", async () => {
    const req = request(
      { authorization: "Bearer mobile", cookie: "nmi-admin.session_token=b" },
      "POST",
    );

    const actor = await getSessionActor(req);

    expect(actor).toMatchObject({ id: "user:order" });
    const headers = auth.userActorFromHeaders.mock.calls[0]![2];
    expect(headers.get("cookie")).toBeNull();
  });

  it("never lets a member session act on a staff device without a PIN", async () => {
    const cookie = "nmi-device=d; nmi-admin.session_token=t";

    const actor = await getSessionActor(
      request({ origin: "https://admin.namitiszunk.hu", cookie }),
    );

    expect(actor).toBeNull();
  });

  it("falls back to the staff PIN session on the admin bar view only", async () => {
    const cookie = "nmi-device=d; nmi-staff=s";

    const admin = await getSessionActor(
      request({ origin: "https://admin.namitiszunk.hu", cookie }),
    );
    const order = await getSessionActor(
      request({ origin: "https://rendel.namitiszunk.hu", cookie }),
    );

    expect(admin).toMatchObject({ kind: "staff" });
    expect(order).toBeNull();
  });
});
