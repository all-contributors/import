// @ts-check

/**
 * @template T
 * @param {T[]} items
 * @param {number} size
 * @returns {T[][]}
 */
export function slicyBy(items, size) {
  let result = [];
  while (items.length) {
    result.push(items.splice(0, size));
  }

  return result;
}
