"use client";

import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/utils/cn";
import type { FileUIPart, SourceDocumentUIPart } from "ai";
import {
  FileIcon,
  FileTextIcon,
  ImageIcon,
  Music4Icon,
  VideoIcon,
  XIcon,
} from "lucide-react";
import type { ComponentProps, HTMLAttributes, ReactNode } from "react";
import { createContext, useContext, useMemo } from "react";

type AttachmentData =
  | (FileUIPart & { id: string })
  | (SourceDocumentUIPart & { id: string });

type AttachmentsVariant = "grid" | "inline" | "list";

interface AttachmentsContextValue {
  data: AttachmentData;
  onRemove?: () => void;
}

const AttachmentsContext = createContext<AttachmentsContextValue | null>(null);
const AttachmentsVariantContext = createContext<AttachmentsVariant>("grid");

const useAttachment = () => {
  const context = useContext(AttachmentsContext);
  if (!context) {
    throw new Error("Attachment components must be used within Attachment");
  }
  return context;
};

export function getMediaCategory(data: AttachmentData):
  | "image"
  | "video"
  | "audio"
  | "document"
  | "source"
  | "unknown" {
  if ("sourceType" in data) {
    return "source";
  }

  if (data.mediaType?.startsWith("image/")) {
    return "image";
  }
  if (data.mediaType?.startsWith("video/")) {
    return "video";
  }
  if (data.mediaType?.startsWith("audio/")) {
    return "audio";
  }
  if (typeof data.mediaType === "string" && data.mediaType.length > 0) {
    return "document";
  }

  return "unknown";
}

export function getAttachmentLabel(data: AttachmentData): string {
  if ("filename" in data && data.filename) {
    return data.filename;
  }
  if ("title" in data && typeof data.title === "string" && data.title) {
    return data.title;
  }

  switch (getMediaCategory(data)) {
    case "image":
      return "Image";
    case "video":
      return "Video";
    case "audio":
      return "Audio";
    case "document":
      return "Document";
    case "source":
      return "Source";
    default:
      return "Attachment";
  }
}

const getFallbackIcon = (category: ReturnType<typeof getMediaCategory>) => {
  switch (category) {
    case "image":
      return <ImageIcon className="size-5" />;
    case "video":
      return <VideoIcon className="size-5" />;
    case "audio":
      return <Music4Icon className="size-5" />;
    case "document":
      return <FileTextIcon className="size-5" />;
    case "source":
      return <FileIcon className="size-5" />;
    default:
      return <FileIcon className="size-5" />;
  }
};

export const Attachments = ({
  className,
  variant = "grid",
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: AttachmentsVariant }) => (
  <AttachmentsVariantContext.Provider value={variant}>
    <div
      className={cn(
        variant === "grid" && "flex flex-wrap gap-2",
        variant === "inline" && "flex flex-wrap gap-2",
        variant === "list" && "flex flex-col gap-2",
        className,
      )}
      {...props}
    />
  </AttachmentsVariantContext.Provider>
);

export const Attachment = ({
  children,
  className,
  data,
  onRemove,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  data: AttachmentData;
  onRemove?: () => void;
}) => {
  const variant = useContext(AttachmentsVariantContext);
  const contextValue = useMemo(() => ({ data, onRemove }), [data, onRemove]);

  return (
    <AttachmentsContext.Provider value={contextValue}>
      <div
        className={cn(
          "group relative overflow-hidden border border-border bg-secondary/30 text-foreground",
          variant === "grid" && "flex h-16 w-16 items-center justify-center rounded-lg",
          variant === "inline" && "inline-flex items-center gap-2 rounded-full px-2.5 py-1.5 text-xs",
          variant === "list" && "flex items-center gap-3 rounded-lg px-3 py-2",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </AttachmentsContext.Provider>
  );
};

export const AttachmentPreview = ({
  className,
  fallbackIcon,
  ...props
}: HTMLAttributes<HTMLDivElement> & { fallbackIcon?: ReactNode }) => {
  const { data } = useAttachment();
  const variant = useContext(AttachmentsVariantContext);
  const category = getMediaCategory(data);

  if ("url" in data && category === "image" && typeof data.url === "string") {
    return (
      <div
        className={cn(
          "overflow-hidden",
          variant === "grid" && "size-full",
          variant === "inline" && "size-5 rounded",
          variant === "list" && "h-12 w-12 shrink-0 rounded-md",
          className,
        )}
        {...props}
      >
        <img
          alt={getAttachmentLabel(data)}
          className="size-full object-cover"
          src={data.url}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center text-muted-foreground",
        variant === "grid" && "size-full",
        variant === "inline" && "size-5",
        variant === "list" && "h-12 w-12 shrink-0 rounded-md bg-background/60",
        className,
      )}
      {...props}
    >
      {fallbackIcon ?? getFallbackIcon(category)}
    </div>
  );
};

export const AttachmentInfo = ({
  className,
  showMediaType = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { showMediaType?: boolean }) => {
  const { data } = useAttachment();
  const variant = useContext(AttachmentsVariantContext);

  if (variant === "grid") {
    return null;
  }

  const mediaType = "mediaType" in data ? data.mediaType : undefined;

  return (
    <div className={cn("min-w-0", className)} {...props}>
      <p className="truncate text-sm font-medium">{getAttachmentLabel(data)}</p>
      {showMediaType && mediaType && (
        <p className="truncate text-xs text-muted-foreground">{mediaType}</p>
      )}
    </div>
  );
};

export const AttachmentRemove = ({
  className,
  label = "Remove attachment",
  ...props
}: ComponentProps<typeof Button> & { label?: string }) => {
  const { onRemove } = useAttachment();
  const variant = useContext(AttachmentsVariantContext);

  if (!onRemove) {
    return null;
  }

  return (
    <Button
      aria-label={label}
      className={cn(
        "absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100",
        variant === "inline" && "static ml-1 opacity-100",
        className,
      )}
      onClick={onRemove}
      size="icon-sm"
      type="button"
      variant="ghost"
      {...props}
    >
      <XIcon className="size-3" />
    </Button>
  );
};

export const AttachmentHoverCard = HoverCard;
export const AttachmentHoverCardTrigger = HoverCardTrigger;

export const AttachmentHoverCardContent = ({
  className,
  ...props
}: ComponentProps<typeof HoverCardContent>) => (
  <HoverCardContent className={cn("w-72", className)} {...props} />
);

export const AttachmentEmpty = ({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground",
      className,
    )}
    {...props}
  />
);
