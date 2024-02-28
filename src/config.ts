/**
 * Matomo - free/libre analytics platform
 *
 * @link https://matomo.org
 * @license http://www.gnu.org/licenses/gpl-3.0.html GPL v3 or later
 */

import { ConnectorParams } from './connector';
import * as Api from './api';
import cc from './connector';
import env from './env';
import {
  throwUserError,
  callWithUserFriendlyErrorHandling
} from './error';
import { debugLog, log } from './log';

interface ConfigStep {
  isFilledOut(params?: ConnectorParams): boolean;
  validate(params?: ConnectorParams): void;
  addControls(config: GoogleAppsScript.Data_Studio.Config, params?: ConnectorParams): void;
}

const CONFIG_REQUEST_CACHE_TTL_SECS = parseInt(env.CONFIG_REQUEST_CACHE_TTL_SECS, 10) || 0;

function getSitesWithAtLeastViewAccess() {
  return Api.fetch<Api.Site[]>('SitesManager.getSitesWithAtLeastViewAccess', {
    filter_limit: '-1',
  }, {
    cacheKey: 'getConfig.SitesManager.getSitesWithAtLeastViewAccess',
    cacheTtl: CONFIG_REQUEST_CACHE_TTL_SECS,
  });
}

function getMatomoVersion() {
  const version = Api.fetch<{ value: string }>('API.getMatomoVersion').value;
  const [major, minor] = version.split('.').map((s) => parseInt(s, 10));
  return { major, minor };
}

function getReportMetadata(idSite: string) {
  const cache = CacheService.getUserCache();
  const cacheKey = `getConfig.API.getReportMetadata.${idSite}`;

  const cachedValue = cache.get(cacheKey);
  if (typeof cachedValue !== 'undefined' && cachedValue !== null) {
    try {
      return JSON.parse(cachedValue);
    } catch (e) {
      log(`unable to parse cache value for ${cacheKey}, making actual request`);
    }
  }

  let response = Api.fetch<Api.ReportMetadata[]>(
    'API.getReportMetadata',
    {
      idSite: idSite,
      period: 'day',
      date: 'yesterday',
      filter_limit: '-1',
      language: Session.getActiveUserLocale(),
    },
  );

  const hasMetricTypes = !!response.find((r) => typeof r.metricTypes === 'object');

  // reports that do not define metrics in their metadata cannot be displayed in looker studio
  response = response
    .filter((report) => {
      return report.metrics
        || report.processedMetrics
        || report.metricsGoal
        || report.processedMetricsGoal;
    })
    // don't show MultiSites.getOne since it has no usable label
    .filter((r) => !(r.module === 'MultiSites' && r.action === 'getOne'));

  // remove unused properties from response so the result can fit in the cache
  response = response.map((r) => ({
    module: r.module,
    action: r.action,
    category: r.category,
    name: r.name,
    parameters: r.parameters,
  } as unknown as Api.ReportMetadata));

  const result = { reportMetadata: response, hasMetricTypes };

  try {
    cache.put(cacheKey, JSON.stringify(result));
  } catch (e) {
    log(`unable to save cache value for ${cacheKey}`);
  }

  return result;
}

const CONFIG_STEPS = <ConfigStep[]>[
  // first step: select website
  {
    isFilledOut(params: ConnectorParams) {
      return typeof params?.idsite !== 'undefined';
    },
    validate(params?: ConnectorParams) {
      if (!params?.idsite || parseInt(params.idsite, 10) < 0) {
        throwUserError('A website in your Matomo must be selected.');
      }
    },
    addControls(config: GoogleAppsScript.Data_Studio.Config) {
      // add info explaining that authors of Matomo and the connector do not get access to your data
      const link = 'https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes';
      config.newInfo().setId('google-info-notice')
        .setText(
          'Note: The Matomo Connector for Looker Studio\'s use and transfer of information received from Google APIs ' +
          `to any other app will adhere to Google API Services User Data Policy (${link}), including the Limited Use ` +
          'requirements.'
        );

      const reportTemplateLink = 'https://matomo.org/faq/looker-studio/matomo-connector-template-report/';
      config.newInfo().setId('new-to-looker')
        .setText(
          `New to Looker Studio? Get started quickly with our template Matomo report: ${reportTemplateLink}`
        );

      const matomoVersion = getMatomoVersion();
      if (matomoVersion.major < 4
        || (matomoVersion.major === 4 && matomoVersion.minor < 14)
      ) {
        config.newInfo()
          .setId('matomo-4-warning')
          .setText(`WARNING: You are trying to connect to a version ${matomoVersion.major}.${matomoVersion.minor} Matomo. This connector ` +
            'works best with version 4.14 or greater. Other versions will not be able to provide Looker Studio ' +
            'with all necessary information.');
      }

      const sitesWithViewAccess = getSitesWithAtLeastViewAccess();

      // idsite select
      let idSiteSelect = config
        .newSelectSingle()
        .setId('idsite')
        .setName('Website/Measurable')
        .setIsDynamic(true);

      sitesWithViewAccess.forEach((site) => {
        idSiteSelect = idSiteSelect.addOption(config.newOptionBuilder().setLabel(site.name).setValue(`${site.idsite}`));
      });
    },
  },

  // second step: pick report and set request defaults
  {
    isFilledOut(params?: ConnectorParams) {
      return typeof params?.report !== 'undefined'
        && typeof params.segment !== 'undefined';
    },
    validate(params?: ConnectorParams) {
      const report = (params?.report || '').trim();
      if (!report) {
        throwUserError('Please select a Matomo report to connect to.');
      }
    },
    addControls(config: GoogleAppsScript.Data_Studio.Config, params?: ConnectorParams) {
      // check if site currency is supported
      const sites = getSitesWithAtLeastViewAccess();
      const site = sites.find((s) => `${s.idsite}` === `${params.idsite}`);
      if (site?.currency
        && !cc.FieldType[`CURRENCY_${site.currency.toUpperCase()}`]
      ) {
        config.newInfo().setId('cannot-map-matomo-currency').setText(`Warning: The currency your website uses in Matomo (${site.currency}) is not supported `
          + 'in Looker Studio. Revenue metrics will still be imported, but they will be displayed as a number without a currency symbol.');
      }

      const { reportMetadata, hasMetricTypes } = getReportMetadata(params.idsite!);

      // check if Matomo is old and does not have <metricTypes>
      if (!hasMetricTypes) {
        config.newInfo().setId('no-metric-types').setText('Warning: It looks like your using an older version of Matomo with some report metadata missing. '
          + 'Without that metadata this connector won\'t be able to reliably tell Looker Studio how to format Matomo metrics. They will still display, but they may '
          + 'look strange. Please consider updating your Matomo to version 4.14 or later.');
      }

      let reportSelect = config
        .newSelectSingle()
        .setId('report')
        .setName('Report');

      reportMetadata.forEach((report) => {
        const value = JSON.stringify({
          ...report.parameters,
          apiModule: report.module,
          apiAction: report.action,
        });

        reportSelect = reportSelect.addOption(
          config.newOptionBuilder().setLabel(`${report.category} > ${report.name}`).setValue(value),
        );
      });

      // segment select
      const segments = Api.fetch<Api.StoredSegment[]>('SegmentEditor.getAll', {
        idSite: params.idsite!,
        filter_limit: '-1',
      }, {
        cacheKey: `getConfig.SegmentEditor.getAll.${params.idsite!}`,
        cacheTtl: CONFIG_REQUEST_CACHE_TTL_SECS,
      });

      let segmentSelect = config
        .newSelectSingle()
        .setId('segment')
        .setName('Segment')
        .setAllowOverride(true)
        .addOption(config.newOptionBuilder().setLabel('All Visits').setValue(''));

      segments.forEach((segment) => {
        segmentSelect = segmentSelect.addOption(
          config.newOptionBuilder().setLabel(segment.name).setValue(segment.definition),
        );
      });

      // report language select
      const languages = Api.fetch<Api.Language[]>('LanguagesManager.getAvailableLanguageNames');

      let reportLanguage = config
        .newSelectSingle()
        .setId('language')
        .setName('Report Language')
        .setHelpText('The language to use for report column names. If unset, defaults to the language you\'ve selected in your Google account.');

      languages.forEach((language) => {
        reportLanguage = reportLanguage.addOption(
          config.newOptionBuilder().setLabel(language.name).setValue(language.code),
        );
      });

      // filter_truncate input (named filter_limit originally, which was incorrect, but
      // changing it will break existing user configurations, so it's stuck like this)
      config
        .newTextInput()
        .setId('filter_limit')
        .setName('Default Row Limit')
        .setAllowOverride(true)
        .setHelpText('A number that sets the maximum number of rows fetched from Matomo. By default the connector will try '
          + 'and fetch every row of the report you selected, but in some cases this can be too much data, and Looker Studio '
          + 'will time out trying to get it all. In this case you may want to set a hard limit here.');
    },
  },
];

function getCurrentStep(request: GoogleAppsScript.Data_Studio.Request<ConnectorParams>) {
    const configParams = request.configParams;

    if (!configParams) {
        return 0;
    }

    const stepsReversed = [...CONFIG_STEPS].reverse();
    return stepsReversed.length - stepsReversed.findIndex((step) => step.isFilledOut(configParams));
}

export function getConfig(request: GoogleAppsScript.Data_Studio.Request<ConnectorParams>) {
  return callWithUserFriendlyErrorHandling('getConfig()', () => {
    debugLog('getConfig(): request is', request);

    const configParams = request.configParams;

    const currentStep = getCurrentStep(request);

    debugLog('getConfig(): current step is', currentStep);

    const config = cc.getConfig();
    if (currentStep < CONFIG_STEPS.length - 1) {
      config.setIsSteppedConfig(true);
    }

    CONFIG_STEPS.forEach((step, index) => {
      if (currentStep >= index) {
        if (currentStep - 1 === index && step.validate) { // validate previous step entry
          step.validate(configParams);
        }

        step.addControls(config, configParams);
      }
    });

    if (currentStep >= CONFIG_STEPS.length - 1) {
      config.setIsSteppedConfig(false);
      config.setDateRangeRequired(true);
    }

    const result = config.build();

    debugLog('getConfig(): result is', result);

    return result;
  });
}
