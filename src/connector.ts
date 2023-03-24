/**
 * Matomo - free/libre analytics platform
 *
 * @link https://matomo.org
 * @license http://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

export interface ConnectorParams {
  idsite?: string;
  reportCategory?: string;
  report?: string;
  segment?: string;
}

export default DataStudioApp.createCommunityConnector();
