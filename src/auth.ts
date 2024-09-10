/**
 * Matomo - free/libre analytics platform
 *
 * @link https://matomo.org
 * @license http://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

import * as Api from './api';
import cc from './connector';
import { debugLog } from './log';

export function getAuthType() {
    return cc.newAuthTypeResponse()
        .setAuthType(cc.AuthType.USER_TOKEN)
        .setHelpUrl('https://matomo.org/connect-looker')
        .build();
}

export function checkForValidCreds(instanceUrl?: string, token?: string) {
  try {
    console.log(instanceUrl, token);
    const responseContent = Api.fetch('SitesManager.getSitesIdWithAtLeastViewAccess', {}, {
        instanceUrl,
        token,
    });
    console.log(responseContent);
    return Array.isArray(responseContent) && !!responseContent.length;
  } catch (error) {
    debugLog('checkForValidCreds:', 'failed to get sites ID with parameters', error.stack || error.message);
    return false;
  }
}

export function setCredentials(request) {
  const { username, token } = request.userToken;

  const instanceUrl = username;

  const isValidCreds = checkForValidCreds(instanceUrl, token);

  if (!isValidCreds) {
    return {
      errorCode: 'INVALID_CREDENTIALS',
    };
  }

  const userProperties = PropertiesService.getUserProperties();
  userProperties.setProperty('dscc.username', instanceUrl);
  userProperties.setProperty('dscc.token', token);

  return {
    errorCode: 'NONE',
  };
}

export function isAuthValid() {
  return checkForValidCreds();
}

export function resetAuth() {
  const userTokenProperties = PropertiesService.getUserProperties();
  userTokenProperties.deleteProperty('dscc.username');
  userTokenProperties.deleteProperty('dscc.token');
}

export function isAdminUser() {
  return false;
}
