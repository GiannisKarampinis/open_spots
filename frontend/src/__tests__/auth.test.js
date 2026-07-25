import axios from "axios";

import { refreshAccessToken } from "../utils/auth";

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
  });

  test("allows a later retry after a failed refresh", async () => {
    axios.post
      .mockRejectedValueOnce(new Error("refresh failed"))
      .mockResolvedValueOnce({ data: { access: "retry-access-token" } });

    await expect(refreshAccessToken()).rejects.toThrow("refresh failed");
    await expect(refreshAccessToken()).resolves.toBe("retry-access-token");

    expect(axios.post).toHaveBeenCalledTimes(2);
  });
});
