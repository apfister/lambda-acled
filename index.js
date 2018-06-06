require('isomorphic-fetch');
require('isomorphic-form-data');

const AWS = require('aws-sdk');
const moment = require('moment');
const featureService = require('@esri/arcgis-rest-feature-service');
const restAuth = require('@esri/arcgis-rest-auth');

const encrypted = {
  service_user: process.env['service_user'],
  service_pass: process.env['service_pass']
};

let decrypted = {};

const liveFeatureServiceUrl = 'https://services.arcgis.com/LG9Yn2oFqZi5PnO5/arcgis/rest/services/Armed_Conflict_Location_Event_Data_ACLED/FeatureServer/0';

let _SESSION;
let _ACLEDDATA;

const translateToFeatureJson = (data) => {
  return data.map(event => {
    return {
      geometry: {
        x: parseFloat(event.longitude),
        y: parseFloat(event.latitude)
      },
      attributes: {
        data_id: parseInt(event.data_id),
        iso: event.iso,
        event_id_cnty: event.event_id_cnty,
        event_id_no_cnty: event.event_id_no_cnty,
        event_date: moment(event.event_date).format('YYYY-MM-DD'),
        year: parseInt(event.year),
        time_precision: event.time_precision,
        event_type: event.event_type,
        actor1: event.actor1,
        assoc_actor_1: event.assoc_actor_1,
        inter1: event.inter1,
        actor2: event.actor2,
        assoc_actor_2: event.assoc_actor_2,
        inter2: event.inter2,
        interaction: event.interaction,
        region: event.region,
        country: event.country,
        admin1: event.admin1,
        admin2: event.admin2,
        admin3: event.admin3,
        location: event.location,
        latitude: parseFloat(event.latitude),
        longitude: parseFloat(event.longitude),
        geo_precision: event.geo_precision,
        source: event.source,
        source_scale: event.source_scale,
        notes: event.notes,
        fatalities: parseInt(event.fatalities),
        timestamp: event.timestamp,
        iso3: event.iso3
      }
    };
  });
};

const getLiveAcledData = () => {
  const fourteenDaysAgo = moment().subtract(14, 'days').format('YYYY-MM-DD');
  const apiUrl = `https://api.acleddata.com/acled/read?event_date=${fourteenDaysAgo}&event_date_where=%3E=&limit=0`;

  console.log('requesting data from ACLED API ..');
  console.log(`ACLED API request URL :: ${apiUrl}`);

  return fetch(apiUrl)
    .then(response => response.json())
    .then(responseData => {
      if (!responseData) {
        throw new Error('no response data returned from ACLED API');
      } else if (responseData.count === 0 || responseData.data.length === 0) {
        throw new Error('no features from ACLED API returned. exiting ..');
      } else {
        _ACLEDDATA = translateToFeatureJson(responseData.data);
        return Promise.resolve();
      }
    });
};

const deleteLiveFeatures = () => {
  console.log('deleting features ..');
  const deleteParams = {
    url: liveFeatureServiceUrl,
    params: { where: '1=1' },
    authentication: _SESSION
  };
  return featureService.deleteFeatures(deleteParams)
    .catch((error) => {
      throw new Error(error);
    });
};

const insertLiveFeatures = () => {
  console.log('inserting features ..');
  const addParams = {
    url: liveFeatureServiceUrl,
    adds: _ACLEDDATA,
    authentication: _SESSION
  };
  return featureService.addFeatures(addParams)
    .catch((error) => {
      throw new Error(error);
    });
};

const initAuth = () => {
  return new Promise((resolve, reject) => {
    _SESSION = new restAuth.UserSession({
      username: decrypted.service_user,
      password: decrypted.service_pass
    });

    if (!_SESSION) {
      reject(new Error('unable to get authentication setup'));
    }

    resolve();
  });
};

const processEvent = (event, context, callback) => {
  initAuth()
    .then(getLiveAcledData)
    .then(deleteLiveFeatures)
    .then(insertLiveFeatures)
    .then(response => {
      let message = '';
      if (response && response.addResults) {
        message = `successfully added ${response.addResults.length}`;
      } else {
        message = 'unable to insert features';
      }
      callback(null, message);
    })
    .catch(error => {
      callback(error);
    });
};

exports.handler = (event, context, callback) => {
  if (decrypted.service_user && decrypted.service_pass) {
    return processEvent(event, context, callback);
  } else {
    const kms = new AWS.KMS();

    const decryptPromises = [
      kms.decrypt({ CiphertextBlob: Buffer.from(encrypted.service_user, 'base64') }).promise(),
      kms.decrypt({ CiphertextBlob: Buffer.from(encrypted.service_pass, 'base64') }).promise()
    ];

    Promise.all(decryptPromises).then(data => {
      decrypted.service_user = data[0].Plaintext.toString('ascii');
      decrypted.service_pass = data[1].Plaintext.toString('ascii');

      return processEvent(event, context, callback);
    }).catch(err => {
      console.log('Decrypt error: ', err);
      callback(err);
    });
  }
};
