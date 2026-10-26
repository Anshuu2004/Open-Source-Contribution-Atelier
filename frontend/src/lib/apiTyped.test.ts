import { describe, it, expect, vi, beforeEach, expectTypeOf } from "vitest";
import type { components } from "../types/api";

vi.mock("./otelProvider", () => ({ getTraceHeaders: () => ({}) }));

import {
  apiGet,
  buildApiEndpoint,
  type ApiGetPath,
  type ApiGetResponse,
} from "./api";
import { extractSearchResults } from "../hooks/useAdvancedSearch";

describe("buildApiEndpoint", () => {
  it("strips the /api prefix", () => {
    expect(buildApiEndpoint("/api/search/")).toBe("/search/");
  });

  it("substitutes and encodes path params", () => {
    expect(
      buildApiEndpoint("/api/chat/rooms/{room_id}/messages/", {
        room_id: "a b/c",
      }),
    ).toBe("/chat/rooms/a%20b%2Fc/messages/");
  });

  it("appends defined query params and skips undefined", () => {
    expect(
      buildApiEndpoint("/api/search/", undefined, {
        page: 2,
        page_size: undefined,
      }),
    ).toBe("/search/?page=2");
  });

  it("throws on a missing path param", () => {
    expect(() =>
      buildApiEndpoint("/api/chat/rooms/{room_id}/messages/", {}),
    ).toThrow(/room_id/);
  });
});

describe("apiGet", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requests the built endpoint with GET", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ count: 0, results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const data = await apiGet("/api/chat/rooms/{room_id}/messages/", {
      pathParams: { room_id: "r1" },
      requireAuth: false,
      suppressErrorToast: true,
    });
    expect(data).toEqual({ count: 0, results: [] });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toMatch(/\/chat\/rooms\/r1\/messages\/$/);
    expect((init as RequestInit).method).toBe("GET");
  });
});

describe("extractSearchResults", () => {
  it("handles a bare array", () => {
    expect(extractSearchResults([{ id: 1 }])).toEqual({
      items: [{ id: 1 }],
      count: undefined,
    });
  });
  it("handles a paginated object", () => {
    expect(extractSearchResults({ count: 5, results: [{ id: 1 }] })).toEqual({
      items: [{ id: 1 }],
      count: 5,
    });
  });
  it("handles null", () => {
    expect(extractSearchResults(null)).toEqual({ items: [], count: undefined });
  });
});

describe("types", () => {
  it("infers response types from the generated schema", () => {
    expectTypeOf<
      ApiGetResponse<"/api/chat/rooms/{room_id}/messages/">
    >().toEqualTypeOf<components["schemas"]["PaginatedMessageList"]>();
    expectTypeOf<"/api/search/">().toExtend<ApiGetPath>();
    expectTypeOf<"/api/not-a-real-path/">().not.toExtend<ApiGetPath>();
  });
});
