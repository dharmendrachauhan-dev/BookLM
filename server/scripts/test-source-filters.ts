import { findSourcesByWorkspaceId } from "../src/repositories/source.repository.ts";
import prisma from "../src/lib/db.ts";

import { listSourcesQuerySchema } from "../src/validators/source.validator.ts";

async function main() {
    console.log(
        "parsed",
        listSourcesQuerySchema.parse({
            q: "test",
            type: "PDF",
            status: "FAILED",
        }),
    );
    const sampleSources = await prisma.source.findMany({
        take: 5,
        select: { workspaceId: true, title: true, type: true, status: true },
    });
    console.log("sample sources", sampleSources);

    if (!sampleSources.length) {
        console.log("no sources in db");
        return;
    }

    const ws = sampleSources[0].workspaceId;
    const all = await findSourcesByWorkspaceId(ws);
    const pdf = await findSourcesByWorkspaceId(ws, { type: "PDF" });
    const ready = await findSourcesByWorkspaceId(ws, { status: "READY" });

    const website = await findSourcesByWorkspaceId(ws, { type: "WEBSITE" });
    const failed = await findSourcesByWorkspaceId(ws, { status: "FAILED" });

    console.log("ws", ws);
    console.log("all count", all.length);
    console.log("types", all.map((s) => s.type));
    console.log("statuses", all.map((s) => s.status));
    console.log("pdf count", pdf.length);
    console.log("website count", website.length);
    console.log("ready count", ready.length);
    console.log("failed count", failed.length);

    if (all[0]?.title) {
        const q = all[0].title.slice(0, 3);
        const search = await findSourcesByWorkspaceId(ws, { q });
        console.log("search q", q, "count", search.length);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
