import { describe, expect, test } from "vitest";
import { isPrivateAddress } from "@/server/imageSearch";

describe("isPrivateAddress", () => {
  test("blocks local and private ranges", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.10", "172.16.5.5", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) expect(isPrivateAddress(ip)).toBe(true);
  });
  test("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "142.250.185.78", "172.32.0.1", "2a00:1450:4001::200e"]) expect(isPrivateAddress(ip)).toBe(false);
  });
});
