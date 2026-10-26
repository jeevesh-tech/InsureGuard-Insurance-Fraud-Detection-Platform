const { Storage } = require("@google-cloud/storage");
const { v4: uuidv4 } = require("uuid");

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET || "insureguard-claims-jeevesh";

async function createUploadUrl({ claimId, fileName, contentType }) {
  const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
  const objectName = `claims/${claimId}/${uuidv4()}-${safeName}`;
  const [url] = await storage.bucket(bucketName).file(objectName).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType
  });
  return { url, bucket: bucketName, object: objectName, expiresInSeconds: 900 };
}

module.exports = { createUploadUrl };
