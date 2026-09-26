import Link from "next/link";
import type { Tool } from "@/lib/types";
import { FlowChips } from "./FormatChip";
import { newSlugs } from "@/lib/changelog";
import { Icon, toolIcon } from "./Icon";

const FRESH = newSlugs(30);

export function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Link href={`/tools/${tool.slug}`} className="card tool">
      <span className="tool-top">
        <span className="tool-ico"><Icon name={toolIcon(tool.slug, tool.cat)} size={18} /></span>
        <FlowChips from={tool.from} to={tool.to} flow={tool.flow} size="sm" />
      </span>
      <b>{tool.name}{FRESH.has(tool.slug) && <span className="new-chip">New</span>}</b>
      <span className="muted">{tool.short}</span>
      <Icon name="arrow" size={16} className="tool-go" />
    </Link>
  );
}
