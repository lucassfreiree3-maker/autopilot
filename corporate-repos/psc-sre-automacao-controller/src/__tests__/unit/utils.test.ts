import { convertNumber, diffTimeInSeconds } from "../../util/utils";

describe("Utility Functions", () => {
  describe("convertNumber", () => {
    it("should convert a valid string to a number", () => {
      const value = "123";

      const result = convertNumber(value);

      expect(result).toBe(123);
    });

    it("should return the fallback value if the input is invalid", () => {
      const value = "invalid";
      const fallbackValue = 456;

      const result = convertNumber(value, fallbackValue);

      expect(result).toBe(fallbackValue);
    });

    it("should throw an error if the input is invalid and no fallback value is set", () => {
      const value = "invalid";

      expect(() => convertNumber(value)).toThrowError(
        "Invalid number! No fallback value set.",
      );
    });
  });

  describe("diffTimeInSeconds", () => {
    it("should calculate the time difference in seconds", () => {
      const start: [number, number] = [1000, 500000000];

      const result = diffTimeInSeconds(start);

      expect(result).toBeGreaterThan(0);
    });
  });
});
