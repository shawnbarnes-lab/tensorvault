// electron-builder custom signing hook for Azure Trusted Signing
// Invoked automatically during `npm run dist` when win.sign is set in package.json
//
// Prerequisites:
//   az extension add --name trustedsigning
//   az login
//
// Set these environment variables (or edit the defaults below):
//   AZURE_SIGNING_ENDPOINT
//   AZURE_SIGNING_ACCOUNT
//   AZURE_SIGNING_CERT_PROFILE

const { execSync } = require('child_process');
const path = require('path');

exports.default = async function (configuration) {
  const filePath = configuration.path;
  if (!filePath) return;

  const endpoint = process.env.AZURE_SIGNING_ENDPOINT;
  const account = process.env.AZURE_SIGNING_ACCOUNT;
  const certProfile = process.env.AZURE_SIGNING_CERT_PROFILE;

  if (!endpoint || !account || !certProfile) {
    console.warn('[sign] Azure signing env vars not set — skipping code signing.');
    console.warn('[sign] Set AZURE_SIGNING_ENDPOINT, AZURE_SIGNING_ACCOUNT, AZURE_SIGNING_CERT_PROFILE');
    return;
  }

  console.log(`[sign] Signing ${path.basename(filePath)} with Azure Trusted Signing…`);

  try {
    execSync(
      `az trustedsigning sign ` +
      `--azure-key-vault-url "${endpoint}" ` +
      `--account "${account}" ` +
      `--certificate-profile-name "${certProfile}" ` +
      `--files "${filePath}" ` +
      `--timestamp-url "http://timestamp.acs.microsoft.com"`,
      { stdio: 'inherit', timeout: 120000 }
    );
    console.log(`[sign] Signed successfully: ${path.basename(filePath)}`);
  } catch (err) {
    console.error(`[sign] Signing failed: ${err.message}`);
    console.error('[sign] Continuing without signature — sign manually later.');
  }
};
