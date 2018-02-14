const AWS = require('aws-sdk');
const rp = require('request-promise-native');
const moment = require('moment');

const encrypted = {
  service_user: process.env['service_user'],
  service_pass: process.env['service_pass']
};

const liveFeatureServiceUrl = 'https://services.arcgis.com/LG9Yn2oFqZi5PnO5/arcgis/rest/services/Armed_Conflict_Location_Event_Data_ACLED/FeatureServer/0';

let decrypted = {};

let token;

let acledData;

const getToken = function () {
  const tokenParams = {
    method: 'POST',
    uri: 'https://www.arcgis.com/sharing/rest/generateToken',
    json: true,
    formData: {
      username: decrypted.service_user,
      password: decrypted.service_pass,
      referer: 'http://www.arcgis.com',
      f: 'json'
    }
  };

  return rp(tokenParams)
    .then((response) => {
      if (response.error) {
        throw new Error(response.error.message);
      }
      token = response.token;
    });
};

const getUpdatedAcledData = function () {
  const fourteenDaysAgo = moment().subtract(14, 'days').format('YYYY-MM-DD');

  const apiUrl = `https://api.acleddata.com/acled/read?event_date=${fourteenDaysAgo}&event_date_where=%3E=&limit=0`;

  const acledParams = {
    method: 'GET',
    uri: apiUrl,
    json: true
  };

  return rp(acledParams)
    .then((response) => {
      if (!response.data) {
        throw new Error('no response data returned from ACLED API');
      } else if (response.count === 0 || response.data.length === 0) {
        throw new Error(`no data from ACLED using URL :: ${apiUrl}`);
      } else {
        acledData = response.data;
      }
    });
};

const deleteLiveFeatures = function () {
  const deleteParams = {
    method: 'POST',
    uri: `${liveFeatureServiceUrl}/deleteFeatures`,
    json: true,
    qs: {
      token: token
    },
    form: {
      where: '1=1',
      f: 'json'
    }
  };
  return rp(deleteParams);
};

const insertLiveFeatures = function (adds) {
  const addParams = {
    method: 'POST',
    uri: `${liveFeatureServiceUrl}/applyEdits`,
    json: true,
    qs: {
      token: token
    },
    form: {
      adds: JSON.stringify(adds),
      updates: null,
      deletes: null,
      attachments: null,
      rollbackOnFailure: false,
      useGlobalIds: false,
      f: 'json'
    }
  };
  return rp(addParams);
};

const translateToFeatureJson = function (data) {
  return data.map((event) => {
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

function processEvent (event, context, callback) {
  return getToken()
    .then(getUpdatedAcledData)
    .then(deleteLiveFeatures)
    .then((response) => {
      return translateToFeatureJson(acledData);
    })
    .then(insertLiveFeatures)
    .then((response) => {
      let message;
      if (response && response.addResults) {
        message = `successfully added ${response.addResults.length}`;
        callback(null, message);
      } else {
        message = 'unable to insert features ..wtf?';
        callback(message);
      }
    })
    .catch((err) => {
      callback(err);
    });
}

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
