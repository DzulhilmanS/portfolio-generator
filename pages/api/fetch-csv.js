/**
 * GET /api/fetch-csv
 *
 * Downloads the latest broker buycalls CSV from the Telegram channel.
 *
 * Priority order:
 *  1. TELEGRAM_FILE_ID env var — manual override (fastest, set in Railway)
 *  2. getUpdates — scans recent channel posts for a CSV document
 *  3. ?file_id= query param — browser-cached file_id from localStorage (fallback after server restart)
 */

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token       = process.env.TELEGRAM_BOT_TOKEN;
  const envFileId   = process.env.TELEGRAM_FILE_ID;
  const channelId   = process.env.TELEGRAM_CHANNEL_ID;
  const queryFileId = req.query.file_id; // cached file_id sent by browser localStorage

  if (!token) return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not set in Railway Variables.' });

  // ── Priority 1: TELEGRAM_FILE_ID env var (manual admin override) ─────────
  if (envFileId?.trim()) {
    console.log('[fetch-csv] Using TELEGRAM_FILE_ID env var');
    return downloadAndReturn(token, envFileId.trim(), '', res);
  }

  // ── Priority 2: getUpdates — scan recent channel posts for CSV ───────────
  try {
    const updatesRes  = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100`);
    const updatesData = await updatesRes.json();

    if (updatesData.ok) {
      const updates = updatesData.result || [];
      console.log(`[fetch-csv] getUpdates: ${updates.length} updates received`);

      // Search newest first
      for (let i = updates.length - 1; i >= 0; i--) {
        const u    = updates[i];
        const post = u.channel_post || u.message || u.edited_channel_post || u.edited_message;
        if (!post?.document) continue;

        // If TELEGRAM_CHANNEL_ID is set, only accept posts from that channel
        if (channelId && String(post.chat?.id) !== String(channelId)) continue;

        const doc  = post.document;
        const name = (doc.file_name || '').toLowerCase();

        if (name.endsWith('.csv') || doc.mime_type === 'text/csv' || name.includes('buycall')) {
          console.log(`[fetch-csv] Found CSV in updates: ${doc.file_name}`);
          return downloadAndReturn(token, doc.file_id, doc.file_name || 'buycalls.csv', res);
        }
      }
      console.log('[fetch-csv] No CSV found in getUpdates');
    }
  } catch (e) {
    console.warn('[fetch-csv] getUpdates failed:', e.message);
  }

  // ── Priority 3: browser-cached file_id from localStorage ─────────────────
  if (queryFileId?.trim()) {
    console.log('[fetch-csv] Using browser-cached file_id');
    return downloadAndReturn(token, queryFileId.trim(), '', res);
  }

  return res.status(404).json({
    error: 'No CSV found. Please re-post the CSV file to your Telegram channel and try again.',
    hint: 'Or use Upload CSV to load it manually.',
  });
}

async function downloadAndReturn(token, fileId, filename, res) {
  try {
    // Get the file download path from Telegram
    const infoRes  = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    const infoData = await infoRes.json();

    if (!infoData.ok || !infoData.result?.file_path) {
      return res.status(502).json({
        error: 'Could not get file path from Telegram. The file_id may have expired.',
        hint: 'Re-post the CSV to the channel to refresh it.',
        detail: infoData.description || '',
      });
    }

    // Download the actual file
    const csvRes = await fetch(`https://api.telegram.org/file/bot${token}/${infoData.result.file_path}`);
    if (!csvRes.ok) return res.status(502).json({ error: `Download failed: HTTP ${csvRes.status}` });

    const csvText = await csvRes.text();
    console.log(`[fetch-csv] Downloaded ${csvText.length} bytes — ${filename}`);

    // Return fileId so browser can cache it in localStorage
    return res.status(200).json({
      success: true,
      csvText,
      fileName: filename || 'buycalls.csv',
      fileId,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
