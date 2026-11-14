# Tanaka Matsumoto's AI (optional)

Without this, Tanaka still works: he answers from the website's own text (services, consultation, location, languages)
in English, Japanese, Korean and German. With it, he answers with Claude and can handle any question about the services.

The Claude API key lives only in this Worker as a secret. Never put it in chat.js or any other file in the repository.

## Set up (Cloudflare, free plan)

1. Get a Claude API key at https://console.anthropic.com (API Keys > Create key). Set a monthly spending limit there.
2. https://dash.cloudflare.com > **Workers & Pages** > Create > **Start with Hello World!** (not "Import a repository").
   Name it `tenshi-chat` and click Deploy.
3. **Edit code**: delete what's there, paste all of `worker.js` from this folder, and click Deploy.
4. Worker > **Settings > Variables and Secrets** > Add:
   - `ANTHROPIC_API_KEY`, type **Secret**: your Claude API key
   - optional: `MODEL` (Text, default `claude-haiku-5-5`), `ALLOWED_ORIGINS` (Text) if the site moves to its own domain
5. Copy the Worker's address, like `https://tenshi-chat.yourname.workers.dev`.
6. Put it in `chat.js` at the top: `endpoint: "https://tenshi-chat.yourname.workers.dev"`, run
   `node tools/stamp-assets.mjs`, then commit and push.

If the Worker is down or not set up, Tanaka quietly falls back to the website's own answers.
Each visitor can ask up to 30 questions in 10 minutes; replies are capped at about 500 tokens.
