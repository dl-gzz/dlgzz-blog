import { join } from "node:path";
import * as dotenv from "dotenv";
import { searchKnowledgeChunks } from "@/lib/knowledge-search";

dotenv.config({ path: join(process.cwd(), ".env") });
dotenv.config({ path: join(process.cwd(), ".env.local"), override: true });

function getSnippetTerms(query: string) {
	const terms = new Set(
		query
			.replace(/[，。！？、；：,.!?;:]/g, " ")
			.split(/\s+/)
			.map((term) => term.trim())
			.filter((term) => term.length >= 2),
	);
	if (/预包装|食品|许可证|备案|资质|酒|母婴|保健|医疗器械/.test(query)) {
		[
			"预包装食品备案凭证",
			"可提供《预包装食品备案凭证》",
			"仅销售预包装食品",
			"备案凭证",
			"食品经营许可证",
			"食品生产许可证",
		].forEach((term) => terms.add(term));
	}
	return [...terms].sort((a, b) => b.length - a.length);
}

function buildSnippet(content: string, query: string) {
	const normalized = content.replace(/\s+/g, " ");
	const terms = getSnippetTerms(query);
	const lowerContent = normalized.toLowerCase();
	const matchIndex = terms.reduce((best, term) => {
		const index = lowerContent.indexOf(term.toLowerCase());
		if (index < 0) return best;
		return best < 0 ? index : Math.min(best, index);
	}, -1);
	const center = matchIndex >= 0 ? matchIndex : 0;
	const start = Math.max(0, center - 120);
	const end = Math.min(normalized.length, center + 360);
	return `${start > 0 ? "..." : ""}${normalized.slice(start, end)}${
		end < normalized.length ? "..." : ""
	}`;
}

async function main() {
	const query = process.argv.slice(2).join(" ").trim();
	if (!query) {
		throw new Error('Usage: pnpm knowledge:xhs:search "没有营业执照能开店吗"');
	}

	const results = await searchKnowledgeChunks(query, {
		packId: "xhs-open-shop-v1",
		limit: 5,
	});

	console.log(`Query: ${query}`);
	console.log(`Results: ${results.length}`);

	for (const [index, result] of results.entries()) {
		console.log(`\n${index + 1}. ${result.title}`);
		console.log(`   Source: ${result.source} / ${result.category}`);
		console.log(`   Heading: ${result.heading || "-"}`);
		console.log(`   Score: ${result.score.toFixed(3)}`);
		console.log(`   Path: ${result.filePath}`);
		console.log(`   Snippet: ${buildSnippet(result.content, query)}`);
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
