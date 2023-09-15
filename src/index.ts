import { Hono } from 'hono';

/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export type Env = {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	CACHE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	// MY_QUEUE: Queue;
};

const app = new Hono<{ Bindings: Env }>();

type EmojiData = Record<string, Array<{ leftEmoji: string; rightEmoji: string; date: string }>>;

const replaceHexCode = (hexCode: string) => {
	return hexCode
		.split('-')
		.map((code) => 'u' + code)
		.join('-');
};

const hexToEmoji = (hexCode: string) => String.fromCodePoint(Number('0x' + withoutFE0F(hexCode)));

const withFE0F = (code: string) => `${code}-fe0f`;
const withoutFE0F = (code: string) => code.replace(/-.+$/, '');

app.get('/:left/:right', async (c) => {
	let emojiData = await c.env.CACHE.get<EmojiData>('emoji-data', 'json');
	if (!emojiData) {
		const res = await fetch('https://raw.githubusercontent.com/xsalazar/emoji-kitchen/main/src/Components/emojiData.json');
		emojiData = (await res.json()) as EmojiData;
	}
	c.executionCtx.waitUntil(c.env.CACHE.put('emoji-data', JSON.stringify(emojiData)));

	const left = c.req.param('left').codePointAt(0)?.toString(16);
	const right = c.req.param('right').codePointAt(0)?.toString(16);
	if (!left || !right) return c.notFound();

	const combos = emojiData[right] ?? emojiData[withFE0F(right)];
	const combo = combos?.find(
		(combo) =>
			([left, withFE0F(left)].includes(combo.leftEmoji) && [right, withFE0F(right)].includes(combo.rightEmoji)) ||
			([left, withFE0F(left)].includes(combo.rightEmoji) && [right, withFE0F(right)].includes(combo.leftEmoji))
	);
	if (!combos || !combo) return c.notFound();

	const url = `https://www.gstatic.com/android/keyboard/emojikitchen/${combo.date}/${replaceHexCode(combo.leftEmoji)}/${replaceHexCode(
		combo.leftEmoji
	)}_${replaceHexCode(combo.rightEmoji)}.png`;
	console.log(url);
	return fetch(url);
});

app.get('/:left', async (c) => {
	let emojiData = await c.env.CACHE.get<EmojiData>('emoji-data', 'json');
	if (!emojiData) {
		const res = await fetch('https://raw.githubusercontent.com/xsalazar/emoji-kitchen/main/src/Components/emojiData.json');
		emojiData = (await res.json()) as EmojiData;
	}
	c.executionCtx.waitUntil(c.env.CACHE.put('emoji-data', JSON.stringify(emojiData)));

	const left = c.req.param('left').codePointAt(0)?.toString(16)!;

	const combos = emojiData[left] ?? emojiData[withFE0F(left)];
	if (!combos) return c.notFound();

	const mapping = Object.fromEntries(combos.map(({ leftEmoji, rightEmoji }) => [hexToEmoji(leftEmoji), hexToEmoji(rightEmoji)]));

	return new Response(
		Object.entries(mapping)
			.map(([l, r]) => `<a href="/${l}/${r}">${l} + ${r}</a><br />`)
			.join('\n'),
		{
			headers: {
				'content-type': 'text/html; charset=utf-8',
			},
		}
	);
});

export default app;
