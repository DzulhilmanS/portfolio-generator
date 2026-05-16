/**
 * pages/api/fetch-csv.js
 *
 * Returns the latest CSV that was received via Telegram webhook.
 * Falls back to getUpdates if webhook hasn't delivered anything yet.
 */

import { getLatestCSV } from '../../lib/telegramStore';

const TG_API = `https://api.telegram.org/bot`;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN is not configured.' });
  }

  try {
    // First: check in-memory store (populated by webhook)
    const stored = getLatestCSV();
    let fileId = stored?.fileId ?? null;
    let fileName = stored?.fileName ?? null;

    // Fallback: try getUpdates if webhook hasn't fired yet
    if (!fileId) {
      console.log('No webhook data — falling back to getUpdates...');
      const updatesRes = await fetch(`${TG_API}${token}/getUpdates?limit=100`);
      const updatesData = await updatesRes.json();
      const updates = updatesData?.result ?? [];

      for (let i = updates.length - 1; i >= 0; i--) {
        const msg = updates[i]?.channel_post ?? updates[i]?.message ?? null;
        if (!msg?.document) continue;
        const doc = msg.document;
        const fname = (doc.file_name ?? '').toLowerCase();
        const mime = doc.mime_type ?? '';
        if (mime === 'text/csv' || mime === 'text/plain' || fname.endsWith('.csv')) {
          fileId = doc.file_id;
          fileName = doc.file_name ?? 'buycalls.csv';
          break;
        }
      }

      if (!fileId) {
        return res.status(404).json({
          error:
            'No CSV found. Please set up the webhook first by visiting /api/setup-webhook, ' +
            'then re-post the CSV to your Telegram channel.',
          tip: 'Or use Upload CSV which always works.',
          updatesChecked: updates.length,
        });
      }
    }

    // Download the file using the file_id
    const fileRes = await fetch(`${TG_API}${token}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();

    if (!fileData.ok) {
      throw new Error(`getFile failed: ${fileData.description}`);
    }

    const filePath = fileData.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const csvRes = await fetch(downloadUrl);

    if (!csvRes.ok) {
      throw new Error(`File download failed: HTTP ${csvRes.status}`);
    }

    const csvText = await csvRes.text();

    return res.status(200).json({
      success: true,
      fileName: fileName ?? 'buycalls.csv',
      csvText,
      source: stored?.fileId ? 'webhook' : 'getUpdates',
    });

  } catch (err) {
    console.error('fetch-csv error:', err);
    return res.status(500).json({ error: err.message });
  }
}