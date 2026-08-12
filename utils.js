'use strict';

/**
 * Normalizes a caught value into an Error instance.
 *
 * Catch bindings are typed as `unknown` under strict checking, and some
 * libraries throw plain strings instead of Error objects. Reading
 * `err.message` on a non-Error value silently produces `undefined`,
 * which makes production debugging nearly impossible.
 *
 * @param {unknown} err - The value caught in a try/catch.
 * @returns {Error} A proper Error instance preserving the original message.
 */
function errOf(err) {
  if (err instanceof Error) return err;
  return new Error(typeof err === 'string' ? err : JSON.stringify(err));
}

module.exports = { errOf };
