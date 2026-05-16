/**
 * pages/api/setup-webhook.js
 *
 * Call this ONCE to register your Railway URL as the Telegram webhook.
 * After this, Telegram will automatically POST to your server whenever
 * a new message is posted to the channel.
 *
 * Usage: Visit https://your-railway-url.up.railway.app/api/setup-webhook
 */

export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const railwayUrl = process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : process.env.APP_URL;

  if (!token) {
    return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not set in environment variables.' });
  }

  if (!railwayUrl) {
    return res.status(500).json({
      error: 'Could not determine app URL. Add APP_URL environment variable with your Railway URL.',
      example: 'https://portfolio-generator-production.up.railway.app',
    });
  }

  const webhookUrl = `${railwayUrl}/api/telegram-webhook`;

  try {
    // Register the webhook with Telegram
    const setRes = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ['channel_post', 'message'],
          drop_pending_updates: false,
        }),
      }
    );

    const setData = await setRes.json();

    if (!setData.ok) {
      throw new Error(`Telegram setWebhook failed: ${setData.description}`);
    }

    // Verify webhook info
    const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const infoData = await infoRes.json();

    return res.status(200).json({
      success: true,
      message: `Webhook registered! Telegram will now POST to: ${webhookUrl}`,
      webhookInfo: infoData.result,
      nextStep: 'Post a CSV file to your Telegram channel. It will be automatically received.',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}