/**
 * pages/api/telegram-webhook.js
 *
 * Telegram calls this URL automatically whenever a new message is posted
 * to your channel (after webhook is registered via /api/setup-webhook).
 *
 * When a CSV file is detected, stores the file_id in memory.
 */

import { setLatestCSV } from '../../lib/telegramStore';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const update = req.body;

    // Telegram sends channel_post for channel messages
    const message = update?.channel_post ?? update?.message ?? null;

    if (message?.document) {
      const doc = message.document;
      const fname = (doc.file_name ?? '').toLowerCase();
      const mime = doc.mime_type ?? '';

      const isCSV =
        mime === 'text/csv' ||
        mime === 'text/plain' ||
        fname.endsWith('.csv');

      if (isCSV) {
        setLatestCSV({
          fileId: doc.file_id,
          fileName: doc.file_name ?? 'buycalls.csv',
        });
        console.log(`Webhook: received CSV "${doc.file_name}"`);
      }
    }

    // Always respond 200 so Telegram doesn't retry
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ ok: true }); // still return 200 to stop retries
  }
}