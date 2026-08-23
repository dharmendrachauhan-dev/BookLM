"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { MoreHorizontalIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { SOURCE_TYPE_LABELS } from "../lib/constants";
import { sourceRoutes } from "../lib/routes";
import type { Source } from "../lib/types";
import { SourceStatusBadge } from "./source-status-badge";
import { SourceTypeIcon } from "./source-type-icon";
import { cn } from "@/lib/utils";

type SourceCardProps = {
    source: Source;
    onDelete?: (source: Source) => void;
    onReprocess?: (source: Source) => void;
    className?: string;
    view?: "grid" | "list";
};

export function SourceCard({
    source,
    onDelete,
    onReprocess,
    className,
    view = "grid",
}: SourceCardProps) {
    const href = sourceRoutes.detail(source.workspaceId, source.id);
    const isList = view === "list";
    const meta = (
        <CardDescription
            className={cn(
                "flex flex-wrap items-center gap-x-2 gap-y-1",
                isList && "truncate",
            )}
        >
            <span className={cn(isList && "truncate")}>
                {SOURCE_TYPE_LABELS[source.type]} ·{" "}
                {formatDistanceToNow(new Date(source.createdAt), {
                    addSuffix: true,
                })}
            </span>
            <SourceStatusBadge status={source.status} className="shrink-0" />
        </CardDescription>
    );

    return (
        <Card
            className={cn(
                "group/card relative transition-shadow hover:shadow-md",
                isList ? "h-24" : "h-full min-h-40",
                className,
            )}
        >
            <Link
                href={href}
                className={cn(
                    "h-full rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isList
                        ? "flex items-center gap-3 px-(--card-spacing) pr-12"
                        : "flex flex-col",
                )}
            >
                {isList ? (
                    <>
                        <SourceTypeIcon
                            type={source.type}
                            className="shrink-0"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                            <CardTitle className="truncate group-hover/card:underline">
                                {source.title}
                            </CardTitle>
                            {meta}
                        </div>
                    </>
                ) : (
                    <>
                        <CardHeader className="flex-1">
                            <div className="flex min-w-0 items-start gap-3 pr-9">
                                <SourceTypeIcon
                                    type={source.type}
                                    className="mt-0.5 shrink-0"
                                />
                                <div className="min-w-0 flex-1 space-y-1">
                                    <CardTitle className="line-clamp-2 min-h-10 group-hover/card:underline">
                                        {source.title}
                                    </CardTitle>
                                    {meta}
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="mt-auto">
                            <p
                                className={cn(
                                    "line-clamp-2 text-xs text-muted-foreground",
                                    !source.content && "invisible",
                                )}
                            >
                                {source.content?.slice(0, 120) ?? "No preview"}
                            </p>
                        </CardContent>
                    </>
                )}
            </Link>

            {onDelete || onReprocess ? (
                <div className="absolute top-(--card-spacing) right-(--card-spacing) z-10">
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={
                                <Button
                                    variant="outline"
                                    size="icon-sm"
                                    className="size-8 bg-card shadow-sm"
                                />
                            }
                        >
                            <MoreHorizontalIcon />
                            <span className="sr-only">Open menu</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            {onReprocess ? (
                                <DropdownMenuItem
                                    onClick={() => onReprocess(source)}
                                >
                                    <RefreshCwIcon />
                                    Reprocess
                                </DropdownMenuItem>
                            ) : null}
                            {onDelete ? (
                                <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => onDelete(source)}
                                >
                                    <Trash2Icon />
                                    Delete
                                </DropdownMenuItem>
                            ) : null}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            ) : null}
        </Card>
    );
}
