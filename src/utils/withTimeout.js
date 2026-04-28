/**
 * Races a promise against a timeout.
 * Throws an error with code TIMEOUT if the deadline is exceeded.
 *
 * @param {Promise} promise - The operation to guard
 * @param {number} ms - Timeout in milliseconds
 * @param {string} label - Used in the error message for debugging
 */
function withTimeout(promise, ms, label = "operation") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.code = "TIMEOUT";
      reject(err);
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = withTimeout;
