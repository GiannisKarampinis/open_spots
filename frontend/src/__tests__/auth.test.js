import axios from "axios";

import {
  clearStoredAuth,
  getAccessToken,
  getCurrentUser,
  refreshAccessToken,
  requestWithAuth,
  storeAuthResponse,
} from "../utils/auth";

jest.mock("axios", () => {
  const mockAxios = jest.fn();
  mockAxios.get = jest.fn();
  mockAxios.post = jest.fn();
  return mockAxios;
});

describe("refreshAccessToken", () => {
  beforeEach(() => {
    axios.get.mockReset();
    axios.post.mockReset();
    axios.mockReset();
    axios.get.mockResolvedValue({ data: { csrfToken: "test-csrf-token" } });
    localStorage.clear();
    clearStoredAuth();
  });

  test("shares one refresh request between concurrent callers", async () => {
    let resolveRefresh;
    const response = new Promise((resolve) => {
      resolveRefresh = resolve;
    });
    axios.post.mockReturnValue(response);

    const firstRefresh = refreshAccessToken();
    const secondRefresh = refreshAccessToken();
    const thirdRefresh = refreshAccessToken();

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(axios.post).toHaveBeenCalledTimes(1);

    resolveRefresh({ data: { access: "rotated-access-token" } });

    await expect(Promise.all([firstRefresh, secondRefresh, thirdRefresh])).resolves.toEqual([
      "rotated-access-token",
      "rotated-access-token",
      "rotated-access-token",
    ]);
  });

  test("allows a later retry after a failed refresh", async () => {
    axios.post
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockResolvedValueOnce({ data: { access: "retry-access-token" } });

    await expect(refreshAccessToken()).rejects.toThrow("refresh failed");
    await expect(refreshAccessToken()).resolves.toBe("retry-access-token");

    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  test("keeps access and user in memory", () => {
    storeAuthResponse({
      access: "memory-only-access",
      refresh: "must-not-be-stored",
      user: { id: 1, username: "apiuser" },
    });

    expect(getAccessToken()).toBe("memory-only-access");
    expect(getCurrentUser()).toEqual({ id: 1, username: "apiuser" });
  });

  test("does not clear a valid session when the retried request returns a non-401 error", async () => {
    storeAuthResponse({
      access: "expired-access",
      user: { id: 1, username: "apiuser" },
    });
    axios
      .mockRejectedValueOnce({ response: { status: 401 } })
      .mockRejectedValueOnce({ response: { status: 403 } });
    axios.post.mockResolvedValue({ data: { access: "rotated-access" } });

    await expect(requestWithAuth("get", "/protected/")).rejects.toEqual({
      response: { status: 403 },
    });

    expect(getAccessToken()).toBe("rotated-access");
    expect(getCurrentUser()).toEqual({ id: 1, username: "apiuser" });
  });
});
