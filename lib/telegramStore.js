/**
 * lib/telegramStore.js
 *
 * Simple in-memory store for the latest CSV received from Telegram webhook.
 * Works on Railway because it runs a persistent Node.js process.
 * Data survives between requests but resets on server restart/redeploy.
 */

let latestCSV = null;

export function setLatestCSV(data) {
  latestCSV = {
    fileId: data.fileId,
    fileName: data.fileName,
    receivedAt: new Date().toISOString(),
  };
  console.log(`Telegram store: saved file "${data.fileName}" at ${latestCSV.receivedAt}`);
}

export function getLatestCSV() {
  return latestCSV;
}