const AWS = require('aws-sdk');
const request = require('request');

const encFirstName = process.env['first_name'];
let decryptedFirstName;

function processEvent(event, context, callback) {
  let data = {
    firstName:
  };

  callback(null, data);
}

exports.handler = (event, context, callback) => {
  if (decryptedFirstName) {
    processEvent(event, context, callback);
  } else {
    const kms = new AWS.KMS();
    kms.decrypt(
      { CiphertextBlob: new Buffer(encFirstName, 'base64') }, (err, data) => {
        if (err) {
          console.log('Decrypt error:', err);
          return callback(err);
        }

        decryptedFirstName = data.Plaintext.toString('ascii');

        processEvent(event, context, callback);

      }));
  }
}
