"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import {
    BotIcon,
    DownloadIcon,
    GlobeIcon,
    MessageSquarePlusIcon,
    Trash2Icon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Message,
    MessageAvatar,
    MessageContent,
    MessageFooter,
    MessageGroup,
} from "@/components/ui/message";
import {
    MessageScroller,
    MessageScrollerButton,
    MessageScrollerContent,
    MessageScrollerItem,
    MessageScrollerProvider,
    MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
    buildCitationMap,
    chatKeys,
    useConversationMessages,
    useConversations,
    useCreateConversation,
    useDeleteConversation,
} from "../hooks/use-conversations";
import { ChatMessageBody } from "./chat-message-body";
import { CitationSources } from "./citation-sources";
import { ChatComposer } from "./chat-composer";
import type { ChatCitation, Conversation } from "../lib/types";
import { workspaceRoutes } from "@/features/workspaces/lib/routes";
import { useSession } from "@/features/auth/hooks/use-session";
import {
    useChatPreferences,
    useWorkspaceChatPrefs,
} from "../stores/chat-preferences";
import {
    downloadMarkdown,
    exportConversationMarkdown,
} from "../lib/export-chat";

type WorkspaceChatProps = {
    workspaceId: string;
    defaultModel?: string;
};

function getMessageText(message: UIMessage) {
    return message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("");
}

function buildConversationTitle(text: string) {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized) {
        return "New chat";
    }

    return normalized.length > 72
        ? `${normalized.slice(0, 72).trim()}…`
        : normalized;
}

function getLastUserMessageTextFromBody(init?: RequestInit) {
    if (!init?.body || typeof init.body !== "string") {
        return null;
    }

    try {
        const parsed = JSON.parse(init.body) as {
            messages?: Array<{
                role?: string;
                parts?: Array<{ type?: string; text?: string }>;
            }>;
        };
        const uiMessages = parsed.messages;
        if (!Array.isArray(uiMessages)) {
            return null;
        }

        for (let index = uiMessages.length - 1; index >= 0; index -= 1) {
            const message = uiMessages[index];
            if (message?.role !== "user" || !message.parts) {
                continue;
            }

            const text = message.parts
                .filter((part) => part.type === "text")
                .map((part) => part.text ?? "")
                .join("")
                .trim();

            if (text) {
                return text;
            }
        }
    } catch {
        return null;
    }

    return null;
}

function getUserInitials(name?: string | null) {
    if (!name?.trim()) {
        return "U";
    }

    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}

export function WorkspaceChat({
    workspaceId,
    defaultModel,
}: WorkspaceChatProps) {
    const queryClient = useQueryClient();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { data: session } = useSession();
    const askPrompt = searchParams.get("ask");
    const handledAskPrompt = useRef<string | null>(null);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const [citationsByMessageId, setCitationsByMessageId] = useState<
        Record<string, ChatCitation[]>
    >({});

    const setWebSearch = useChatPreferences((state) => state.setWebSearch);
    const chatPrefs = useWorkspaceChatPrefs(workspaceId, defaultModel);

    const { data: conversations = [], isLoading: conversationsLoading } =
        useConversations(workspaceId);
    const { data: storedMessages, isLoading: messagesLoading } =
        useConversationMessages(workspaceId, conversationId);
    const createConversation = useCreateConversation(workspaceId);
    const deleteConversation = useDeleteConversation(workspaceId);

    const activeConversation = conversations.find(
        (conversation) => conversation.id === conversationId,
    );

    const handleConversationId = useCallback(
        (id: string, title?: string | null) => {
            setConversationId(id);

            queryClient.setQueryData<Conversation[]>(
                chatKeys(workspaceId).conversations(),
                (existing) => {
                    const optimistic: Conversation = {
                        id,
                        workspaceId,
                        title: title ?? null,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    };

                    if (!existing) {
                        return [optimistic];
                    }

                    if (existing.some((conversation) => conversation.id === id)) {
                        return existing;
                    }

                    return [optimistic, ...existing];
                },
            );

            void queryClient.invalidateQueries({
                queryKey: chatKeys(workspaceId).conversations(),
            });
        },
        [queryClient, workspaceId],
    );

    const transport = useMemo(
        () =>
            new DefaultChatTransport({
                api: `/api/workspaces/${workspaceId}/chat`,
                credentials: "include",
                body: {
                    ...(conversationId ? { conversationId } : {}),
                    model: chatPrefs.model,
                    webSearch: chatPrefs.webSearch,
                },
                fetch: async (url, init) => {
                    const response = await fetch(url, {
                        ...init,
                        credentials: "include",
                    });

                    const newConversationId =
                        response.headers.get("X-Conversation-Id");
                    if (newConversationId) {
                        const userText = getLastUserMessageTextFromBody(init);
                        const title = userText
                            ? buildConversationTitle(userText)
                            : null;
                        handleConversationId(newConversationId, title);
                    }

                    return response;
                },
            }),
        [
            workspaceId,
            conversationId,
            handleConversationId,
            chatPrefs.model,
            chatPrefs.webSearch,
        ],
    );

    const { messages, sendMessage, setMessages, status, error } = useChat({
        transport,
    });

    const isStreaming = status === "streaming" || status === "submitted";

    const conversationLabel = useMemo(() => {
        if (!conversationId) {
            return "New chat";
        }

        if (activeConversation?.title) {
            return activeConversation.title;
        }

        const firstUserMessage = messages.find(
            (message) => message.role === "user",
        );
        if (firstUserMessage) {
            return buildConversationTitle(getMessageText(firstUserMessage));
        }

        return "Untitled chat";
    }, [conversationId, activeConversation?.title, messages]);

    const hasConversationInList = conversationId
        ? conversations.some((conversation) => conversation.id === conversationId)
        : false;

    useEffect(() => {
        if (!conversationId) {
            setMessages([]);
            setCitationsByMessageId({});
            return;
        }

        if (!storedMessages || isStreaming) {
            return;
        }

        setMessages(
            storedMessages.map((message) => ({
                id: message.id,
                role: message.role === "USER" ? "user" : "assistant",
                parts: [{ type: "text" as const, text: message.content }],
            })),
        );
        setCitationsByMessageId(buildCitationMap(storedMessages));
    }, [conversationId, storedMessages, setMessages, isStreaming]);

    useEffect(() => {
        if (status !== "ready" || !conversationId) {
            return;
        }

        void queryClient.invalidateQueries({
            queryKey: chatKeys(workspaceId).messages(conversationId),
        });
    }, [status, conversationId, queryClient, workspaceId]);

    useEffect(() => {
        if (!storedMessages || status === "streaming") {
            return;
        }

        setCitationsByMessageId(buildCitationMap(storedMessages));
    }, [storedMessages, status]);

    useEffect(() => {
        if (
            !askPrompt ||
            status !== "ready" ||
            conversationId ||
            messages.length > 0 ||
            handledAskPrompt.current === askPrompt
        ) {
            return;
        }

        handledAskPrompt.current = askPrompt;
        void sendMessage({ text: askPrompt });
        router.replace(workspaceRoutes.detail(workspaceId));
    }, [
        askPrompt,
        status,
        conversationId,
        messages.length,
        sendMessage,
        router,
        workspaceId,
    ]);

    async function handleNewChat() {
        setConversationId(null);
        setMessages([]);
        setCitationsByMessageId({});
    }

    async function handleDeleteConversation() {
        if (!conversationId) {
            return;
        }

        await deleteConversation.mutateAsync(conversationId);
        await handleNewChat();
    }

    function handleExportChat() {
        if (messages.length === 0) {
            return;
        }

        const markdown = exportConversationMarkdown({
            conversation: activeConversation ?? null,
            messages,
            citationsByMessageId,
        });
        const slug =
            activeConversation?.title?.replace(/[^\w-]+/g, "-").toLowerCase() ??
            "chat";
        downloadMarkdown(markdown, `${slug}-${Date.now()}.md`);
    }

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-2 border-b bg-background px-4 py-3">
                <Select
                    value={conversationId ?? "new"}
                    onValueChange={(value) => {
                        if (value === "new") {
                            void handleNewChat();
                            return;
                        }
                        setConversationId(value);
                    }}
                >
                    <SelectTrigger className="max-w-sm flex-1">
                        <SelectValue placeholder="New chat" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="new">New chat</SelectItem>
                        {conversationId && !hasConversationInList ? (
                            <SelectItem value={conversationId}>
                                {conversationLabel}
                            </SelectItem>
                        ) : null}
                        {conversations.map((conversation) => (
                            <SelectItem
                                key={conversation.id}
                                value={conversation.id}
                            >
                                {conversation.title ?? "Untitled chat"}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleNewChat()}
                >
                    <MessageSquarePlusIcon />
                    New
                </Button>

                <Button
                    variant="outline"
                    size="sm"
                    disabled={messages.length === 0}
                    onClick={handleExportChat}
                >
                    <DownloadIcon />
                    Export
                </Button>

                {conversationId ? (
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => void handleDeleteConversation()}
                        disabled={deleteConversation.isPending}
                    >
                        <Trash2Icon />
                    </Button>
                ) : null}
            </div>

            <MessageScrollerProvider>
                <MessageScroller className="min-h-0 flex-1">
                    <MessageScrollerViewport>
                        <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-6">
                            {conversationsLoading ||
                            (messagesLoading && messages.length === 0) ? (
                                <div className="space-y-4">
                                    <Skeleton className="h-16 w-2/3 rounded-3xl" />
                                    <Skeleton className="ml-auto h-16 w-1/2 rounded-3xl" />
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                                    <div className="rounded-full bg-muted p-3">
                                        <BotIcon className="size-6" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-medium">
                                            Chat with your sources
                                        </p>
                                        <p className="max-w-sm text-sm text-muted-foreground">
                                            Ask questions about the materials
                                            in this workspace. Answers include
                                            citations when relevant context is
                                            found.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <MessageGroup className="gap-6">
                                    {messages.map((message, messageIndex) => {
                                        const isUser = message.role === "user";
                                        const citations =
                                            citationsByMessageId[message.id];
                                        const isLastMessage =
                                            messageIndex === messages.length - 1;
                                        const isAnimatingMessage =
                                            !isUser &&
                                            isStreaming &&
                                            isLastMessage;

                                        return (
                                            <MessageScrollerItem
                                                key={message.id}
                                                scrollAnchor
                                            >
                                                <Message
                                                    align={
                                                        isUser ? "end" : "start"
                                                    }
                                                >
                                                    {isUser ? (
                                                        <MessageAvatar className="size-8">
                                                            <Avatar className="size-8">
                                                                {session?.user
                                                                    ?.image ? (
                                                                    <AvatarImage
                                                                        src={
                                                                            session
                                                                                .user
                                                                                .image
                                                                        }
                                                                        alt={
                                                                            session
                                                                                .user
                                                                                .name
                                                                        }
                                                                    />
                                                                ) : null}
                                                                <AvatarFallback>
                                                                    {getUserInitials(
                                                                        session
                                                                            ?.user
                                                                            ?.name,
                                                                    )}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                        </MessageAvatar>
                                                    ) : (
                                                        <MessageAvatar className="size-8 self-start group-has-data-[slot=message-footer]/message:translate-y-0">
                                                            <BotIcon className="size-4" />
                                                        </MessageAvatar>
                                                    )}
                                                    <MessageContent>
                                                        <Bubble
                                                            align={
                                                                isUser
                                                                    ? "end"
                                                                    : "start"
                                                            }
                                                            variant={
                                                                isUser
                                                                    ? "default"
                                                                    : "ghost"
                                                            }
                                                        >
                                                            <BubbleContent className="leading-relaxed">
                                                                {isUser ? (
                                                                    getMessageText(
                                                                        message,
                                                                    )
                                                                ) : (
                                                                    <ChatMessageBody
                                                                        text={getMessageText(
                                                                            message,
                                                                        )}
                                                                        citations={
                                                                            citations
                                                                        }
                                                                        workspaceId={
                                                                            workspaceId
                                                                        }
                                                                        isAnimating={
                                                                            isAnimatingMessage
                                                                        }
                                                                    />
                                                                )}
                                                            </BubbleContent>
                                                        </Bubble>
                                                        {!isUser &&
                                                        citations?.length ? (
                                                            <MessageFooter className="mt-1 w-full max-w-full flex-col items-start gap-0 px-0">
                                                                <CitationSources
                                                                    workspaceId={
                                                                        workspaceId
                                                                    }
                                                                    citations={
                                                                        citations
                                                                    }
                                                                />
                                                            </MessageFooter>
                                                        ) : null}
                                                    </MessageContent>
                                                </Message>
                                            </MessageScrollerItem>
                                        );
                                    })}
                                </MessageGroup>
                            )}
                        </MessageScrollerContent>
                    </MessageScrollerViewport>
                    <MessageScrollerButton direction="end" />
                </MessageScroller>
            </MessageScrollerProvider>

            {error ? (
                <div className="shrink-0 border-t bg-destructive/5 px-4 py-2 text-sm text-destructive">
                    {error.message}
                </div>
            ) : null}

            <ChatComposer
                disabled={createConversation.isPending}
                isStreaming={isStreaming}
                webSearchEnabled={chatPrefs.webSearch}
                onWebSearchChange={(enabled) =>
                    setWebSearch(workspaceId, enabled)
                }
                onSubmit={(text) => {
                    void sendMessage({ text });
                }}
            />
        </div>
    );
}
