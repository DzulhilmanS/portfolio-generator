/**
 * pages/api/fetch-csv.js
 *
 * Fetches the latest CSV file from a Telegram channel via the Bot API.
 *
 * Requirements:
 *   - TELEGRAM_BOT_TOKEN env var: your bot token from @BotFather
 *   - Bot must be added as Admin to the channel
 *
 * Flow:
 *   1. getUpdates (limit=100) to find the most recent document message from the channel
 *   2. getFile to get the download path
 *   3. Download the file content
 *   4. Return it as text
 */

const TG_API = `https://api.telegram.org/bot`;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({
      error: 'TELEGRAM_BOT_TOKEN is not configured. Add it to your environment variables.',
    });
  }

  try {
    // Step 1: Get recent updates (up to 100)
    // Note: Telegram Bot API returns updates since the last acknowledged offset.
    // On fresh deployment this may return nothing if all updates are old.
    // We use offset=-100 to get the last 100 updates regardless.
    const updatesRes = await fetch(`${TG_API}${token}/getUpdates?limit=100&offset=-100`, {
      method: 'GET',
    });

    if (!updatesRes.ok) {
      const errText = await updatesRes.text();
      throw new Error(`Telegram getUpdates failed: ${updatesRes.status} — ${errText}`);
    }

    const updatesData = await updatesRes.json();

    if (!updatesData.ok) {
      throw new Error(`Telegram API error: ${updatesData.description}`);
    }

    const updates = updatesData.result ?? [];

    // Step 2: Find the most recent channel_post or message with a CSV document
    // Search in reverse (newest first)
    let targetFileId = null;
    let targetFileName = null;

    for (let i = updates.length - 1; i >= 0; i--) {
      const update = updates[i];
      const message = update.channel_post ?? update.message ?? null;
      if (!message) continue;

      const doc = message.document;
      if (!doc) continue;

      const mime = doc.mime_type ?? '';
      const fname = doc.file_name ?? '';

      // Accept CSV files (mime type or .csv extension)
      if (mime === 'text/csv' || mime === 'text/plain' || fname.toLowerCase().endsWith('.csv')) {
        targetFileId = doc.file_id;
        targetFileName = fname;
        break;
      }
    }

    if (!targetFileId) {
      // Try a second pass: look in any message type (in case mime type is wrong)
      for (let i = updates.length - 1; i >= 0; i--) {
        const update = updates[i];
        const message = update.channel_post ?? update.message ?? null;
        if (!message?.document) continue;
        const fname = message.document.file_name ?? '';
        if (fname.toLowerCase().includes('buycall') || fname.toLowerCase().endsWith('.csv')) {
          targetFileId = message.document.file_id;
          targetFileName = fname;
          break;
        }
      }
    }

    if (!targetFileId) {
      return res.status(404).json({
        error:
          'No CSV file found in recent Telegram channel messages. ' +
          'Make sure the bot is an admin in the channel and a CSV was posted recently. ' +
          'Alternatively, upload the CSV manually.',
        updatesFound: updates.length,
      });
    }

    // Step 3: Get the file download path
    const fileRes = await fetch(`${TG_API}${token}/getFile?file_id=${targetFileId}`);
    const fileData = await fileRes.json();

    if (!fileData.ok) {
      throw new Error(`getFile failed: ${fileData.description}`);
    }

    const filePath = fileData.result.file_path;

    // Step 4: Download the actual file
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
    });
  } catch (err) {
    console.error('fetch-csv error:', err);
    return res.status(500).json({
      error: err.message ?? 'Unknown error fetching CSV from Telegram',
    });
  }
}
