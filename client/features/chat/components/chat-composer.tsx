"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { GlobeIcon, Loader2Icon, SendIcon } from "lucide-react";
import { useEffect, useState } from "react";



type ChatComposerProps = {
    onSubmit: (text: string) => void;
    disabled?: boolean
    isStreaming?: boolean;
    webSearchEnabled?: boolean;
    onWebSearchChange?: (enabled: boolean) => void;
}


export function ChatComposer({
    onSubmit,
    disabled = false,
    isStreaming = false,
    webSearchEnabled = false,
    onWebSearchChange,
}: ChatComposerProps) {
    const [input, setInput] = useState("");
    const [prefsReady, setPrefsReady] = useState(false);

    useEffect(() => {
        setPrefsReady(true);
    }, []);

    const searchEnabled = prefsReady && webSearchEnabled;

    function handleSubmit(event: React.FormEvent) {
        event.preventDefault();
        const text = input.trim();
        if (!text || disabled || isStreaming) {
            return;
        }

        onSubmit(text);
        setInput("");
    }

    return (
        <form
            onSubmit={handleSubmit}
            className="shrink-0 border-t bg-background p-4"
        >
            <div className="mx-auto flex max-w-3xl flex-col gap-2">
                {onWebSearchChange ? (
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant={searchEnabled ? "secondary" : "outline"}
                            className={cn(
                                "rounded-full",
                                searchEnabled && "border-primary/30",
                            )}
                            onClick={() =>
                                onWebSearchChange(!webSearchEnabled)
                            }
                            disabled={disabled || isStreaming}
                        >
                            <GlobeIcon />
                            Web search
                        </Button>
                        {searchEnabled ? (
                            <span className="text-xs text-muted-foreground">
                                Tavily will search the web when needed
                            </span>
                        ) : null}
                    </div>
                ) : null}

                <div className="flex items-end gap-2">
                    <Textarea
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        placeholder="Ask about your sources…"
                        rows={1}
                        className="min-h-11 max-h-40 min-w-0 flex-1 resize-none"
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                handleSubmit(event);
                            }
                        }}
                        disabled={disabled || isStreaming}
                    />
                    <Button
                        type="submit"
                        size="icon"
                        className="size-11 shrink-0"
                        disabled={disabled || isStreaming || !input.trim()}
                    >
                        {isStreaming ? (
                            <Loader2Icon className="animate-spin" />
                        ) : (
                            <SendIcon />
                        )}
                    </Button>
                </div>
            </div>
        </form>
    )
}