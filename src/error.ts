/**
 * Matomo - free/libre analytics platform
 *
 * @link https://matomo.org
 * @license http://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

import cc from './connector';
import {currentHost, log, logError, requestId} from './log';

const FORUM_URL = 'https://forum.matomo.org/c/looker-studio/25';

export class UserFacingError extends Error {}

/**
 * Throws an error that will be visible to the Looker Studio user. This should be called for
 * errors that are due to simple user errors, eg, not selecting a report or entering the wrong input.
 *
 * @param message
 * @throws Error
 */
export function throwUserError(message: string) {
  try {
    cc.newUserError().setText(message).throwException();
  } catch (e) {
    e.isConnectorThrownError = true;
    e.connectorErrorMessage = message; // so we can inspect the message later
    throw e;
  }
}

/**
 * Throws an error that will be visible to the Looker Studio user with some extra text detailing
 * where the user can get support. This should be called for errors that are unexpected and could
 * point to issues in the connector, or for errors that are not easy for the user to resolve themselves.
 *
 * @param error Error the error that occurred
 * @param callerId
 * @throws Error
 */
export function throwUnexpectedError(error: Error, callerId?: string) {
  try {
    logError(error, callerId);

    const { message } = error;

    const time = (new Date()).toString();
    const wholeMessage = `An error has occurred - if you need help, please reach out in the Forums here: ${FORUM_URL} or `
      + `contact us by email at hello@matomo.org (in your message, please use Looker Studio in the subject, and copy paste the error message). `
      + `Here is the full error message: ${message} (error occurred at ${time}, execution ID is ${requestId}, host is ${currentHost})`;
    cc.newUserError().setText(wholeMessage).throwException();
  } catch (e) {
    e.isConnectorThrownError = true;
    throw e;
  }
}

/**
 * Determines if an error was thrown via the above methods.
 */
export function isConnectorThrownError(e: any) {
  return !!e.isConnectorThrownError;
}

/**
 * Wraps a function in a try-catch that detects errors, and if they are not explicit errors
 * thrown by the connector, throws a user-friendly error message instead.
 *
 * Stops users from seeing something like "The connector had a problem" and instead
 * "An error occurred - if you need help, ... Here is the full error message: ...".
 *
 * This function should be used in most of the methods Looker Studio calls directly,
 * like getData(), getConfig() and getSchema().
 *
 * @param callerId
 * @param fn
 */
export function callWithUserFriendlyErrorHandling<T>(callerId: string, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (isConnectorThrownError(e)) {
      throw e;
    }

    throwUnexpectedError(e, callerId);
  }
}
