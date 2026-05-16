/**
 * pages/api/fetch-csv.js
 *
 * Fetches the latest CSV file from a Telegram channel via the Bot API.
 *
 * Requirements:
 *   - TELEGRAM_BOT_TOKEN env var: your bot token from @BotFather
 *   - Bot must be added as Admin to the channel
 *   - CSV must be posted as a file/document in the channel
 */

const TG_API = `https://api.telegram.org/bot`;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({
      error: 'TELEGRAM_BOT_TOKEN is not configured in environment variables.',
    });
  }

  try {
    // Step 1: Get pending updates — NO offset so we always see all unconfirmed updates
    // Telegram keeps unacknowledged updates for 24 hours
    const updatesRes = await fetch(
      `${TG_API}${token}/getUpdates?limit=100&allowed_updates=["channel_post","message"]`,
      { method: 'GET' }
    );

    if (!updatesRes.ok) {
      const errText = await updatesRes.text();
      throw new Error(`Telegram getUpdates failed: ${updatesRes.status} — ${errText}`);
    }

    const updatesData = await updatesRes.json();

    if (!updatesData.ok) {
      throw new Error(`Telegram API error: ${updatesData.description}`);
    }

    const updates = updatesData.result ?? [];

    // Step 2: Find the most recent document that looks like a CSV
    // Search in reverse so we get the newest one first
    let targetFileId = null;
    let targetFileName = null;

    for (let i = updates.length - 1; i >= 0; i--) {
      const update = updates[i];
      const message = update.channel_post ?? update.message ?? null;
      if (!message?.document) continue;

      const doc = message.document;
      const mime = doc.mime_type ?? '';
      const fname = (doc.file_name ?? '').toLowerCase();

      if (
        mime === 'text/csv' ||
        mime === 'text/plain' ||
        fname.endsWith('.csv')
      ) {
        targetFileId = doc.file_id;
        targetFileName = doc.file_name ?? 'buycalls.csv';
        break;
      }
    }

    // Second pass: match by filename keyword
    if (!targetFileId) {
      for (let i = updates.length - 1; i >= 0; i--) {
        const update = updates[i];
        const message = update.channel_post ?? update.message ?? null;
        if (!message?.document) continue;

        const fname = (message.document.file_name ?? '').toLowerCase();
        if (fname.includes('buycall') || fname.includes('tracker') || fname.includes('broker')) {
          targetFileId = message.document.file_id;
          targetFileName = message.document.file_name ?? 'buycalls.csv';
          break;
        }
      }
    }

    if (!targetFileId) {
      return res.status(404).json({
        error:
          'No CSV file found in Telegram channel. ' +
          'Please re-post the CSV file to the channel and try again.',
        updatesReceived: updates.length,
      });
    }

    // Step 3: Get the file download path from Telegram
    const fileRes = await fetch(`${TG_API}${token}/getFile?file_id=${targetFileId}`);
    const fileData = await fileRes.json();

    if (!fileData.ok) {
      throw new Error(`getFile failed: ${fileData.description}`);
    }

    const filePath = fileData.result.file_path;

    // Step 4: Download the actual file content
    const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const csvRes = await fetch(downloadUrl);

    if (!csvRes.ok) {
      throw new Error(`File download failed: HTTP ${csvRes.status}`);
    }

    const csvText = await csvRes.text();

    return res.status(200).json({
      success: true,
      fileName: targetFileName,
      csvText,
      updatesReceived: updates.length,
    });

  } catch (err) {
    console.error('fetch-csv error:', err);
    return res.status(500).json({
      error: err.message ?? 'Unknown error fetching CSV from Telegram',
    });
  }
}