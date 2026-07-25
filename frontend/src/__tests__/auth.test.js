import axios from "axios";

import { getAccessToken, refreshAccessToken, storeAuthResponse } from "../utils/auth";

jest.mock("axios", () => {
  const mockAxios = jest.fn();
  mockAxios.post = jest.fn();
  return mockAxios;
});

describe("refreshAccessToken", () => {
  beforeEach(() => {
    axios.post.mockReset();
    localStorage.clear();
  });

  test("shares one refresh request between concurrent callers", async () => {
    localStorage.setItem("access", "stale-access");
    localStorage.setItem("refresh", "stale-refresh");
    let resolveRefresh;
    const response = new Promise((resolve) => {
      resolveRefresh = resolve;
    });
    axios.post.mockReturnValue(response);

    const firstRefresh = refreshAccessToken();
    const secondRefresh = refreshAccessToken();
    const thirdRefresh = refreshAccessToken();

    expect(axios.post).toHaveBeenCalledTimes(1);

    resolveRefresh({ data: { access: "rotated-access-token" } });

    await expect(Promise.all([firstRefresh, secondRefresh, thirdRefresh])).resolves.toEqual([
      "rotated-access-token",
      "rotated-access-token",
      "rotated-access-token",
    ]);
    expect(localStorage.getItem("access")).toBeNull();
    expect(localStorage.getItem("refresh")).toBeNull();
  });

  test("allows a later retry after a failed refresh", async () => {
    axios.post
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockResolvedValueOnce({ data: { access: "retry-access-token" } });

    await expect(refreshAccessToken()).rejects.toThrow("refresh failed");
    await expect(refreshAccessToken()).resolves.toBe("retry-access-token");

    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  test("keeps access in memory and removes JavaScript-readable tokens", () => {
    localStorage.setItem("refresh", "legacy-refresh");
    localStorage.setItem("refresh_token", "legacy-refresh-token");
    localStorage.setItem("access", "legacy-access");
    localStorage.setItem("access_token", "legacy-access-token");

    storeAuthResponse({
      access: "memory-only-access",
      refresh: "must-not-be-stored",
      user: { id: 1, username: "apiuser" },
    });

    expect(getAccessToken()).toBe("memory-only-access");
    expect(localStorage.getItem("access")).toBeNull();
    expect(localStorage.getItem("access_token")).toBeNull();
    expect(localStorage.getItem("refresh")).toBeNull();
    expect(localStorage.getItem("refresh_token")).toBeNull();
    expect(JSON.parse(localStorage.getItem("user"))).toEqual({ id: 1, username: "apiuser" });
  });
});
