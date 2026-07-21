import { describe, expect, it } from "vitest";
import { distributeEvenly } from "./groupLayout";

describe("distributeEvenly", () => {
  it("returns empty array for empty input", () => {
    expect(distributeEvenly([])).toEqual([]);
  });

  it("returns single row when items fit in one row", () => {
    expect(distributeEvenly([1, 2, 3], 4)).toEqual([[1, 2, 3]]);
  });

  it("returns single row when items equal maxPerRow", () => {
    expect(distributeEvenly([1, 2, 3, 4], 4)).toEqual([[1, 2, 3, 4]]);
  });

  it("distributes 5 items into 3+2", () => {
    expect(distributeEvenly([1, 2, 3, 4, 5], 4)).toEqual([[1, 2, 3], [4, 5]]);
  });

  it("distributes 6 items into 3+3", () => {
    expect(distributeEvenly([1, 2, 3, 4, 5, 6], 4)).toEqual([[1, 2, 3], [4, 5, 6]]);
  });

  it("distributes 7 items into 4+3", () => {
    expect(distributeEvenly([1, 2, 3, 4, 5, 6, 7], 4)).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7],
    ]);
  });

  it("distributes 8 items into 4+4", () => {
    expect(distributeEvenly([1, 2, 3, 4, 5, 6, 7, 8], 4)).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
    ]);
  });

  it("distributes 9 items into 3+3+3", () => {
    expect(distributeEvenly([1, 2, 3, 4, 5, 6, 7, 8, 9], 4)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);
  });

  it("distributes 10 items into 4+3+3", () => {
    expect(distributeEvenly([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4)).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7],
      [8, 9, 10],
    ]);
  });

  it("distributes 3 items with maxPerRow=2 into 2+1", () => {
    expect(distributeEvenly([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });

  it("distributes 1 item into single row", () => {
    expect(distributeEvenly([42], 4)).toEqual([[42]]);
  });
});
